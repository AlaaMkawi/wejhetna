# seed_places.py
import requests

# אם השרת רץ לוקלית:
BASE_URL = "http://127.0.0.1:8000"

# פרטי המקום שאנחנו רוצים להוסיף
PLACE_LAT = 31.257500
PLACE_LON = 34.865209
PLACE_NAME = "منطقة صناعية"

# שמות העיר (כמו אצלך בטבלה)
CITY_NAME_HE = "תל שבע"
CITY_NAME_AR = "تل السبع"


def get_city_id():
    """
    מביא את ה-id של העיר תל שבע מתוך /admin/cities
    """
    url = f"{BASE_URL}/admin/cities"
    resp = requests.get(url)
    resp.raise_for_status()
    cities = resp.json()

    for c in cities:
        if c.get("name_he") == CITY_NAME_HE or c.get("name_ar") == CITY_NAME_AR:
            return c["id"]

    raise SystemExit(
        f"לא מצאתי עיר בשם {CITY_NAME_HE} / {CITY_NAME_AR}. "
        "תבדקי שקיימת בטבלת הערים."
    )


def create_place():
    city_id = get_city_id()

    payload = {
        "name": PLACE_NAME,
        "place_type": "PUBLIC_SERVICE",   # כדי לא לדרוש category_id
        "city_id": city_id,
        "category_id": None,              # כי זה לא BUSINESS
        "lat": PLACE_LAT,
        "lon": PLACE_LON,
        "can_be_claimed": True,
        "description": "אזור תעשייה בתל שבע שנוסף דרך seed",
        "phone": None,
        "opening_hours": None,
        "main_image_url": None,
        "social_links": None,
        "owner_user_id": None,            # אין בעל עסק כרגע
    }

    url = f"{BASE_URL}/admin/places"
    resp = requests.post(url, json=payload)

    print("Status code:", resp.status_code)
    try:
        print("Response JSON:", resp.json())
    except Exception:
        print("Raw response:", resp.text)


if __name__ == "__main__":
    create_place()
