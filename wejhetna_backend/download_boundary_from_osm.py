"""
Script להורדת boundary מ-OpenStreetMap לפי Relation ID
ומרת אותו ל-POLYGON WKT לשימוש במסד הנתונים
"""

import requests
import json
import sys
from typing import List, Tuple, Optional

# תיקון encoding ל-Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def download_relation_boundary(relation_id: int) -> Optional[str]:
    """
    מוריד boundary של relation מ-OpenStreetMap
    ומחזיר POLYGON WKT
    """
    query = f"""
    [out:json][timeout:60];
    (
      relation({relation_id});
    );
    (._;>;);
    out geom;
    """
    
    try:
        print(f"מוריד boundary עבור relation {relation_id}...")
        response = requests.post(OVERPASS_URL, data={"data": query}, timeout=90)
        
        if response.status_code != 200:
            print(f"❌ שגיאה: {response.status_code}")
            print(response.text)
            return None
        
        data = response.json()
        
        if not data.get("elements"):
            print("❌ לא נמצאו נתונים")
            return None
        
        # חיפוש ה-relation
        relation = None
        ways = {}
        nodes = {}
        
        for element in data["elements"]:
            if element["type"] == "relation" and element["id"] == relation_id:
                relation = element
            elif element["type"] == "way":
                ways[element["id"]] = element
            elif element["type"] == "node":
                nodes[element["id"]] = element
        
        if not relation:
            print("❌ לא נמצא relation")
            return None
        
        print(f"נמצא relation: {relation.get('tags', {}).get('name', 'ללא שם')}")
        print(f"   Ways: {len(ways)}, Nodes: {len(nodes)}")
        
        # בניית ה-polygon מה-ways
        # צריך למצוא את ה-outer ways ולחבר אותם
        members = relation.get("members", [])
        outer_ways = [m for m in members if m.get("role") == "outer"]
        
        if not outer_ways:
            print("לא נמצאו outer ways, מנסה את כל ה-ways...")
            outer_ways = [m for m in members if m.get("type") == "way"]
        
        if not outer_ways:
            print("לא נמצאו ways")
            return None
        
        print(f"   נמצאו {len(outer_ways)} outer ways")
        
        # איסוף כל ה-nodes מה-ways בסדר
        all_coords = []
        
        for member in outer_ways:
            way_id = member.get("ref")
            if way_id in ways:
                way = ways[way_id]
                if "geometry" in way:
                    for node in way["geometry"]:
                        all_coords.append((node["lon"], node["lat"]))
                elif "nodes" in way:
                    # אם אין geometry, נשתמש ב-nodes
                    for node_id in way["nodes"]:
                        if node_id in nodes:
                            node = nodes[node_id]
                            all_coords.append((node["lon"], node["lat"]))
        
        if not all_coords:
            print("לא נמצאו coordinates")
            return None
        
        # הסרת כפילויות רצופות
        cleaned_coords = []
        prev = None
        for coord in all_coords:
            if prev is None or coord != prev:
                cleaned_coords.append(coord)
            prev = coord
        
        # וידוא שהנקודה הראשונה = האחרונה (סגירה)
        if cleaned_coords[0] != cleaned_coords[-1]:
            cleaned_coords.append(cleaned_coords[0])
        
        # המרה ל-WKT
        points_str = ", ".join([f"{lon} {lat}" for lon, lat in cleaned_coords])
        wkt = f"POLYGON(({points_str}))"
        
        print(f"נוצר POLYGON עם {len(cleaned_coords)} נקודות")
        return wkt
        
    except Exception as e:
        print(f"שגיאה: {e}")
        import traceback
        traceback.print_exc()
        return None


def main():
    # Relation IDs של 3 הערים
    RELATION_IDS = {
        "תל שבע": 1376827,  # ✅ יש לנו
        "רהט": 1379225,  # ✅ נמצא!
        "לקיה": 1377267,  # ✅ יש לנו
    }
    
    print("מתחיל הורדת boundaries מ-OpenStreetMap...")
    print("=" * 60)
    
    results = {}
    
    # תל שבע
    if RELATION_IDS["תל שבע"]:
        print(f"\nתל שבע (Relation ID: {RELATION_IDS['תל שבע']})")
        print("-" * 60)
        boundary = download_relation_boundary(RELATION_IDS["תל שבע"])
        if boundary:
            results["תל שבע"] = boundary
            print(f"\nBoundary עבור תל שבע:")
            print(boundary[:200] + "..." if len(boundary) > 200 else boundary)
            print(f"\nאורך: {len(boundary)} תווים")
        else:
            print("לא הצלחנו להוריד את ה-boundary")
    
    # רהט
    if RELATION_IDS["רהט"]:
        print(f"\nרהט (Relation ID: {RELATION_IDS['רהט']})")
        print("-" * 60)
        boundary = download_relation_boundary(RELATION_IDS["רהט"])
        if boundary:
            results["רהט"] = boundary
            print(f"\nBoundary עבור רהט:")
            print(boundary[:200] + "..." if len(boundary) > 200 else boundary)
            print(f"\nאורך: {len(boundary)} תווים")
        else:
            print("לא הצלחנו להוריד את ה-boundary")
    
    # לקיה
    if RELATION_IDS["לקיה"]:
        print(f"\nלקיה (Relation ID: {RELATION_IDS['לקיה']})")
        print("-" * 60)
        boundary = download_relation_boundary(RELATION_IDS["לקיה"])
        if boundary:
            results["לקיה"] = boundary
            print(f"\nBoundary עבור לקיה:")
            print(boundary[:200] + "..." if len(boundary) > 200 else boundary)
            print(f"\nאורך: {len(boundary)} תווים")
        else:
            print("לא הצלחנו להוריד את ה-boundary")
    
    print("\n" + "=" * 60)
    print("עכשיו תוכל להעתיק את ה-boundary ל-add_city_boundaries.py")
    print("=" * 60)
    
    if results:
        print("\nBoundary מוכן להעתקה:")
        print("-" * 60)
        for city_name, boundary in results.items():
            var_name = city_name.upper().replace(" ", "_") + "_BOUNDARY"
            print(f"\n# {city_name}")
            print(f'{var_name} = """')
            print(boundary)
            print('"""')
            print()


if __name__ == "__main__":
    main()

