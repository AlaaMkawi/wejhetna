"""
Script לבדיקת API endpoint של boundary validation
"""

import requests
import json
import sys
import io

if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BASE_URL = "http://localhost:8000"  # שנה אם צריך

# נקודות לבדיקה
TEST_POINTS = [
    # נקודות בתוך הערים (צריכות להחזיר is_within=True)
    {
        "name": "תל שבע - מרכז העיר",
        "lat": 31.243,
        "lon": 34.843,
        "expected": True
    },
    {
        "name": "רהט - מרכז העיר",
        "lat": 31.395,
        "lon": 34.755,
        "expected": True
    },
    {
        "name": "לקיה - מרכז העיר",
        "lat": 31.319,
        "lon": 34.888,
        "expected": True
    },
    # נקודות מחוץ לערים (צריכות להחזיר is_within=False)
    {
        "name": "באר שבע - מחוץ לתל שבע",
        "lat": 31.243,
        "lon": 34.792,
        "expected": False
    },
    {
        "name": "ירושלים - רחוק מאוד",
        "lat": 31.768,
        "lon": 35.214,
        "expected": False
    },
    {
        "name": "תל אביב - רחוק מאוד",
        "lat": 32.085,
        "lon": 34.782,
        "expected": False
    },
]


def test_boundary_check():
    """בודק את ה-API endpoint"""
    print("=" * 60)
    print("בדיקת API endpoint: /cities/check-boundary")
    print("=" * 60)
    
    passed = 0
    failed = 0
    
    for point in TEST_POINTS:
        print(f"\nנקודת בדיקה: {point['name']}")
        print(f"  קואורדינטות: lat={point['lat']}, lon={point['lon']}")
        print(f"  צפוי: is_within={point['expected']}")
        
        try:
            response = requests.post(
                f"{BASE_URL}/cities/check-boundary",
                json={"lat": point["lat"], "lon": point["lon"]},
                timeout=10
            )
            
            if response.status_code != 200:
                print(f"  ❌ שגיאה: {response.status_code}")
                print(f"  {response.text}")
                failed += 1
                continue
            
            data = response.json()
            is_within = data.get("is_within", None)
            
            if is_within == point["expected"]:
                print(f"  ✅ עבר - is_within={is_within}")
                if is_within:
                    city_name = data.get("city_name_ar") or data.get("city_name_he") or data.get("city_name_en", "N/A")
                    print(f"     עיר: {city_name} (ID: {data.get('city_id')})")
                passed += 1
            else:
                print(f"  ❌ נכשל - is_within={is_within} (צפוי: {point['expected']})")
                failed += 1
                
        except requests.exceptions.ConnectionError:
            print(f"  ❌ שגיאה: לא ניתן להתחבר לשרת. ודא שהשרת רץ על {BASE_URL}")
            failed += 1
        except Exception as e:
            print(f"  ❌ שגיאה: {e}")
            failed += 1
    
    print("\n" + "=" * 60)
    print(f"סיכום: {passed} עברו, {failed} נכשלו")
    print("=" * 60)
    
    if failed == 0:
        print("✅ כל הבדיקות עברו בהצלחה!")
        return 0
    else:
        print("❌ חלק מהבדיקות נכשלו")
        return 1


if __name__ == "__main__":
    exit_code = test_boundary_check()
    sys.exit(exit_code)

