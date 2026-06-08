"""
Seed Rahat places from OSM CSV into the database.

Safe to run multiple times — existing places (by OSM id or nearby duplicate) are skipped.
Uses existing category IDs only — never inserts into or updates the categories table.

Usage:
    python seed_osm_places.py
"""

from __future__ import annotations

import csv
import math
import re
import sys
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Optional

# DB imports are deferred to seed_rahat_places() so --preview works offline.

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

RAHAT_CITY_ID = 7
CSV_PATH = Path(__file__).resolve().parent / "data" / "osm_places_rahat.csv"
DUPLICATE_DISTANCE_M = 30

BUSINESS_CATEGORY_IDS = {3, 4, 5, 6}
PUBLIC_SERVICE_CATEGORY_IDS = {7, 8, 9, 10, 11, 12, 13, 14, 15, 18}

# OSM tags that should be skipped entirely
SKIP_AMENITIES = {"parking", "atm"}
SKIP_LEISURE = {"caravan_site"}
SKIP_OFFICE = {"company"}

DAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
]

OSM_DAY_MAP = {
    "Mo": 0,
    "Tu": 1,
    "We": 2,
    "Th": 3,
    "Fr": 4,
    "Sa": 5,
    "Su": 6,
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class OsmRow:
    osm_id: str
    osm_type: str
    name: str
    name_ar: str
    name_he: str
    amenity: str
    shop: str
    office: str
    healthcare: str
    tourism: str
    leisure: str
    craft: str
    opening_hours_raw: str
    phone: str
    website: str
    addr_street: str
    addr_housenumber: str
    lat: float
    lon: float
    category_id: int = 19
    place_type: str = "PUBLIC_SERVICE"
    opening_hours: Optional[str] = None
    description: Optional[str] = None
    description_ar: str = ""
    description_he: str = ""
    description_en: str = ""
    address: str = ""
    skip: bool = False
    skip_reason: str = ""
    score: int = 0


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------


def _is_arabic(text: str) -> bool:
    return bool(re.search(r"[\u0600-\u06FF]", text))


def _is_hebrew(text: str) -> bool:
    return bool(re.search(r"[\u0590-\u05FF]", text))


def _is_latin(text: str) -> bool:
    return bool(re.search(r"[A-Za-z]", text))


def _clean(text: str) -> str:
    return unicodedata.normalize("NFKC", (text or "").strip())


def _normalize_name(text: str) -> str:
    text = _clean(text).lower()
    for prefix in (
        "مسجد",
        "مدرسة",
        "مطعم",
        "دكان",
        "مركز",
        "ملعب",
        "حديقة",
        "سوق",
        "مكتب",
    ):
        text = text.replace(prefix, "")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _names_similar(a: str, b: str) -> bool:
    na, nb = _normalize_name(a), _normalize_name(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    if na in nb or nb in na:
        return True
    return SequenceMatcher(None, na, nb).ratio() >= 0.85


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _to_12h(hour: int, minute: int) -> tuple[str, str]:
    period = "AM" if hour < 12 else "PM"
    h = hour % 12
    if h == 0:
        h = 12
    return f"{h}:{minute:02d}", period


def _day_hours(start_h: int, start_m: int, end_h: int, end_m: int) -> str:
    sh, sp = _to_12h(start_h, start_m)
    eh, ep = _to_12h(end_h, end_m)
    return f"{sh} {sp} - {eh} {ep}"


def _format_week_hours(day_slots: dict[int, Optional[tuple[int, int, int, int]]]) -> str:
    parts: list[str] = []
    for idx, day in enumerate(DAY_NAMES):
        slot = day_slots.get(idx)
        if not slot:
            continue
        sh, sm, eh, em = slot
        parts.append(f"{day}: {_day_hours(sh, sm, eh, em)}")
    return ", ".join(parts)


def _parse_osm_opening_hours(raw: str) -> Optional[str]:
    raw = _clean(raw)
    if not raw:
        return None
    if raw.lower() in {"24/7", "24/7;"}:
        slot = (0, 0, 23, 59)
        return _format_week_hours({i: slot for i in range(7)})

    m = re.match(
        r"^(?:Mo|Mo-Su|Mo-Fr|Mo-Sa)\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$",
        raw,
        re.IGNORECASE,
    )
    if not m:
        return None

    sh, sm, eh, em = (int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4)))
    slot = (sh, sm, eh, em)

    if raw.lower().startswith("mo-su"):
        return _format_week_hours({i: slot for i in range(7)})
    if raw.lower().startswith("mo-fr"):
        return _format_week_hours({i: slot for i in range(5)})
    if raw.lower().startswith("mo-sa"):
        return _format_week_hours({i: slot for i in range(6)})
    if raw.lower().startswith("mo"):
        return _format_week_hours({0: slot})
    return None


