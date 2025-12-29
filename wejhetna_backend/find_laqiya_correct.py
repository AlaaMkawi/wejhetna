"""
Script לחיפוש לקיה הנכונה לפי קואורדינטות
"""

import requests
import json
import sys
import io

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# קואורדינטות של לקיה (מהמקורות)
LAQIYA_LAT = 31.21
LAQIYA_LON = 34.81

def search_laqiya_by_coords():
    """מחפש relations של לקיה לפי קואורדינטות"""
    query = f"""
    [out:json][timeout:25];
    (
      relation["name:he"="לקיה"]["type"="boundary"]["admin_level"="8"](around:5000,{LAQIYA_LAT},{LAQIYA_LON});
      relation["name:ar"="لقية"]["type"="boundary"]["admin_level"="8"](around:5000,{LAQIYA_LAT},{LAQIYA_LON});
      relation["name:en"="Lakiya"]["type"="boundary"]["admin_level"="8"](around:5000,{LAQIYA_LAT},{LAQIYA_LON});
    );
    out ids tags;
    """
    
    try:
        print("מחפש לקיה לפי קואורדינטות...")
        response = requests.post(OVERPASS_URL, data={"data": query}, timeout=60)
        
        if response.status_code != 200:
            print(f"שגיאה: {response.status_code}")
            return
        
        data = response.json()
        
        if not data.get("elements"):
            print("לא נמצאו results")
            return
        
        print("\nנמצאו relations:")
        print("=" * 60)
        for element in data["elements"]:
            if element["type"] == "relation":
                tags = element.get("tags", {})
                print(f"\nRelation ID: {element['id']}")
                print(f"  עברית: {tags.get('name:he', 'N/A')}")
                print(f"  ערבית: {tags.get('name:ar', 'N/A')}")
                print(f"  אנגלית: {tags.get('name:en', 'N/A')}")
                print(f"  Admin Level: {tags.get('admin_level', 'N/A')}")
                print(f"  קישור: https://www.openstreetmap.org/relation/{element['id']}")
                print("-" * 60)
                
    except Exception as e:
        print(f"שגיאה: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    search_laqiya_by_coords()

