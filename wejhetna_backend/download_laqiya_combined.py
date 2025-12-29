"""
Script להורדת boundary משולב של לקיה
מאחד את Way 323451462 (residential) ו-Relation 1377267 (administrative boundary)
"""

import requests
import json
import sys
import io
from typing import List, Tuple, Optional

# תיקון encoding ל-Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# IDs של שני ה-boundaries של לקיה
LAQIYA_WAY_ID = 323451462  # landuse=residential
LAQIYA_RELATION_ID = 1377267  # boundary=administrative


def download_way_boundary(way_id: int) -> Optional[List[Tuple[float, float]]]:
    """מוריד way ומוחזר רשימת coordinates"""
    query = f"""
    [out:json][timeout:60];
    (
      way({way_id});
    );
    (._;>;);
    out geom;
    """
    
    try:
        print(f"מוריד way {way_id}...")
        response = requests.post(OVERPASS_URL, data={"data": query}, timeout=90)
        
        if response.status_code != 200:
            print(f"שגיאה: {response.status_code}")
            return None
        
        data = response.json()
        
        if not data.get("elements"):
            print("לא נמצאו נתונים")
            return None
        
        way = None
        for element in data["elements"]:
            if element["type"] == "way" and element["id"] == way_id:
                way = element
                break
        
        if not way:
            print("לא נמצא way")
            return None
        
        if "geometry" not in way:
            print("ל-way אין geometry")
            return None
        
        coords = [(node["lon"], node["lat"]) for node in way["geometry"]]
        print(f"נמצאו {len(coords)} נקודות ב-way")
        return coords
        
    except Exception as e:
        print(f"שגיאה: {e}")
        import traceback
        traceback.print_exc()
        return None


def download_relation_boundary(relation_id: int) -> Optional[List[Tuple[float, float]]]:
    """מוריד relation boundary ומוחזר רשימת coordinates"""
    query = f"""
    [out:json][timeout:60];
    (
      relation({relation_id});
    );
    (._;>;);
    out geom;
    """
    
    try:
        print(f"מוריד relation {relation_id}...")
        response = requests.post(OVERPASS_URL, data={"data": query}, timeout=90)
        
        if response.status_code != 200:
            print(f"שגיאה: {response.status_code}")
            return None
        
        data = response.json()
        
        if not data.get("elements"):
            print("לא נמצאו נתונים")
            return None
        
        relation = None
        ways = {}
        
        for element in data["elements"]:
            if element["type"] == "relation" and element["id"] == relation_id:
                relation = element
            elif element["type"] == "way":
                ways[element["id"]] = element
        
        if not relation:
            print("לא נמצא relation")
            return None
        
        members = relation.get("members", [])
        outer_ways = [m for m in members if m.get("role") == "outer"]
        
        if not outer_ways:
            print("לא נמצאו outer ways")
            return None
        
        all_coords = []
        for member in outer_ways:
            way_id = member.get("ref")
            if way_id in ways:
                way = ways[way_id]
                if "geometry" in way:
                    for node in way["geometry"]:
                        all_coords.append((node["lon"], node["lat"]))
        
        if not all_coords:
            print("לא נמצאו coordinates")
            return None
        
        # הסרת כפילויות
        cleaned_coords = []
        prev = None
        for coord in all_coords:
            if prev is None or coord != prev:
                cleaned_coords.append(coord)
            prev = coord
        
        print(f"נמצאו {len(cleaned_coords)} נקודות ב-relation")
        return cleaned_coords
        
    except Exception as e:
        print(f"שגיאה: {e}")
        import traceback
        traceback.print_exc()
        return None


