"""Tiny helper kept separate from duck.py so importing it never needs duckdb."""
import json


def as_json(value):
    """Postgres (jsonb) returns a dict; DuckDB/Parquet returns JSON text. Normalise to Python objects."""
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8")
    if isinstance(value, str):
        return json.loads(value)
    return value
