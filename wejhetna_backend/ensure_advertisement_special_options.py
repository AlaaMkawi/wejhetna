"""
Ensure rows exist for advertisement "Other" category and "Online Business" city.

The mobile app maps UI pills to real FK ids by name. If these rows are missing,
submission and filters fail.

Run (once per environment, from wejhetna_backend):
    python ensure_advertisement_special_options.py
"""

from __future__ import annotations

from db import SessionLocal
from models import Category, City


def _blob(*parts: str | None) -> str:
    return " ".join((p or "").lower() for p in parts)


def find_other_category(db) -> Category | None:
    for c in db.query(Category).all():
        s = _blob(c.name_en, c.name_ar, c.name_he)
        if (
            "other" in s
            or "أخرى" in s
            or "اخرى" in s
            or "אחר" in (c.name_he or "")
            or "misc" in s
        ):
            return c
    return None


def find_online_business_city(db) -> City | None:
    for c in db.query(City).all():
        s = _blob(c.name_en, c.name_ar, c.name_he)
        he = (c.name_he or "").lower()
        ar = c.name_ar or ""
        if "online business" in s:
            return c
        if "אונליין" in he or "online" in he:
            return c
        if "أعمال" in ar and "إنترنت" in ar:
            return c
        if "internet" in s:
            return c
    return None


def main() -> None:
    db = SessionLocal()
    try:
        if not find_other_category(db):
            db.add(
                Category(
                    name_ar="أخرى",
                    name_he="אחר",
                    name_en="Other",
                    icon_name=None,
                    is_active=True,
                )
            )
            print("Inserted category: Other")
        else:
            print("Category 'Other' already present")

        if not find_online_business_city(db):
            db.add(
                City(
                    name_ar="أعمال عبر الإنترنت",
                    name_he="עסק אונליין",
                    name_en="Online Business",
                )
            )
            print("Inserted city: Online Business")
        else:
            print("City 'Online Business' already present")

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