def _default_hours(category_id: int) -> str:
    school = _format_week_hours({i: (7, 30, 14, 30) for i in range(5)})
    mosque = _format_week_hours({i: (5, 0, 22, 0) for i in range(7)})
    supermarket = _format_week_hours({i: (7, 0, 22, 0) for i in range(7)})
    restaurant = _format_week_hours({i: (9, 0, 23, 0) for i in range(7)})
    office = _format_week_hours({i: (8, 0, 16, 0) for i in range(5)})
    park = _format_week_hours({i: (6, 0, 22, 0) for i in range(7)})
    neutral = _format_week_hours({i: (8, 0, 20, 0) for i in range(7)})

    if category_id == 7:
        return school
    if category_id == 8:
        return _format_week_hours({i: (7, 30, 16, 0) for i in range(5)})
    if category_id == 9:
        return mosque
    if category_id in {10, 11}:
        return park
    if category_id in {12, 15}:
        return office
    if category_id == 3:
        return supermarket
    if category_id in {4, 5}:
        return restaurant
    if category_id in {13, 14}:
        return _format_week_hours({i: (8, 0, 20, 0) for i in range(5)})
    if category_id == 19:
        return neutral
    return neutral


# ---------------------------------------------------------------------------
# Category / type mapping (uses existing category IDs only — never touches DB)
# ---------------------------------------------------------------------------

MUNICIPALITY_AMENITIES = {"townhall"}
MUNICIPALITY_OFFICES = {"government", "administrative"}
MUNICIPALITY_NAME_HINTS = (
    "مجلس محلي",
    "المجلس المحلي",
    "بلدية",
    "מועצה מקומית",
    "municipality",
    "local council",
    "city hall",
    "town hall",
)

CLINIC_HEALTHCARE_TAGS = {"clinic", "doctor", "doctors"}
CLINIC_AMENITY_TAGS = {"clinic", "doctors", "doctor"}


def _is_municipality(row: OsmRow) -> bool:
    if row.amenity in MUNICIPALITY_AMENITIES:
        return True
    if row.office in MUNICIPALITY_OFFICES:
        return True
    combined = f"{row.name_ar} {row.name_he} {row.name}".lower()
    return any(hint in combined for hint in MUNICIPALITY_NAME_HINTS)


def _is_clinic(row: OsmRow) -> bool:
    if row.healthcare in CLINIC_HEALTHCARE_TAGS:
        return True
    if row.amenity in CLINIC_AMENITY_TAGS:
        return True
    return False


