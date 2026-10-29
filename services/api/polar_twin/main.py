"""FastAPI service for the local Polar Twin prototype."""

import gzip
import json
import os
import sqlite3
import zlib
from contextlib import contextmanager
from datetime import datetime, timezone
from math import ceil
from pathlib import Path
from typing import Literal, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .simulator import (
    STATIONS,
    apply_delayed_shipment,
    apply_generator_fault,
    fuel_outlook,
    make_reading,
)

ALERT_RULE_VERSION = "demo-alerts-v1"
ALERT_THRESHOLDS = {
    "promotion": {
        "warning": {"storm_severity_percent": 70, "generation_available_percent_max": 60,
                    "fuel_percent_max": 65, "inventory_risk": True,
                    "arrival_buffer_days_max": 7},
        "critical": {"storm_severity_percent": 90, "generation_available_percent_max": 25,
                     "fuel_percent_max": 45, "shortfall_days_min": 7},
    },
    "recovery": {
        "critical_to_warning": {"storm_severity_percent_below": 85,
                                "generation_available_percent_above": 35,
                                "fuel_percent_above": 50, "shortfall_days_below": 3},
        "warning_to_normal": {"storm_severity_percent_below": 60,
                              "generation_available_percent_above": 70,
                              "fuel_percent_above": 70, "inventory_risk": False,
                              "arrival_buffer_days_above": 10},
    },
    "promotion_duration_seconds": 10,
    "recovery_duration_seconds": 20,
}
HEALTH_WEIGHTS = {"energy": 0.25, "infrastructure": 0.25, "inventory": 0.25, "environment": 0.25}

DATA_DIR = Path(os.environ.get("POLAR_TWIN_DATA_DIR", Path(__file__).resolve().parents[1] / "data"))
DB_PATH = DATA_DIR / "prototype.sqlite3"

app = FastAPI(title="Polar Twin Prototype API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Content-Encoding"],
)

STATES = {
    "draft", "submitted", "in_review", "approved", "rejected",
    "changes_requested", "dispatched", "delivered", "closed",
}


class Actor(BaseModel):
    role: Literal["station_leader", "logistics", "management"]
    name: str = Field(min_length=1, max_length=80)


class RequisitionCreate(BaseModel):
    station_id: str
    item_id: str = Field(default="heating-fuel", min_length=1, max_length=80)
    quantity: float = Field(gt=0, le=1_000_000)
    unit: str = Field(default="litres", min_length=1, max_length=24)
    reason: str = Field(min_length=3, max_length=1000)
    linked_alert_id: Optional[str] = Field(default=None, max_length=100)
    actor: Actor


class WorkflowAction(BaseModel):
    actor: Actor
    notes: str = Field(default="", max_length=1000)


class RequisitionEdit(BaseModel):
    actor: Actor
    quantity: float = Field(gt=0, le=1_000_000)
    unit: str = Field(min_length=1, max_length=24)
    reason: str = Field(min_length=3, max_length=1000)


class DecisionAction(WorkflowAction):
    decision: Literal["approved", "rejected", "changes_requested"]


class DispatchAction(WorkflowAction):
    shipment_reference: str = Field(min_length=1, max_length=120)
    dispatched_at: Optional[datetime] = None
    eta_at: datetime


class EtaAction(WorkflowAction):
    eta_at: datetime


class DeliveryAction(WorkflowAction):
    received_quantity: float = Field(gt=0, le=1_000_000)
    delivered_at: Optional[datetime] = None


class GeneratorFaultScenario(BaseModel):
    generation_available_percent: int = Field(default=40, ge=0, le=100)


class DelayedShipmentScenario(BaseModel):
    delay_days: int = Field(default=10, ge=1, le=90)


