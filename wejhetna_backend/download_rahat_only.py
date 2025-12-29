"""
Script להורדת boundary של רהט בלבד
"""

import requests
import json
import sys
import io
from typing import List, Tuple, Optional

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
RAHAT_RELATION_ID = 1379225


def download_relation_boundary(relation_id: int) -> Optional[str]:
    """מוריד boundary של relation ומוחזר POLYGON WKT"""
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
        response = requests.post(OVERPASS_URL, data={"data": query}, timeout=120)
        
        if response.status_code != 200:
            print(f"שגיאה: {response.status_code}")
            if response.status_code == 504:
                print("Timeout - השרת עמוס, נסה שוב בעוד כמה דקות")
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
        
        tags = relation.get("tags", {})
        print(f"נמצא relation: {tags.get('name:ar', tags.get('name', 'N/A'))}")
        
        members = relation.get("members", [])
        outer_ways = [m for m in members if m.get("role") == "outer"]
        
        if not outer_ways:
            print("לא נמצאו outer ways")
            return None
        
        print(f"   Ways: {len(outer_ways)}, Nodes: {sum(len(ways.get(m.get('ref'), {}).get('geometry', [])) for m in outer_ways)}")
        print(f"   נמצאו {len(outer_ways)} outer ways")
        
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
        
        # סגירה
        if cleaned_coords[0] != cleaned_coords[-1]:
            cleaned_coords.append(cleaned_coords[0])
        
        print(f"נוצר POLYGON עם {len(cleaned_coords)} נקודות")
        
        # המרה ל-WKT
        points_str = ", ".join([f"{lon} {lat}" for lon, lat in cleaned_coords])
        wkt = f"POLYGON(({points_str}))"
        
        return wkt
        
    except Exception as e:
        print(f"שגיאה: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    print("מוריד boundary של רהט...")
    print("=" * 60)
    
    boundary = download_relation_boundary(RAHAT_RELATION_ID)
    
    if boundary:
        print("\n" + "=" * 60)
        print("Boundary מוכן להעתקה:")
        print("=" * 60)
        print(f'\nRAHAT_BOUNDARY = """')
        print(boundary)
        print('"""')
        print(f"\nאורך: {len(boundary)} תווים")
    else:
        print("\nלא הצלחנו להוריד את ה-boundary")
        print("נסה שוב בעוד כמה דקות - השרת של Overpass API עמוס לפעמים")