def _resolve_category_and_type(row: OsmRow) -> tuple[int, str]:
    if _is_municipality(row):
        return 14, "PUBLIC_SERVICE"

    if _is_clinic(row):
        return 15, "PUBLIC_SERVICE"

    amenity = row.amenity
    shop = row.shop
    leisure = row.leisure

    mapping: list[tuple[str, int]] = [
        ("supermarket", 3),
        ("mall", 3),
        ("marketplace", 3),
        ("fast_food", 4),
        ("butcher", 4),
        ("restaurant", 4),
        ("cafe", 5),
        ("confectionery", 5),
        ("school", 7),
        ("childcare", 8),
        ("kindergarten", 8),
        ("place_of_worship", 9),
        ("park", 10),
        ("garden", 10),
        ("pitch", 11),
        ("post_office", 12),
        ("community_centre", 13),
        ("fuel", 19),
        ("bank", 19),
        ("lottery", 19),
        ("electronics", 19),
        ("police", 19),
        ("fire_station", 19),
    ]

    for tag_value, cat_id in mapping:
        if amenity == tag_value or shop == tag_value or leisure == tag_value:
            if cat_id in BUSINESS_CATEGORY_IDS:
                return cat_id, "BUSINESS"
            return cat_id, "PUBLIC_SERVICE"

    business_tags = {"fuel", "bank", "lottery", "electronics", "confectionery"}
    if amenity in business_tags or shop in business_tags:
        return 19, "BUSINESS"
    return 19, "PUBLIC_SERVICE"


def _english_name(name_ar: str, name_he: str, raw_name: str) -> str:
    if _is_latin(raw_name) and not _is_arabic(raw_name):
        return raw_name
    if _is_latin(name_he):
        return name_he

    replacements = {
        "مسجد": "Mosque",
        "مدرسة": "School",
        "مطعم": "Restaurant",
        "دكان": "Shop",
        "مركز": "Center",
        "ملعب": "Sports Field",
        "حديقة": "Park",
        "سوق": "Market",
        "مكتب البريد": "Post Office",
        "مستشفى": "Clinic",
        "ماركت": "Market",
        "بنك": "Bank",
        "محطة": "Station",
    }
    for ar, en in replacements.items():
        if name_ar.startswith(ar):
            rest = name_ar[len(ar) :].strip()
            if rest:
                return f"{en} {rest}".strip()
            return en
    return name_ar or name_he or raw_name


def _build_descriptions(row: OsmRow) -> tuple[str, str, str, str]:
    cat_labels = {
        3: ("سوبرماركت", "סופרמרקט", "Supermarket"),
        4: ("مطعم", "מסעדה", "Restaurant"),
        5: ("مقهى", "בית קפה", "Cafe"),
        6: ("ملابس", "בגדים", "Clothing store"),
        7: ("مدرسة", "בית ספר", "School"),
        8: ("روضة أطفال", "גן ילדים", "Kindergarten"),
        9: ("مسجد", "מסגד", "Mosque"),
        10: ("حديقة عامة", "גן ציבורי", "Public park"),
        11: ("مرفق رياضي", "מתקן ספורט", "Sports facility"),
        12: ("مكتب بريد", "דואר", "Post office"),
        13: ("مركز جماهيري", "מרכז קהילתי", "Community center"),
        14: ("بلدية", "מועצה", "Municipality"),
        15: ("عيادة", "מרפאה", "Clinic"),
        18: ("منزل", "בית", "Home"),
        19: ("مكان", "מקום", "Place"),
    }
    ar_type, he_type, en_type = cat_labels.get(row.category_id, cat_labels[19])

    desc_ar = f"{ar_type} في رهط — {row.name_ar}."
    desc_he = f"{he_type} ברהט — {row.name_he}."
    desc_en = f"{en_type} in Rahat — {_english_name(row.name_ar, row.name_he, row.name)}."

    address = row.address
    if address:
        desc_ar += f" العنوان: {address}."
        desc_he += f" כתובת: {address}."
        desc_en += f" Address: {address}."

    combined = f"{desc_ar}\n\n{desc_he}\n\n{desc_en}"
    return desc_ar, desc_he, desc_en, combined


def _arabic_to_hebrew_fallback(name_ar: str) -> str:
    """Build a readable Hebrew label when OSM has no name:he."""
    replacements = [
        ("مدرسة", "בית ספר"),
        ("ثانوية", "תיכון"),
        ("مسجد", "מסגד"),
        ("مطعم", "מסעדה"),
        ("مقهى", "בית קפה"),
        ("مكتب البريد", "דואר"),
        ("مكتب بريد", "דואר"),
        ("دكان", "חנות"),
        ("مركز", "מרכז"),
        ("ملعب", "מגרש"),
        ("حديقة", "גן"),
        ("سوق", "שוק"),
        ("مستشفى", "מרפאה"),
        ("عيادة", "מרפאה"),
        ("روضة", "גן ילדים"),
        ("محطة وقود", "תחנת דלק"),
        ("محطة الشرطة", "תחנת משטרה"),
        ("محطة الاطفاء", "תחנת כיבוי אש"),
        ("بنك", "בנק"),
        ("ماركت", "מרקט"),
        ("رهط", "רהט"),
    ]
    result = name_ar
    for ar, he in replacements:
        result = result.replace(ar, he)
    if _is_hebrew(result):
        return result
    return name_ar


