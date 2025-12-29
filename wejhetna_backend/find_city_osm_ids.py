"""
Script למציאת OSM Relation IDs של 3 הערים
זה יעזור למצוא את ה-boundaries המדויקים
"""

import requests
import json

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# קואורדינטות משוערות של הערים (מהנתונים שיש לנו)
CITIES = [
    {
        "name": "Rahat",
        "hebrew": "רהט",
        "arabic": "رهط",
        "lat": 31.39,
        "lon": 34.75
    },
    {
        "name": "Lakiya",
        "hebrew": "לקיה",
        "arabic": "لقية",
        "lat": 31.21,
        "lon": 34.81
    },
    {
        "name": "Tel Sheva",
        "hebrew": "תל שבע",
        "arabic": "تل السبع",
        "lat": 31.245,
        "lon": 34.857
    }
]


def find_city_relation(lat: float, lon: float, city_name: str):
    """
    מחפש relation (boundary) של עיר לפי קואורדינטות
    """
    # חיפוש ב-radius של 5 ק"מ
    query = f"""
    [out:json][timeout:25];
    (
      relation["admin_level"="8"]["type"="boundary"](around:5000,{lat},{lon});
      relation["place"="city"]["name"~"{city_name}",i](around:5000,{lat},{lon});
      relation["place"="town"]["name"~"{city_name}",i](around:5000,{lat},{lon});
    );
    out ids;
    """
    
    try:
        print(f"🔍 מחפש relation עבור {city_name} סביב ({lat}, {lon})...")
        response = requests.post(OVERPASS_URL, data={"data": query}, timeout=30)
        
        if response.status_code != 200:
            print(f"❌ שגיאה: {response.status_code}")
            return None
        
        data = response.json()
        
        if not data.get("elements"):
            print(f"⚠️  לא נמצא relation ל-{city_name}")
            return None
        
        relations = data["elements"]
        print(f"✅ נמצאו {len(relations)} relations:")
        
        for rel in relations:
            rel_id = rel.get("id")
            tags = rel.get("tags", {})
            name = tags.get("name", "ללא שם")
            name_he = tags.get("name:he", "")
            name_ar = tags.get("name:ar", "")
            admin_level = tags.get("admin_level", "")
            
            print(f"\n   Relation ID: {rel_id}")
            print(f"   שם: {name}")
            if name_he:
                print(f"   עברית: {name_he}")
            if name_ar:
                print(f"   ערבית: {name_ar}")
            print(f"   Admin Level: {admin_level}")
            print(f"   קישור: https://www.openstreetmap.org/relation/{rel_id}")
        
        return relations[0].get("id") if relations else None
        
    except Exception as e:
        print(f"❌ שגיאה: {e}")
        return None


def main():
    print("🚀 מתחיל חיפוש OSM Relation IDs...")
    print("=" * 60)
    
    results = {}
    
    for city in CITIES:
        print(f"\n{'='*60}")
        rel_id = find_city_relation(
            city["lat"],
            city["lon"],
            city["name"]
        )
        if rel_id:
            results[city["name"]] = rel_id
            print(f"\n✅ Relation ID עבור {city['name']}: {rel_id}")
        print("-" * 60)
    
    if results:
        print("\n" + "=" * 60)
        print("✅ סיכום - OSM Relation IDs:")
        print("=" * 60)
        for city_name, rel_id in results.items():
            print(f"{city_name}: {rel_id}")
            print(f"  קישור: https://www.openstreetmap.org/relation/{rel_id}")
        
        print("\n💡 עכשיו תוכל להשתמש ב-IDs האלה ב-fetch_city_boundaries.py")
    else:
        print("\n⚠️  לא נמצאו relations")
        print("נסה לחפש ידנית ב-OpenStreetMap")


if __name__ == "__main__":
    main()