def ensure_workflow_tables(connection: sqlite3.Connection) -> None:
    connection.execute(
        "CREATE TABLE IF NOT EXISTS requisitions "
        "(requisition_id TEXT PRIMARY KEY, station_id TEXT NOT NULL, status TEXT NOT NULL, "
        "payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS requisitions_by_station "
        "ON requisitions(station_id, updated_at DESC)"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS requisition_events "
        "(event_id INTEGER PRIMARY KEY AUTOINCREMENT, requisition_id TEXT NOT NULL, "
        "occurred_at TEXT NOT NULL, actor_role TEXT NOT NULL, actor_name TEXT NOT NULL, "
        "action TEXT NOT NULL, notes TEXT NOT NULL, provenance TEXT NOT NULL, payload TEXT NOT NULL, "
        "FOREIGN KEY(requisition_id) REFERENCES requisitions(requisition_id))"
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS events_by_requisition "
        "ON requisition_events(requisition_id, event_id)"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS active_scenarios "
        "(station_id TEXT PRIMARY KEY, scenario_id TEXT NOT NULL, parameters TEXT NOT NULL, "
        "updated_at TEXT NOT NULL)"
    )
    connection.execute(
        "CREATE TABLE IF NOT EXISTS station_assessments "
        "(station_id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at TEXT NOT NULL)"
    )


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute(
        "CREATE TABLE IF NOT EXISTS readings "
        "(id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL)"
    )

    columns = {row["name"] for row in connection.execute("PRAGMA table_info(readings)")}
    if "station_id" not in columns:
        connection.execute("ALTER TABLE readings ADD COLUMN station_id TEXT")
        old_rows = connection.execute("SELECT id, payload FROM readings").fetchall()
        for row in old_rows:
            try:
                station_id = json.loads(row["payload"]).get("station_id", "maitri-demo")
            except (json.JSONDecodeError, AttributeError):
                station_id = "maitri-demo"
            connection.execute(
                "UPDATE readings SET station_id = ? WHERE id = ?",
                (station_id, row["id"]),
            )

    connection.execute(
        "CREATE INDEX IF NOT EXISTS readings_by_station ON readings(station_id, id DESC)"
    )
    ensure_workflow_tables(connection)
    return connection


@contextmanager
def database_connection():
    """Commit successful work and always release the local SQLite file."""
    connection = connect()
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def validate_station(station_id: str) -> None:
    if station_id not in STATIONS:
        raise HTTPException(status_code=404, detail="Unknown station profile")


def save_reading(reading: dict) -> dict:
    with database_connection() as connection:
        connection.execute(
            "INSERT INTO readings(station_id, payload) VALUES (?, ?)",
            (reading["station_id"], json.dumps(reading)),
        )
    return reading


def latest_reading(station_id: str) -> dict:
    validate_station(station_id)
    with database_connection() as connection:
        row = connection.execute(
            "SELECT payload FROM readings WHERE station_id = ? ORDER BY id DESC LIMIT 1",
            (station_id,),
        ).fetchone()
    if row is None:
        reading = save_reading(make_reading(station_id))
    else:
        reading = json.loads(row["payload"])
    if "inventory" not in reading:
        # Add the current inventory estimate to records created by the earlier prototype.
        reading = save_reading(
            make_reading(station_id, storm_active=(reading.get("scenario") == "storm"))
        )
    scenario = active_scenario(station_id)
    if scenario and scenario["scenario_id"] == "generator_fault_during_storm":
        reading = apply_generator_fault(
            reading, scenario["parameters"]["generation_available_percent"]
        )

    eta_at = active_shipment_eta(station_id)
    if eta_at:
        reading = apply_shipment_eta(reading, eta_at, "dispatched_requisition")

    if scenario and scenario["scenario_id"] == "delayed_shipment":
        reading = apply_delayed_shipment(reading, scenario["parameters"]["delay_days"])
    return assess_reading(reading)


def _level_value(level: str) -> int:
    return {"normal": 0, "warning": 1, "critical": 2}[level]