def _extract_names(raw_name: str, raw_ar: str, raw_he: str) -> tuple[str, str, str]:
    name = _clean(raw_name)
    name_ar = _clean(raw_ar)
    name_he = _clean(raw_he)

    if not name_ar:
        if _is_arabic(name):
            name_ar = name
        elif _is_arabic(name_he):
            name_ar = name_he
        else:
            name_ar = name

    if not name_he:
        if _is_hebrew(name):
            name_he = name
        elif _is_hebrew(raw_he):
            name_he = raw_he
        else:
            name_he = _arabic_to_hebrew_fallback(name_ar)

    name_en = _english_name(name_ar, name_he, name)
    return name_en, name_ar, name_he


def _build_address(street: str, housenumber: str) -> str:
    street = _clean(street)
    housenumber = _clean(housenumber)
    if street and housenumber:
        return f"{street} {housenumber}, Rahat"
    if street:
        return f"{street}, Rahat"
    return ""


def _record_score(row: OsmRow) -> int:
    score = 0
    if row.name_ar:
        score += 2
    if row.name_he and _is_hebrew(row.name_he):
        score += 3
    if row.name and _is_latin(row.name):
        score += 1
    if row.phone:
        score += 2
    if row.website:
        score += 2
    if row.opening_hours_raw:
        score += 2
    if row.address:
        score += 2
    if row.category_id != 19:
        score += 1
    if row.osm_type == "way":
        score += 1
    return score


# ---------------------------------------------------------------------------
# CSV loading
# ---------------------------------------------------------------------------


def _load_csv_rows() -> list[OsmRow]:
    rows: list[OsmRow] = []
    with CSV_PATH.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for line in reader:
            try:
                lat = float(line["@lat"])
                lon = float(line["@lon"])
            except (TypeError, ValueError):
                continue

            osm_type = _clean(line.get("@type", "node"))
            osm_numeric_id = _clean(line.get("@id", ""))
            if not osm_numeric_id:
                continue

            name_en, name_ar, name_he = _extract_names(
                line.get("name", ""),
                line.get("name:ar", ""),
                line.get("name:he", ""),
            )

            phone = _clean(line.get("phone", "")) or _clean(line.get("contact:phone", ""))
            website = _clean(line.get("website", ""))
            address = _build_address(line.get("addr:street", ""), line.get("addr:housenumber", ""))

            row = OsmRow(
                osm_id=f"{osm_type}:{osm_numeric_id}",
                osm_type=osm_type,
                name=name_en,
                name_ar=name_ar,
                name_he=name_he,
                amenity=_clean(line.get("amenity", "")),
                shop=_clean(line.get("shop", "")),
                office=_clean(line.get("office", "")),
                healthcare=_clean(line.get("healthcare", "")),
                tourism=_clean(line.get("tourism", "")),
                leisure=_clean(line.get("leisure", "")),
                craft=_clean(line.get("craft", "")),
                opening_hours_raw=_clean(line.get("opening_hours", "")),
                phone=phone,
                website=website,
                addr_street=_clean(line.get("addr:street", "")),
                addr_housenumber=_clean(line.get("addr:housenumber", "")),
                lat=lat,
                lon=lon,
                address=address,
            )

            if row.amenity in SKIP_AMENITIES or row.leisure in SKIP_LEISURE or row.office in SKIP_OFFICE:
                row.skip = True
                row.skip_reason = "invalid_type"
                rows.append(row)
                continue

            if row.amenity == "parking":
                row.skip = True
                row.skip_reason = "parking"
                rows.append(row)
                continue

            if not name_ar:
                row.skip = True
                row.skip_reason = "missing_name"
                rows.append(row)
                continue

            cat_id, place_type = _resolve_category_and_type(row)
            row.category_id = cat_id
            row.place_type = place_type

            parsed_hours = _parse_osm_opening_hours(row.opening_hours_raw)
            row.opening_hours = parsed_hours or _default_hours(cat_id)

            desc_ar, desc_he, desc_en, combined = _build_descriptions(row)
            row.description_ar = desc_ar
            row.description_he = desc_he
            row.description_en = desc_en
            row.description = combined
            row.score = _record_score(row)
            rows.append(row)

    return rows


