# פתרון בעיות - Boundary Validation

## שגיאה: "Failed to check location boundary"

### סיבות אפשריות:

1. **השרת לא רץ**
   - ודא שהשרת FastAPI רץ על פורט 8000
   - הרץ: `uvicorn main:app --reload --host 0.0.0.0 --port 8000`

2. **בעיית חיבור**
   - באמולטור אנדרואיד: `http://10.0.2.2:8000`
   - במכשיר אמיתי: שנה את `BASE_URL` ב-`places.ts` לכתובת ה-IP של המחשב

3. **בעיה עם ה-endpoint**
   - בדוק שהשרת רץ: `http://localhost:8000/docs`
   - נסה את ה-endpoint ישירות: `POST http://localhost:8000/cities/check-boundary` עם body: `{"lat": 31.243, "lon": 34.843}`

4. **בעיה עם PostGIS**
   - ודא ש-PostGIS מותקן במסד הנתונים
   - ודא שה-boundaries עודכנו: הרץ `python add_city_boundaries.py`

### איך לבדוק:

1. **בדוק שהשרת רץ:**
   ```bash
   curl http://localhost:8000/docs
   ```

2. **בדוק את ה-endpoint:**
   ```bash
   curl -X POST http://localhost:8000/cities/check-boundary \
     -H "Content-Type: application/json" \
     -d '{"lat": 31.243, "lon": 34.843}'
   ```

3. **בדוק את ה-boundaries במסד הנתונים:**
   ```sql
   SELECT id, name_ar, name_he, boundary IS NOT NULL as has_boundary 
   FROM cities 
   WHERE name_ar IN ('رهط', 'لقية', 'تل السبع');
   ```

### פתרון זמני:

אם השרת לא רץ, האפליקציה תציע לך להמשיך בכל זאת (אבל זה לא מומלץ - צריך לבדוק boundaries).

