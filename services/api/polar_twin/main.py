"""FastAPI service for the local Polar Twin prototype."""

import json
import os
import sqlite3
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .simulator import STATIONS, make_reading

DATA_DIR = Path(os.environ.get("POLAR_TWIN_DATA_DIR", Path(__file__).resolve().parents[1] / "data"))
DB_PATH = DATA_DIR / "prototype.sqlite3"

app = FastAPI(title="Polar Twin Prototype API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
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
    return connection


def validate_station(station_id: str) -> None:
    if station_id not in STATIONS:
        raise HTTPException(status_code=404, detail="Unknown station profile")


def save_reading(reading: dict) -> dict:
    with connect() as connection:
        connection.execute(
            "INSERT INTO readings(station_id, payload) VALUES (?, ?)",
            (reading["station_id"], json.dumps(reading)),
        )
    return reading


def latest_reading(station_id: str) -> dict:
    validate_station(station_id)
    with connect() as connection:
        row = connection.execute(
            "SELECT payload FROM readings WHERE station_id = ? ORDER BY id DESC LIMIT 1",
            (station_id,),
        ).fetchone()
    if row is None:
        return save_reading(make_reading(station_id))

    reading = json.loads(row["payload"])
    if "inventory" not in reading:
        # Add the current inventory estimate to records created by the earlier prototype.
        return save_reading(
            make_reading(station_id, storm_active=(reading.get("scenario") == "storm"))
        )
    return reading


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "polar-twin-api"}


@app.get("/api/stations")
def list_stations() -> list[dict]:
    return [
        {"station_id": station["station_id"], "label": station["label"], "station_name": station["station_name"]}
        for station in STATIONS.values()
    ]


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
    return save_reading(make_reading(station_id, storm_active=(scenario == "storm")))