def _dedupe_rows(rows: list[OsmRow]) -> tuple[list[OsmRow], list[OsmRow]]:
    """Return kept rows and duplicate rows removed before insert."""
    kept: list[OsmRow] = []
    skipped_dupes: list[OsmRow] = []
    seen_ids: set[str] = set()

    valid_rows = [r for r in rows if not r.skip]

    for row in valid_rows:
        if row.osm_id in seen_ids:
            row.skip_reason = "duplicate_osm_id"
            skipped_dupes.append(row)
            continue
        seen_ids.add(row.osm_id)
        kept.append(row)

    changed = True
    while changed:
        changed = False
        remove_indices: set[int] = set()
        for i in range(len(kept)):
            if i in remove_indices:
                continue
            for j in range(i + 1, len(kept)):
                if j in remove_indices:
                    continue
                a, b = kept[i], kept[j]
                dist = _haversine_m(a.lat, a.lon, b.lat, b.lon)
                if dist >= DUPLICATE_DISTANCE_M:
                    continue
                if not (
                    _names_similar(a.name_ar, b.name_ar)
                    or _names_similar(a.name_he, b.name_he)
                    or _names_similar(a.name, b.name)
                ):
                    continue
                loser_idx = j if a.score >= b.score else i
                loser = kept[loser_idx]
                loser.skip_reason = "duplicate_nearby"
                skipped_dupes.append(loser)
                remove_indices.add(loser_idx)
                changed = True
        if remove_indices:
            kept = [r for idx, r in enumerate(kept) if idx not in remove_indices]

    return kept, skipped_dupes


# ---------------------------------------------------------------------------
# Preview (no database)
# ---------------------------------------------------------------------------


def _truncate(text: str, max_len: int) -> str:
    text = (text or "").replace("\n", " ")
    if len(text) <= max_len:
        return text
    return text[: max_len - 1] + "…"


def _build_preview_rows() -> list[tuple[OsmRow, str]]:
    all_rows = _load_csv_rows()
    kept, skipped_dupes = _dedupe_rows(all_rows)
    insert_ids = {r.osm_id for r in kept}
    dupe_ids = {r.osm_id for r in skipped_dupes}

    preview: list[tuple[OsmRow, str]] = []
    for row in all_rows:
        if row.skip:
            preview.append((row, row.skip_reason))
        elif row.osm_id in dupe_ids:
            preview.append((row, row.skip_reason or "duplicate"))
        elif row.osm_id in insert_ids:
            preview.append((row, ""))
        else:
            preview.append((row, "duplicate"))
    return preview


def preview_rahat_places() -> None:
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"CSV not found: {CSV_PATH}")

    preview = _build_preview_rows()
    to_insert = sum(1 for _, reason in preview if not reason)
    skipped = len(preview) - to_insert

    headers = (
        "name_ar",
        "name_he",
        "name",
        "category_id",
        "place_type",
        "opening_hours",
        "lat",
        "lon",
        "skip_reason",
    )
    rows_out: list[list[str]] = []
    for row, reason in preview:
        rows_out.append(
            [
                row.name_ar,
                row.name_he,
                row.name,
                str(row.category_id),
                row.place_type,
                row.opening_hours or "",
                f"{row.lat:.6f}",
                f"{row.lon:.6f}",
                reason,
            ]
        )

    preview_csv = CSV_PATH.parent / "osm_places_rahat_preview.csv"
    with preview_csv.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows_out)

    print("Rahat OSM places — preview (no database changes)")
    print(f"Preview saved to: {preview_csv}")
    print(f"total rows: {len(preview)}")
    print(f"will insert: {to_insert}")
    print(f"will skip: {skipped}")


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------


