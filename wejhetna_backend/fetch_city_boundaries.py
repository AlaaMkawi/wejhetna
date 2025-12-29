"""
Script להורדת boundaries של 3 הערים מ-OpenStreetMap
משתמש ב-Overpass API כדי למצוא את ה-boundaries האמיתיים
"""

import requests
import json
from typing import Optional, List, Tuple

# Overpass API endpoint
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# שמות הערים ב-OpenStreetMap (אפשר לחפש גם בעברית/ערבית)
CITIES_TO_FETCH = [
    {"name": "Rahat", "hebrew": "רהט", "arabic": "رهط"},
    {"name": "Lakiya", "hebrew": "לקיה", "arabic": "لقية"},
    {"name": "Tel Sheva", "hebrew": "תל שבע", "arabic": "تل السبع"},
]


def fetch_city_boundary(city_name: str, hebrew_name: str = None) -> Optional[str]:
    """
    מושך boundary של עיר מ-OpenStreetMap באמצעות Overpass API
    מחזיר WKT POLYGON string או None אם לא נמצא
    """
    
    # שאילתה ל-Overpass API - מחפש admin boundary של העיר
    # מנסה גם בעברית וגם באנגלית
    query = f"""
    [out:json][timeout:25];
    (
      relation["admin_level"="8"]["name"="{city_name}"]["type"="boundary"];
      relation["admin_level"="8"]["name:he"="{hebrew_name}"]["type"="boundary"];
      relation["admin_level"="8"]["name:ar"="{city_name}"]["type"="boundary"];
    );
    out geom;
    """
    
    try:
        print(f"🔍 מחפש boundary עבור: {city_name} ({hebrew_name})...")
        response = requests.post(OVERPASS_URL, data={"data": query}, timeout=30)
        
        if response.status_code != 200:
            print(f"❌ שגיאה בקבלת נתונים: {response.status_code}")
            return None
        
        data = response.json()
        
        if not data.get("elements"):
            print(f"⚠️  לא נמצא boundary ל-{city_name}")
            print("   נסה לחפש ידנית ב-OpenStreetMap:")
            print(f"   https://www.openstreetmap.org/search?query={city_name}")
            return None
        
        # לוקח את ה-relation הראשון (אמור להיות אחד)
        relation = data["elements"][0]
        
        if "members" not in relation:
            print(f"❌ לא נמצאו members ב-relation")
            return None
        
        # בונה את ה-polygon מה-members
        # זה מורכב - צריך לחבר את כל ה-ways
        # בואו ננסה גישה פשוטה יותר - נחפש את ה-outer way
        
        print(f"✅ נמצא boundary ל-{city_name}")
        print(f"   Relation ID: {relation.get('id')}")
        print(f"   Members: {len(relation.get('members', []))}")
        
        # אם יש geometry ב-relation עצמו (חדש יותר ב-Overpass)
        if "geometry" in relation:
            coords = relation["geometry"]
            if coords:
                # המרה ל-WKT POLYGON
                points = [f"{coord['lon']} {coord['lat']}" for coord in coords]
                # סגירה - הנקודה האחרונה = הראשונה
                if points[0] != points[-1]:
                    points.append(points[0])
                wkt = f"POLYGON(({', '.join(points)}))"
                return wkt
        
        # אם אין geometry ישיר, צריך לבנות מה-members
        # זה מורכב יותר - נצטרך לקחת את ה-ways ולחבר אותם
        print("⚠️  צריך לבנות את ה-polygon מה-members - זה מורכב יותר")
        print("   נסה להשתמש ב-OSM ID ישירות")
        
        return None
        
    except Exception as e:
        print(f"❌ שגיאה: {e}")
        return None


def fetch_by_osm_id(relation_id: int) -> Optional[str]:
    """
    מושך boundary לפי OSM relation ID
    זה יותר אמין - אם אתה יודע את ה-ID
    """
    query = f"""
    [out:json][timeout:25];
    relation({relation_id});
    out geom;
    """
    
    try:
        print(f"🔍 מחפש boundary לפי OSM ID: {relation_id}...")
        response = requests.post(OVERPASS_URL, data={"data": query}, timeout=30)
        
        if response.status_code != 200:
            print(f"❌ שגיאה: {response.status_code}")
            return None
        
        data = response.json()
        
        if not data.get("elements"):
            return None
        
        relation = data["elements"][0]
        
        if "geometry" in relation:
            coords = relation["geometry"]
            if coords:
                points = [f"{coord['lon']} {coord['lat']}" for coord in coords]
                if points[0] != points[-1]:
                    points.append(points[0])
                wkt = f"POLYGON(({', '.join(points)}))"
                return wkt
        
        return None
        
    except Exception as e:
        print(f"❌ שגיאה: {e}")
        return None


def manual_search_instructions():
    """
    הוראות למציאת boundaries ידנית
    """
    print("\n" + "=" * 60)
    print("📋 הוראות למציאת boundaries ידנית:")
    print("=" * 60)
    print("\n1. פתח את OpenStreetMap:")
    print("   https://www.openstreetmap.org")
    print("\n2. חפש כל עיר (רהט, לקיה, תל שבע)")
    print("\n3. לחץ על העיר → לחץ על 'Details' או 'Show'")
    print("\n4. חפש את ה-Relation ID (מספר כמו 12345678)")
    print("\n5. פתח את Overpass Turbo:")
    print("   https://overpass-turbo.eu")
    print("\n6. הכנס את השאילתה הבאה (החלף RELATION_ID):")
    print("""
    [out:json];
    relation(RELATION_ID);
    out geom;
    """)
    print("\n7. לחץ 'Run' → תקבל JSON עם ה-coordinates")
    print("\n8. המר את ה-coordinates ל-POLYGON WKT")
    print("\n" + "=" * 60)


def main():
    print("🚀 מתחיל חיפוש boundaries מ-OpenStreetMap...")
    print("=" * 60)
    
    results = {}
    
    for city in CITIES_TO_FETCH:
        boundary = fetch_city_boundary(city["name"], city["hebrew"])
        if boundary:
            results[city["name"]] = boundary
            print(f"\n✅ Boundary עבור {city['name']}:")
            print(boundary[:200] + "..." if len(boundary) > 200 else boundary)
        else:
            print(f"\n❌ לא נמצא boundary ל-{city['name']}")
        print("-" * 60)
    
    if not results:
        print("\n⚠️  לא נמצאו boundaries אוטומטית")
        manual_search_instructions()
    else:
        print("\n✅ נמצאו boundaries:")
        for city_name, boundary in results.items():
            print(f"\n{city_name}:")
            print(boundary)


if __name__ == "__main__":
    main()