def _reading_inputs(reading: dict) -> dict:
    inventory = reading["inventory"]
    return {
        "storm_severity_percent": round(reading["weather"]["storm_severity"] * 100),
        "generation_available_percent": reading.get("power", {}).get("available_generation_percent", 100),
        "fuel_percent": reading["energy"]["fuel_percent"],
        "inventory_status": inventory["status"],
        "shortfall_days": inventory["shortfall_days"],
        "arrival_buffer_days": inventory["arrival_buffer_days"],
        "scenario": reading.get("what_if_scenario", {}).get("id", reading.get("scenario", "normal")),
        "station_id": reading["station_id"],
        "provenance": "simulated",
    }


def classify_promotion(inputs: dict) -> tuple[str, list[str]]:
    """Return the highest current demo threshold band and the inputs that crossed it."""
    critical = []
    if inputs["storm_severity_percent"] >= 90:
        critical.append("storm severity is at least 90%")
    if inputs["generation_available_percent"] <= 25:
        critical.append("available generation is 25% or lower")
    if inputs["fuel_percent"] <= 45:
        critical.append("fuel reserve is 45% or lower")
    if inputs["shortfall_days"] >= 7:
        critical.append("shipment is at least 7 days after estimated stock-out")
    if critical:
        return "critical", critical

    warning = []
    if inputs["storm_severity_percent"] >= 70:
        warning.append("storm severity is at least 70%")
    if inputs["generation_available_percent"] <= 60:
        warning.append("available generation is 60% or lower")
    if inputs["fuel_percent"] <= 65:
        warning.append("fuel reserve is 65% or lower")
    if inputs["inventory_status"] == "risk":
        warning.append("estimated stock-out is on or before shipment arrival")
    if inputs["arrival_buffer_days"] <= 7:
        warning.append("shipment arrival buffer is 7 days or less")
    return ("warning", warning) if warning else ("normal", ["all promotion thresholds are clear"])


def recovery_target(current: str, inputs: dict) -> Optional[str]:
    """Return a lower level only when its separate recovery thresholds are satisfied."""
    if current == "critical":
        recovered = (
            inputs["storm_severity_percent"] < 85
            and inputs["generation_available_percent"] > 35
            and inputs["fuel_percent"] > 50
            and inputs["shortfall_days"] < 3
        )
        return "warning" if recovered else None
    if current == "warning":
        recovered = (
            inputs["storm_severity_percent"] < 60
            and inputs["generation_available_percent"] > 70
            and inputs["fuel_percent"] >= 70
            and inputs["inventory_status"] != "risk"
            and inputs["arrival_buffer_days"] > 10
        )
        return "normal" if recovered else None
    return None