def _get_admin_id(db) -> int:
    from models import User, UserRole

    admin = db.query(User).filter(User.role == UserRole.ADMIN).order_by(User.id).first()
    if not admin:
        raise RuntimeError("No admin user found. Run create_admin.py first.")
    return admin.id


def _place_exists(db, row: OsmRow) -> bool:
    from models import Location, Place

    existing_loc = db.query(Location).filter(Location.osm_id == row.osm_id).first()
    if existing_loc and existing_loc.place:
        return True

    places = (
        db.query(Place, Location)
        .join(Location, Place.location_id == Location.id)
        .filter(Place.city_id == RAHAT_CITY_ID)
        .all()
    )
    for place, loc in places:
        dist = _haversine_m(row.lat, row.lon, float(loc.lat), float(loc.lon))
        if dist >= DUPLICATE_DISTANCE_M:
            continue
        if _names_similar(row.name_ar, place.name_ar or "") or _names_similar(
            row.name_he, place.name_he or ""
        ):
            return True
    return False


def _insert_place(db, row: OsmRow, admin_id: int) -> None:
    from sqlalchemy import func

    from main import create_place_translation_key, update_translation_file
    from models import Location, Place, PlaceType

    location = Location(
        geom=func.ST_SetSRID(func.ST_MakePoint(row.lon, row.lat), 4326),
        source="OSM_SEARCH",
        osm_id=row.osm_id,
    )
    db.add(location)
    db.flush()

    can_be_claimed = row.place_type == "BUSINESS"

    place = Place(
        location_id=location.id,
        city_id=RAHAT_CITY_ID,
        category_id=row.category_id,
        place_type=PlaceType(row.place_type),
        name=row.name,
        name_ar=row.name_ar,
        name_he=row.name_he,
        can_be_claimed=can_be_claimed,
        description=row.description,
        phone=row.phone or None,
        opening_hours=row.opening_hours,
        social_links=row.website or None,
        owner_user_id=None,
        created_by_admin_id=admin_id,
    )
    db.add(place)
    db.flush()

    try:
        if place.name and place.name_ar and place.name_he:
            key = create_place_translation_key(place.name)
            update_translation_file(key, place.name_ar, place.name_he)
    except Exception as exc:
        print(f"Warning: translation sync failed for {place.name}: {exc}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def seed_rahat_places() -> None:
    from db import SessionLocal
    from models import City

    if not CSV_PATH.exists():
        raise FileNotFoundError(f"CSV not found: {CSV_PATH}")

    all_rows = _load_csv_rows()
    invalid_count = sum(1 for r in all_rows if r.skip)
    candidates, skipped_dupes = _dedupe_rows(all_rows)
    skipped_duplicates = len(skipped_dupes)

    db = SessionLocal()
    inserted = 0
    skipped_existing = 0

    try:
        city = db.query(City).filter(City.id == RAHAT_CITY_ID).first()
        if not city:
            raise RuntimeError(f"City id={RAHAT_CITY_ID} (Rahat) not found in database.")

        admin_id = _get_admin_id(db)

        for row in candidates:
            if _place_exists(db, row):
                skipped_existing += 1
                continue
            _insert_place(db, row, admin_id)
            inserted += 1

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print("Rahat OSM places seed finished.")
    print(f"inserted count: {inserted}")
    print(f"skipped duplicates count: {skipped_duplicates}")
    print(f"skipped existing count: {skipped_existing}")
    print(f"skipped invalid count: {invalid_count}")


if __name__ == "__main__":
    if "--preview" in sys.argv:
        preview_rahat_places()
    else:
        seed_rahat_places()
