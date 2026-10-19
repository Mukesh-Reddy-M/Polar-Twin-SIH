"""FastAPI service for the first local Polar Twin prototype."""

import json
import os
import sqlite3
from pathlib import Path
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .simulator import make_reading

DATA_DIR = Path(os.environ.get("POLAR_TWIN_DATA_DIR", Path(__file__).resolve().parents[1] / "data"))
DB_PATH = DATA_DIR / "prototype.sqlite3"

app = FastAPI(title="Polar Twin Prototype API", version="0.1.0")
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
        "CREATE TABLE IF NOT EXISTS readings (id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL)"
    )
    return connection


def save_reading(reading: dict) -> dict:
    with connect() as connection:
        connection.execute("INSERT INTO readings(payload) VALUES (?)", (json.dumps(reading),))
    return reading


def latest_reading() -> dict:
    with connect() as connection:
        row = connection.execute("SELECT payload FROM readings ORDER BY id DESC LIMIT 1").fetchone()
    if row is None:
        return save_reading(make_reading())
    return json.loads(row["payload"])


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "polar-twin-api"}


@app.get("/api/station/latest")
def get_latest_reading() -> dict:
    return latest_reading()


@app.post("/api/scenario/{scenario}")
def set_scenario(scenario: Literal["storm", "reset"]) -> dict:
    return save_reading(make_reading(storm_active=(scenario == "storm")))
