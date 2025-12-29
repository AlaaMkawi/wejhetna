"""
Script להורדת boundary משולב של לקיה
מאחד את Way 323451462 (residential) ו-Relation 1377267 (administrative boundary)
משתמש ב-union query של Overpass
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


def download_way_simple(way_id: int) -> Optional[List[Tuple[float, float]]]:
    """מוריד way עם query פשוט יותר"""
    query = f"""
    [out:json][timeout:30];
    way({way_id});
    out geom;
    """
    
    try:
        print(f"מוריד way {way_id}...")
        response = requests.post(OVERPASS_URL, data={"data": query}, timeout=60)
        
        if response.status_code != 200:
            print(f"שגיאה: {response.status_code}")
            if response.status_code == 504:
                print("Timeout - ה-way גדול מדי, נשתמש רק ב-relation")
            return None
        
        data = response.json()
        
        if not data.get("elements"):
            return None
        
        way = data["elements"][0]
        if "geometry" not in way:
            return None
        
        coords = [(node["lon"], node["lat"]) for node in way["geometry"]]
        print(f"נמצאו {len(coords)} נקודות ב-way")
        return coords
        
    except Exception as e:
        print(f"שגיאה: {e}")
        return None


def download_relation_simple(relation_id: int) -> Optional[List[Tuple[float, float]]]:
    """מוריד relation עם query פשוט"""
    query = f"""
    [out:json][timeout:30];
    relation({relation_id});
    out geom;
    """
    
    try:
        print(f"מוריד relation {relation_id}...")
        response = requests.post(OVERPASS_URL, data={"data": query}, timeout=60)
        
        if response.status_code != 200:
            print(f"שגיאה: {response.status_code}")
            return None
        
        data = response.json()
        
        if not data.get("elements"):
            return None
        
        relation = data["elements"][0]
        
        # אם יש geometry ישיר
        if "geometry" in relation:
            coords = [(node["lon"], node["lat"]) for node in relation["geometry"]]
            print(f"נמצאו {len(coords)} נקודות ב-relation (ישיר)")
            return coords
        
        # אחרת צריך להוריד את ה-ways
        print("צריך להוריד את ה-ways...")
        return None
        
    except Exception as e:
        print(f"שגיאה: {e}")
        return None


def create_union_polygon(coords_list: List[List[Tuple[float, float]]]) -> str:
    """
    יוצר polygon מאוחד מכמה רשימות של coordinates
    משתמש ב-convex hull פשוט
    """
    # איסוף כל הנקודות
    all_coords = []
    for coords in coords_list:
        all_coords.extend(coords)
    
    if len(all_coords) < 3:
        return None
    
    # הסרת כפילויות (עם עיגול)
    seen = set()
    unique_coords = []
    for coord in all_coords:
        rounded = (round(coord[0], 6), round(coord[1], 6))
        if rounded not in seen:
            seen.add(rounded)
            unique_coords.append(coord)
    
    # חישוב מרכז
    center_lon = sum(c[0] for c in unique_coords) / len(unique_coords)
    center_lat = sum(c[1] for c in unique_coords) / len(unique_coords)
    
    # מיון לפי זווית מהמרכז (convex hull פשוט)
    import math
    def angle_from_center(coord):
        dx = coord[0] - center_lon
        dy = coord[1] - center_lat
        return math.atan2(dy, dx)
    
    sorted_coords = sorted(unique_coords, key=angle_from_center)
    
    # סגירה
    if sorted_coords[0] != sorted_coords[-1]:
        sorted_coords.append(sorted_coords[0])
    
    # WKT
    points_str = ", ".join([f"{lon} {lat}" for lon, lat in sorted_coords])
    return f"POLYGON(({points_str}))"


def main():
    print("מוריד boundaries של לקיה...")
    print("=" * 60)
    
    all_boundaries = []
    
    # הורדת way
    print("\n1. הורדת Way (residential area)...")
    way_coords = download_way_simple(LAQIYA_WAY_ID)
    if way_coords:
        all_boundaries.append(way_coords)
    
    # הורדת relation (הקודם שכבר עובד)
    print("\n2. הורדת Relation (administrative boundary)...")
    # נשתמש ב-query המלא שכבר עובד
    query = f"""
    [out:json][timeout:60];
    (
      relation({LAQIYA_RELATION_ID});
    );
    (._;>;);
    out geom;
    """
    
    try:
        response = requests.post(OVERPASS_URL, data={"data": query}, timeout=90)
        if response.status_code == 200:
            data = response.json()
            relation = None
            ways = {}
            
            for element in data["elements"]:
                if element["type"] == "relation" and element["id"] == LAQIYA_RELATION_ID:
                    relation = element
                elif element["type"] == "way":
                    ways[element["id"]] = element
            
            if relation:
                members = relation.get("members", [])
                outer_ways = [m for m in members if m.get("role") == "outer"]
                
                relation_coords = []
                for member in outer_ways:
                    way_id = member.get("ref")
                    if way_id in ways and "geometry" in ways[way_id]:
                        for node in ways[way_id]["geometry"]:
                            relation_coords.append((node["lon"], node["lat"]))
                
                if relation_coords:
                    # הסרת כפילויות
                    seen = set()
                    cleaned = []
                    for coord in relation_coords:
                        rounded = (round(coord[0], 6), round(coord[1], 6))
                        if rounded not in seen:
                            seen.add(rounded)
                            cleaned.append(coord)
                    all_boundaries.append(cleaned)
                    print(f"נמצאו {len(cleaned)} נקודות ב-relation")
    except Exception as e:
        print(f"שגיאה: {e}")
    
    if not all_boundaries:
        print("\nשגיאה: לא הצלחנו להוריד אף boundary")
        return
    
    # יצירת union
    print(f"\n3. יוצר boundary מאוחד מ-{len(all_boundaries)} boundaries...")
    wkt = create_union_polygon(all_boundaries)
    
    if wkt:
        print("\n" + "=" * 60)
        print("Boundary מאוחד מוכן:")
        print("=" * 60)
        print(f'\nLAQIYA_BOUNDARY = """')
        print(wkt)
        print('"""')
        print(f"\nאורך: {len(wkt)} תווים")
    else:
        print("\nשגיאה: לא הצלחנו ליצור boundary מאוחד")


if __name__ == "__main__":
    main()

