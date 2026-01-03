"""
Script לחיפוש Relation ID של לקיה ב-OpenStreetMap
"""

import requests
import json
import sys
import io

# תיקון encoding ל-Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# קואורדינטות של לקיה (מהנתונים שיש לנו)
LAQIYA_LAT = 31.21
LAQIYA_LON = 34.81

def search_laqiya():
    """
    מחפש את לקיה ב-OpenStreetMap
    """
    # חיפוש לפי שם וקואורדינטות
    queries = [
        # חיפוש לפי שם בעברית
        f"""
        [out:json][timeout:25];
        (
          relation["name:he"="לקיה"]["type"="boundary"]["admin_level"="8"];
          relation["name:he"="לקיה"]["place"="town"];
          relation["name:he"="לקיה"]["place"="city"];
        );
        out ids tags;
        """,
        # חיפוש לפי שם בערבית
        f"""
        [out:json][timeout:25];
        (
          relation["name:ar"="لقية"]["type"="boundary"]["admin_level"="8"];
          relation["name:ar"="لقية"]["place"="town"];
          relation["name:ar"="لقية"]["place"="city"];
        );
        out ids tags;
        """,
        # חיפוש לפי שם באנגלית
        f"""
        [out:json][timeout:25];
        (
          relation["name:en"="Lakiya"]["type"="boundary"]["admin_level"="8"];
          relation["name:en"="Lakiya"]["place"="town"];
          relation["name:en"="Lakiya"]["place"="city"];
        );
        out ids tags;
        """,
        # חיפוש לפי קואורדינטות
        f"""
        [out:json][timeout:25];
        (
          relation["admin_level"="8"]["type"="boundary"](around:3000,{LAQIYA_LAT},{LAQIYA_LON});
          relation["place"="town"](around:3000,{LAQIYA_LAT},{LAQIYA_LON});
          relation["place"="city"](around:3000,{LAQIYA_LAT},{LAQIYA_LON});
        );
        out ids tags;
        """
    ]
    
    all_results = []
    
    for i, query in enumerate(queries, 1):
        try:
            print(f"\nחיפוש {i}/4...", end=" ")
            response = requests.post(OVERPASS_URL, data={"data": query}, timeout=30)
            
            if response.status_code != 200:
                print(f"שגיאה: {response.status_code}")
                continue
            
            data = response.json()
            
            if data.get("elements"):
                for element in data["elements"]:
                    if element["type"] == "relation":
                        tags = element.get("tags", {})
                        name_he = tags.get("name:he", "")
                        name_ar = tags.get("name:ar", "")
                        name_en = tags.get("name:en", "")
                        admin_level = tags.get("admin_level", "")
                        
                        # בדיקה אם זה לקיה
                        if any([
                            "לקיה" in name_he,
                            "لقية" in name_ar,
                            "Lakiya" in name_en or "Laqiya" in name_en
                        ]):
                            all_results.append({
                                "id": element["id"],
                                "name_he": name_he,
                                "name_ar": name_ar,
                                "name_en": name_en,
                                "admin_level": admin_level,
                                "tags": tags
                            })
        except Exception as e:
            print(f"שגיאה בחיפוש {i}: {e}")
    
    # הסרת כפילויות
    seen_ids = set()
    unique_results = []
    for result in all_results:
        if result["id"] not in seen_ids:
            seen_ids.add(result["id"])
            unique_results.append(result)
    
    if unique_results:
        print("\n" + "=" * 60)
        print("נמצאו relations עבור לקיה:")
        print("=" * 60)
        for result in unique_results:
            print(f"\nRelation ID: {result['id']}")
            print(f"  עברית: {result['name_he']}")
            print(f"  ערבית: {result['name_ar']}")
            print(f"  אנגלית: {result['name_en']}")
            print(f"  Admin Level: {result['admin_level']}")
            print(f"  קישור: https://www.openstreetmap.org/relation/{result['id']}")
            print("-" * 60)
        
        # אם יש רק אחד, זה כנראה הנכון
        if len(unique_results) == 1:
            print(f"\n✅ זה כנראה לקיה! Relation ID: {unique_results[0]['id']}")
    else:
        print("\nלא נמצאו results")
        print("\nנסה לחפש ידנית:")
        print("1. פתח: https://www.openstreetmap.org")
        print("2. חפש: Lakiya או לקיה")
        print("3. לחץ על העיר → Details → מצא את ה-Relation ID")


if __name__ == "__main__":
    print("מחפש את לקיה ב-OpenStreetMap...")
    print("=" * 60)
    laqiya_id = search_laqiya()
    if laqiya_id:
        print(f"\n" + "=" * 60)
        print(f"✅ Relation ID של לקיה: {laqiya_id}")
        print(f"עכשיו תוכל להוריד את ה-boundary עם:")
        print(f"python download_boundary_from_osm.py")
        print("=" * 60)