def combine_boundaries(way_coords: List[Tuple[float, float]], 
                      relation_coords: List[Tuple[float, float]]) -> str:
    """
    מאחד שני boundaries ל-polygon אחד
    משתמש ב-convex hull או union - פשוט נחבר את כל הנקודות
    """
    # איסוף כל הנקודות
    all_coords = way_coords + relation_coords
    
    # הסרת כפילויות
    seen = set()
    unique_coords = []
    for coord in all_coords:
        # עיגול ל-6 ספרות אחרי הנקודה כדי להסיר כפילויות
        rounded = (round(coord[0], 6), round(coord[1], 6))
        if rounded not in seen:
            seen.add(rounded)
            unique_coords.append(coord)
    
    # יצירת convex hull פשוט - נשתמש בכל הנקודות בסדר
    # (זה לא מושלם אבל יעבוד)
    # נסידר לפי זווית מהמרכז
    if len(unique_coords) < 3:
        print("לא מספיק נקודות ל-polygon")
        return None
    
    # חישוב מרכז
    center_lon = sum(c[0] for c in unique_coords) / len(unique_coords)
    center_lat = sum(c[1] for c in unique_coords) / len(unique_coords)
    
    # מיון לפי זווית מהמרכז
    import math
    def angle_from_center(coord):
        dx = coord[0] - center_lon
        dy = coord[1] - center_lat
        return math.atan2(dy, dx)
    
    sorted_coords = sorted(unique_coords, key=angle_from_center)
    
    # וידוא שהנקודה הראשונה = האחרונה
    if sorted_coords[0] != sorted_coords[-1]:
        sorted_coords.append(sorted_coords[0])
    
    # המרה ל-WKT
    points_str = ", ".join([f"{lon} {lat}" for lon, lat in sorted_coords])
    wkt = f"POLYGON(({points_str}))"
    
    return wkt


def main():
    print("מוריד boundaries של לקיה...")
    print("=" * 60)
    
    # הורדת way (residential)
    print("\n1. הורדת Way (residential area)...")
    way_coords = download_way_boundary(LAQIYA_WAY_ID)
    
    # הורדת relation (administrative boundary)
    print("\n2. הורדת Relation (administrative boundary)...")
    relation_coords = download_relation_boundary(LAQIYA_RELATION_ID)
    
    if not way_coords and not relation_coords:
        print("\nשגיאה: לא הצלחנו להוריד אף boundary")
        return
    
    # אם יש רק אחד, השתמש בו
    if way_coords and not relation_coords:
        print("\nמשתמש רק ב-way boundary")
        coords = way_coords
    elif relation_coords and not way_coords:
        print("\nמשתמש רק ב-relation boundary")
        coords = relation_coords
    else:
        print("\n3. מאחד את שני ה-boundaries...")
        # פשוט נשתמש ב-relation כי הוא יותר מדויק (administrative boundary)
        # אבל נוסיף נקודות מה-way אם הן מחוץ ל-relation
        coords = relation_coords
        # נוסיף נקודות מה-way שלא קרובות מדי לנקודות ב-relation
        import math
        for way_coord in way_coords:
            # בדוק אם הנקודה קרובה מדי לנקודה ב-relation
            too_close = False
            for rel_coord in relation_coords:
                dist = math.sqrt(
                    (way_coord[0] - rel_coord[0])**2 + 
                    (way_coord[1] - rel_coord[1])**2
                )
                if dist < 0.001:  # פחות מ-100 מטר
                    too_close = True
                    break
            if not too_close:
                coords.append(way_coord)
    
    # יצירת WKT
    if coords:
        # סגירה
        if coords[0] != coords[-1]:
            coords.append(coords[0])
        
        points_str = ", ".join([f"{lon} {lat}" for lon, lat in coords])
        wkt = f"POLYGON(({points_str}))"
        
        print("\n" + "=" * 60)
        print("Boundary מוכן להעתקה:")
        print("=" * 60)
        print(f'\nLAQIYA_BOUNDARY = """')
        print(wkt)
        print('"""')
        print(f"\nאורך: {len(wkt)} תווים")
        print(f"מספר נקודות: {len(coords)}")
    else:
        print("\nשגיאה: לא הצלחנו ליצור boundary")


if __name__ == "__main__":
    main()