def evaluate_alert(reading: dict, state: Optional[dict] = None,
                   now: Optional[datetime] = None) -> tuple[dict, dict]:
    """Apply the persistent, deterministic demo alert state machine."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    state = dict(state or {})
    current = state.get("current_level", "normal")
    inputs = _reading_inputs(reading)
    target, _ = classify_promotion(inputs)
    pending_level = state.get("pending_level")
    pending_since = state.get("pending_since")
    recovery_level = state.get("recovery_level")
    recovery_since = state.get("recovery_since")
    transition = None

    if _level_value(target) > _level_value(current):
        recovery_level = recovery_since = None
        if pending_level != target or not pending_since:
            pending_level, pending_since = target, now.isoformat()
        elapsed = max(0, (now - datetime.fromisoformat(pending_since)).total_seconds())
        required = ALERT_THRESHOLDS["promotion_duration_seconds"]
        remaining = max(0, required - int(elapsed))
        if elapsed >= required:
            current = target
            pending_level = pending_since = None
            transition = f"Alert promoted to {current.title()} after {required} seconds above its threshold."
        else:
            transition = f"{target.title()} promotion needs {remaining} more seconds of sustained conditions."
    elif _level_value(target) == _level_value(current):
        pending_level = pending_since = recovery_level = recovery_since = None
    else:
        pending_level = pending_since = None
        recovered_to = recovery_target(current, inputs)
        if recovered_to is None:
            recovery_level = recovery_since = None
        else:
            if recovery_level != recovered_to or not recovery_since:
                recovery_level, recovery_since = recovered_to, now.isoformat()
            elapsed = max(0, (now - datetime.fromisoformat(recovery_since)).total_seconds())
            required = ALERT_THRESHOLDS["recovery_duration_seconds"]
            remaining = max(0, required - int(elapsed))
            if elapsed >= required:
                current = recovered_to
                recovery_level = recovery_since = None
                transition = f"Alert recovered to {current.title()} after {required} seconds below recovery thresholds."
            else:
                transition = f"Recovery to {recovered_to.title()} needs {remaining} more seconds below recovery thresholds."

    if current == "normal":
        reason = "No alert promotion threshold is currently met; conditions are synthetic demo values."
        contributors_out = []
    else:
        _, contributors_out = classify_promotion(inputs)
        reason = "; ".join(contributors_out)
    alert = {
        "level": current, "target_level": target, "reason": reason,
        "contributors": contributors_out, "inputs": inputs,
        "pending_transition": transition,
        "promotion_seconds_required": ALERT_THRESHOLDS["promotion_duration_seconds"],
        "recovery_seconds_required": ALERT_THRESHOLDS["recovery_duration_seconds"],
        "rule_version": ALERT_RULE_VERSION, "thresholds": ALERT_THRESHOLDS,
        "provenance": "simulated", "illustrative": True,
    }
    if pending_level:
        alert["pending"] = {"type": "promotion", "to_level": pending_level, "since": pending_since}
    elif recovery_level:
        alert["pending"] = {"type": "recovery", "to_level": recovery_level, "since": recovery_since}
    else:
        alert["pending"] = None
    state.update({"current_level": current, "pending_level": pending_level,
                  "pending_since": pending_since, "recovery_level": recovery_level,
                  "recovery_since": recovery_since})
    return alert, state


def calculate_health(reading: dict, previous: Optional[dict] = None) -> dict:
    """Calculate a transparent 0–100 weighted score from current synthetic inputs."""
    energy = reading["energy"]
    baseline = max(1, energy["baseline_heating_load_kw"])
    ratio = energy["heating_load_kw"] / baseline
    energy_score = round(max(0, min(100, 100 - max(0, ratio - 1) * 50)))
    infrastructure_score = round(max(0, min(100, reading.get("power", {}).get("available_generation_percent", 100))))
    inventory = reading["inventory"]
    if inventory["status"] == "risk":
        inventory_score = round(max(0, min(100, 50 - inventory["shortfall_days"] * 5)))
    else:
        inventory_score = round(max(0, min(100, 70 + min(inventory["arrival_buffer_days"], 10) * 3)))
    environment_score = round(max(0, min(100, 100 * (1 - reading["weather"]["storm_severity"]))))
    components = {
        "energy": {"score": energy_score, "weight": HEALTH_WEIGHTS["energy"],
                   "reason": f"Heating load is {energy['heating_load_kw']} kW against a {baseline} kW demo baseline."},
        "infrastructure": {"score": infrastructure_score, "weight": HEALTH_WEIGHTS["infrastructure"],
                           "reason": f"Illustrative available generation is {infrastructure_score}%."},
        "inventory": {"score": inventory_score, "weight": HEALTH_WEIGHTS["inventory"],
                      "reason": f"Stock-out/arrival comparison is {inventory['status']} with {inventory['shortfall_days']} day shortfall and {inventory['arrival_buffer_days']} day buffer."},
        "environment": {"score": environment_score, "weight": HEALTH_WEIGHTS["environment"],
                        "reason": f"Storm severity is {round(reading['weather']['storm_severity'] * 100)}%."},
    }
    score = round(sum(item["score"] * item["weight"] for item in components.values()))
    delta = None if previous is None else score - previous.get("score", score)
    if previous is None:
        reason = "Initial score from the active synthetic station profile and scenario."
    elif delta == 0:
        reason = previous.get("change_reason", "No component score has changed yet.")
    else:
        old_components = previous.get("components", {})
        changed = []
        for name, component in components.items():
            old = old_components.get(name, {}).get("score")
            if old is not None and old != component["score"]:
                changed.append((abs(component["score"] - old), name, component["score"] - old))
        changed.sort(reverse=True)
        if changed:
            _, name, change = changed[0]
            reason = f"Score {'rose' if delta > 0 else 'fell'} {abs(delta)} points; {name} changed {change:+d} points and contributed most."
        else:
            reason = f"Score {'rose' if delta > 0 else 'fell'} {abs(delta)} points from the updated synthetic inputs."
    return {"score": score, "components": components, "weights": HEALTH_WEIGHTS,
            "formula": "round(sum(component_score × component_weight))",
            "delta_from_previous": delta, "change_reason": reason,
            "inputs": _reading_inputs(reading), "provenance": "simulated", "illustrative": True}


def assess_reading(reading: dict, now: Optional[datetime] = None) -> dict:
    """Persist only derived assessment state; never mutate requisitions or scenario inputs."""
    station_id = reading["station_id"]
    with database_connection() as connection:
        row = connection.execute("SELECT state FROM station_assessments WHERE station_id = ?", (station_id,)).fetchone()
        persisted = json.loads(row["state"]) if row else {}
        alert, alert_state = evaluate_alert(reading, persisted.get("alert"), now)
        health = calculate_health(reading, persisted.get("health"))
        next_state = {"alert": alert_state, "health": health}
        connection.execute(
            "INSERT INTO station_assessments(station_id, state, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(station_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at",
            (station_id, json.dumps(next_state), (now or datetime.now(timezone.utc)).isoformat()),
        )
    return {**reading, "alert": alert, "health": health}


def apply_shipment_eta(reading: dict, eta_at: datetime, source: str) -> dict:
    observed_at = datetime.fromisoformat(reading["observed_at"].replace("Z", "+00:00"))
    if observed_at.tzinfo is None:
        observed_at = observed_at.replace(tzinfo=timezone.utc)
    calculated_at = datetime.now(timezone.utc)
    elapsed_days = max(0, int((calculated_at - observed_at).total_seconds() // 86400))
    stockout_days = max(0, reading["inventory"]["stockout_in_days"] - elapsed_days)
    eta_days = max(0, ceil((eta_at - calculated_at).total_seconds() / 86400))
    result = {**reading, "inventory": fuel_outlook(stockout_days, eta_days, calculated_at)}
    result["inventory"]["shipment_eta_at"] = eta_at.isoformat()
    result["inventory"]["eta_source"] = source
    result["inventory"]["calculated_at"] = calculated_at.isoformat()
    return result


def active_scenario(station_id: str) -> Optional[dict]:
    with database_connection() as connection:
        row = connection.execute(
            "SELECT scenario_id, parameters, updated_at FROM active_scenarios WHERE station_id = ?",
            (station_id,),
        ).fetchone()
    if row is None:
        return None
    return {
        "scenario_id": row["scenario_id"],
        "parameters": json.loads(row["parameters"]),
        "updated_at": row["updated_at"],
    }


def save_active_scenario(station_id: str, scenario_id: str, parameters: dict) -> None:
    now = utc_now()
    with database_connection() as connection:
        connection.execute(
            "INSERT INTO active_scenarios(station_id, scenario_id, parameters, updated_at) "
            "VALUES (?, ?, ?, ?) ON CONFLICT(station_id) DO UPDATE SET "
            "scenario_id = excluded.scenario_id, parameters = excluded.parameters, updated_at = excluded.updated_at",
            (station_id, scenario_id, json.dumps(parameters), now),
        )


def clear_active_scenario(station_id: str) -> None:
    with database_connection() as connection:
        connection.execute("DELETE FROM active_scenarios WHERE station_id = ?", (station_id,))


def active_shipment_eta(station_id: str) -> Optional[datetime]:
    """Return the newest ETA from an active, dispatched synthetic workflow shipment."""
    with database_connection() as connection:
        row = connection.execute(
            "SELECT payload FROM requisitions WHERE station_id = ? AND status = 'dispatched' "
            "ORDER BY updated_at DESC LIMIT 1",
            (station_id,),
        ).fetchone()
    if row is None:
        return None
    value = json.loads(row["payload"]).get("eta_at")
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def date_value(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        raise HTTPException(status_code=422, detail="Timestamps must include a timezone")
    return value.astimezone(timezone.utc).isoformat()


def write_event(
    connection: sqlite3.Connection,
    requisition_id: str,
    actor: Actor,
    action: str,
    notes: str = "",
    details: Optional[dict] = None,
) -> dict:
    event = {
        "occurred_at": utc_now(),
        "actor": {"role": actor.role, "name": actor.name},
        "action": action,
        "notes": notes,
        "provenance": "manual_demo_action",
        "details": details or {},
    }
    connection.execute(
        "INSERT INTO requisition_events "
        "(requisition_id, occurred_at, actor_role, actor_name, action, notes, provenance, payload) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (requisition_id, event["occurred_at"], actor.role, actor.name, action, notes,
         event["provenance"], json.dumps(event)),
    )
    return event


def load_requisition(connection: sqlite3.Connection, requisition_id: str) -> dict:
    row = connection.execute(
        "SELECT payload FROM requisitions WHERE requisition_id = ?", (requisition_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Requisition not found")
    return json.loads(row["payload"])


def require_role(actor: Actor, allowed: set[str]) -> None:
    if actor.role not in allowed:
        raise HTTPException(status_code=403, detail=f"This demo action requires role: {', '.join(sorted(allowed))}")


def transition(
    requisition_id: str,
    actor: Actor,
    allowed_roles: set[str],
    allowed_states: set[str],
    next_state: str,
    action: str,
    notes: str = "",
    updates: Optional[dict] = None,
) -> dict:
    require_role(actor, allowed_roles)
    with database_connection() as connection:
        item = load_requisition(connection, requisition_id)
        if item["status"] not in allowed_states:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot {action} a requisition in state '{item['status']}'",
            )
        previous = item["status"]
        item.update(updates or {})
        item["status"] = next_state
        item["updated_at"] = utc_now()
        connection.execute(
            "UPDATE requisitions SET status = ?, payload = ?, updated_at = ? WHERE requisition_id = ?",
            (next_state, json.dumps(item), item["updated_at"], requisition_id),
        )
        write_event(connection, requisition_id, actor, action, notes, {
            "from_state": previous, "to_state": next_state, **(updates or {})
        })
        return item


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "polar-twin-api"}


@app.get("/api/stations")
def list_stations() -> list[dict]:
    return [
        {"station_id": station["station_id"], "label": station["label"], "station_name": station["station_name"]}
        for station in STATIONS.values()
    ]


@app.post("/api/requisitions", status_code=201)
def create_requisition(body: RequisitionCreate) -> dict:
    """Create a draft requisition. Demo roles are workflow labels, not authentication."""
    require_role(body.actor, {"station_leader"})
    validate_station(body.station_id)
    now = utc_now()
    requisition_id = f"REQ-{uuid4().hex[:8].upper()}"
    item = {
        "requisition_id": requisition_id,
        "station_id": body.station_id,
        "item_id": body.item_id,
        "quantity": body.quantity,
        "unit": body.unit,
        "reason": body.reason,
        "linked_alert_id": body.linked_alert_id,
        "status": "draft",
        "requested_by": {"role": body.actor.role, "name": body.actor.name},
        "approved_by": None,
        "shipment_reference": None,
        "dispatched_at": None,
        "eta_at": None,
        "delivered_at": None,
        "received_quantity": None,
        "provenance": "manual_demo_entry",
        "created_at": now,
        "updated_at": now,
    }
    with database_connection() as connection:
        connection.execute(
            "INSERT INTO requisitions(requisition_id, station_id, status, payload, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (requisition_id, body.station_id, "draft", json.dumps(item), now, now),
        )
        write_event(connection, requisition_id, body.actor, "created", body.reason)
    return item


@app.get("/api/requisitions")
def list_requisitions(station_id: Optional[str] = None, status: Optional[str] = None) -> list[dict]:
    if station_id is not None:
        validate_station(station_id)
    if status is not None and status not in STATES:
        raise HTTPException(status_code=422, detail="Unknown requisition state")
    clauses, values = [], []
    if station_id:
        clauses.append("station_id = ?")
        values.append(station_id)
    if status:
        clauses.append("status = ?")
        values.append(status)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with database_connection() as connection:
        rows = connection.execute(
            f"SELECT payload FROM requisitions {where} ORDER BY updated_at DESC", values
        ).fetchall()
    return [json.loads(row["payload"]) for row in rows]


@app.get("/api/requisitions/{requisition_id}")
def get_requisition(requisition_id: str) -> dict:
    with database_connection() as connection:
        return load_requisition(connection, requisition_id)


@app.post("/api/requisitions/{requisition_id}/update")
def update_requisition(requisition_id: str, body: RequisitionEdit) -> dict:
    current_state = get_requisition(requisition_id)["status"]
    return transition(
        requisition_id, body.actor, {"station_leader"}, {"draft", "changes_requested"},
        current_state,
        "updated", "Request details updated in the demo workflow.",
        {"quantity": body.quantity, "unit": body.unit, "reason": body.reason},
    )


@app.get("/api/requisitions/{requisition_id}/history")
def requisition_history(requisition_id: str) -> list[dict]:
    with database_connection() as connection:
        load_requisition(connection, requisition_id)
        rows = connection.execute(
            "SELECT payload FROM requisition_events WHERE requisition_id = ? ORDER BY event_id",
            (requisition_id,),
        ).fetchall()
    return [json.loads(row["payload"]) for row in rows]


@app.post("/api/requisitions/{requisition_id}/submit")
def submit_requisition(requisition_id: str, body: WorkflowAction) -> dict:
    return transition(requisition_id, body.actor, {"station_leader"},
                      {"draft", "changes_requested"}, "submitted", "submitted", body.notes)


@app.post("/api/requisitions/{requisition_id}/review")
def review_requisition(requisition_id: str, body: WorkflowAction) -> dict:
    return transition(requisition_id, body.actor, {"logistics"}, {"submitted"},
                      "in_review", "review_started", body.notes)


@app.post("/api/requisitions/{requisition_id}/decision")
def decide_requisition(requisition_id: str, body: DecisionAction) -> dict:
    item = transition(
        requisition_id, body.actor, {"management"}, {"in_review"}, body.decision,
        body.decision, body.notes,
        {"approved_by": {"role": body.actor.role, "name": body.actor.name}
         if body.decision == "approved" else None},
    )
    return item


@app.post("/api/requisitions/{requisition_id}/dispatch")
def dispatch_requisition(requisition_id: str, body: DispatchAction) -> dict:
    dispatched_at = date_value(body.dispatched_at) or utc_now()
    eta_at = date_value(body.eta_at)
    if datetime.fromisoformat(eta_at) < datetime.fromisoformat(dispatched_at):
        raise HTTPException(status_code=422, detail="ETA must be on or after dispatch time")
    return transition(
        requisition_id, body.actor, {"logistics"}, {"approved"}, "dispatched", "dispatched",
        body.notes, {"shipment_reference": body.shipment_reference,
                    "dispatched_at": dispatched_at, "eta_at": eta_at},
    )


@app.post("/api/requisitions/{requisition_id}/eta")
def update_requisition_eta(requisition_id: str, body: EtaAction) -> dict:
    eta_at = date_value(body.eta_at)
    return transition(requisition_id, body.actor, {"logistics"}, {"dispatched"},
                      "dispatched", "eta_updated", body.notes, {"eta_at": eta_at})


@app.post("/api/requisitions/{requisition_id}/delivery")
def confirm_requisition_delivery(requisition_id: str, body: DeliveryAction) -> dict:
    return transition(
        requisition_id, body.actor, {"station_leader"}, {"dispatched"}, "delivered",
        "delivery_confirmed", body.notes,
        {"received_quantity": body.received_quantity,
         "delivered_at": date_value(body.delivered_at) or utc_now()},
    )


@app.post("/api/requisitions/{requisition_id}/close")
def close_requisition(requisition_id: str, body: WorkflowAction) -> dict:
    return transition(requisition_id, body.actor, {"station_leader"}, {"delivered"},
                      "closed", "closed", body.notes)


@app.get("/api/station/latest")
def get_latest_reading(
    station_id: str = Query(default="maitri-demo"),
) -> dict:
    return latest_reading(station_id)


@app.post("/api/scenario/{scenario}")
def set_scenario(
    scenario: Literal["storm", "reset"],
    station_id: str = Query(default="maitri-demo"),
) -> dict:
    validate_station(station_id)
    clear_active_scenario(station_id)
    save_reading(make_reading(station_id, storm_active=(scenario == "storm")))
    return latest_reading(station_id)


@app.post("/api/scenarios/generator-fault")
def set_generator_fault_scenario(
    body: GeneratorFaultScenario,
    station_id: str = Query(default="maitri-demo"),
) -> dict:
    validate_station(station_id)
    save_reading(make_reading(station_id, storm_active=True))
    save_active_scenario(station_id, "generator_fault_during_storm", {
        "generation_available_percent": body.generation_available_percent,
    })
    return latest_reading(station_id)


@app.post("/api/scenarios/delayed-shipment")
def set_delayed_shipment_scenario(
    body: DelayedShipmentScenario,
    station_id: str = Query(default="maitri-demo"),
) -> dict:
    validate_station(station_id)
    # Ensure there is a stable base snapshot before persisting the what-if parameters.
    latest_reading(station_id)
    save_active_scenario(station_id, "delayed_shipment", {"delay_days": body.delay_days})
    return latest_reading(station_id)


@app.post("/api/scenarios/clear")
def clear_scenario(station_id: str = Query(default="maitri-demo")) -> dict:
    validate_station(station_id)
    clear_active_scenario(station_id)
    return latest_reading(station_id)


@app.post("/api/telemetry/sync")
async def sync_queued_telemetry(request: Request) -> dict:
    """Accept a buffered edge batch, optionally compressed with gzip."""
    transmitted = await request.body()
    if request.headers.get("content-encoding", "").lower() == "gzip":
        try:
            payload_bytes = gzip.decompress(transmitted)
        except (OSError, EOFError, zlib.error) as error:
            raise HTTPException(status_code=400, detail="Invalid gzip telemetry batch") from error
    else:
        payload_bytes = transmitted

    try:
        payload = json.loads(payload_bytes)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise HTTPException(status_code=400, detail="Telemetry batch must contain JSON") from error

    readings = payload.get("readings") if isinstance(payload, dict) else payload
    if not isinstance(readings, list) or not readings:
        raise HTTPException(status_code=400, detail="Telemetry batch must contain at least one reading")
    if len(readings) > 500:
        raise HTTPException(status_code=413, detail="Telemetry batch is limited to 500 readings")

    for reading in readings:
        if not isinstance(reading, dict):
            raise HTTPException(status_code=400, detail="Each telemetry item must be an object")
        station_id = reading.get("station_id")
        validate_station(station_id if isinstance(station_id, str) else "")
        if not reading.get("observed_at") or not reading.get("provenance"):
            raise HTTPException(status_code=400, detail="Each reading needs observed_at and provenance")

    with database_connection() as connection:
        connection.executemany(
            "INSERT INTO readings(station_id, payload) VALUES (?, ?)",
            [(reading["station_id"], json.dumps(reading)) for reading in readings],
        )

    return {
        "status": "synced",
        "accepted_readings": len(readings),
        "transmitted_bytes": len(transmitted),
        "uncompressed_bytes": len(payload_bytes),
        "compression": "gzip" if request.headers.get("content-encoding", "").lower() == "gzip" else "none",
    }
