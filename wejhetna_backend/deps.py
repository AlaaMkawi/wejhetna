"""Shared FastAPI dependencies (single get_db for the whole app)."""

from db import SessionLocal


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
