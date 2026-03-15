# seed_places.py
import requests

BASE_URL = "http://127.0.0.1:8000"   # עדכני אם השרת רץ בכתובת אחרת
places = [ { "osm_id": "599579503", "place_type": "PUBLIC_SERVICE", "name": "Tel sheva", "name_ar": "تل السبع", "name_he": "תל שבע", "lat": 31.2456487, "lon": 34.8577683, "city_id": "3", "category_id": "null" }, { "osm_id": "1802987391", "place_type": "PUBLIC_SERVICE", "name": "Industrial Zone", "name_ar": "منطقة صناعية", "name_he": "אזור תעשיה", "lat": 31.257468, "lon": 34.865252, "city_id": "3", "category_id": "" }, { "osm_id": "1802996592", "place_type": "PUBLIC_SERVICE", "name": "Al-Andalus School", "name_ar": "مدرسة الأندلس", "name_he": "בית ספר אלאנדלוס", "lat": 31.255087, "lon": 34.862928, "city_id": "3", "category_id": "7" }, { "osm_id": "1802997030", "place_type": "PUBLIC_SERVICE", "name": "Abu Bakr School", "name_ar": "مدرسة أبو بكر", "name_he": "בית ספר אבו בקר א", "lat": 31.247417, "lon": 34.851319, "city_id": "3", "category_id": "7" }, { "osm_id": "1802997031", "place_type": "PUBLIC_SERVICE", "name": "Abu Bakr School", "name_ar": "مدرسة أبو بكر أ", "name_he": "בית ספר אבו בקר א", "lat": 31.247452, "lon": 34.852558, "city_id": "3", "category_id": "7" }, { "osm_id": "1802997239", "place_type": "PUBLIC_SERVICE", "name": "Al-Andalus School", "name_ar": "مدرسة الأندلس", "name_he": "בית ספר אלאנדלוס", "lat": 31.254496, "lon": 34.862228, "city_id": "3", "category_id": "7" }, { "osm_id": "1802998079", "place_type": "PUBLIC_SERVICE", "name": "Junior High School", "name_ar": "المدرسة الإعدادية", "name_he": "חטיבת הביניים", "lat": 31.247745, "lon": 34.856442, "city_id": "3", "category_id": "7" }, { "osm_id": "1803050875", "place_type": "PUBLIC_SERVICE", "name": "Water Tank", "name_ar": "الحاووز", "name_he": "מיכל מים", "lat": 31.257549, "lon": 34.865194, "city_id": "3", "category_id": "null" }, { "osm_id": "1803050975", "place_type": "PUBLIC_SERVICE", "name": "Football Field", "name_ar": "ملعب كرة قدم", "name_he": "מגרש כדורגל", "lat": 31.247331, "lon": 34.848878, "city_id": "3", "category_id": "11" }, { "osm_id": "1803050976", "place_type": "PUBLIC_SERVICE", "name": "Football Field", "name_ar": "ملعب كرة قدم", "name_he": "מגרש כדורגל", "lat": 31.247418, "lon": 34.848721, "city_id": "3", "category_id": "11" }, { "osm_id": "1803051813", "place_type": "PUBLIC_SERVICE", "name": "Local Council", "name_ar": "المجلس المحلي", "name_he": "מועצה מקומית", "lat": 31.247663, "lon": 34.854762, "city_id": "3", "category_id": "14" }, { "osm_id": "1803054637", "place_type": "PUBLIC_SERVICE", "name": "National Park", "name_ar": "منتزه تل السبع 1", "name_he": "גן לאומי תל שבע", "lat": 31.247306, "lon": 34.843569, "city_id": "3", "category_id": "10" }, { "osm_id": "1803054639", "place_type": "PUBLIC_SERVICE", "name": "National Park", "name_ar": "منتزه تل السبع", "name_he": "גן לאומי תל שבע", "lat": 31.247063, "lon": 34.843103, "city_id": "3", "category_id": "10" }, { "osm_id": "1803061832", "place_type": "PUBLIC_SERVICE", "name": "Beit Community Center", "name_ar": "مركز بايس جماهيري", "name_he": "מרכז קהילתי פאיס", "lat": 31.247752, "lon": 34.854844, "city_id": "3", "category_id": "13" }, { "osm_id": "1803094168", "place_type": "PUBLIC_SERVICE", "name": "Comprehensive High School Amal", "name_ar": "ثانوية شاملة عمال", "name_he": "בית ספר תיכון מקיף עמאל", "lat": 31.248437, "lon": 34.857283, "city_id": "3", "category_id": "7" }, { "osm_id": "1803094177", "place_type": "PUBLIC_SERVICE", "name": "Comprehensive High School Amal", "name_ar": "ثانوية شاملة عمال", "name_he": "בית ספר תיכון מקיף עמאל", "lat": 31.250257, "lon": 34.858192, "city_id": "3", "category_id": "7" }, { "osm_id": "5971828375", "place_type": "PUBLIC_SERVICE", "name": "Kindergarten", "name_ar": "روضة", "name_he": "גן ילדים", "lat": 31.2422745, "lon": 34.8612015, "city_id": "3", "category_id": "8" }, { "osm_id": "5971844953", "place_type": "BUSINESS", "name": "Bassam Supermarket", "name_ar": "سوبر ماركت بسام", "name_he": "בסאם סופר מרקט", "lat": 31.2421631, "lon": 34.8603759, "city_id": "3", "category_id": "3" }, { "osm_id": "5972499099", "place_type": "BUSINESS", "name": "Supermarket Al-Asam", "name_ar": "سوبر ماركت الاعسم", "name_he": "סופר מארקט אלאעסאם", "lat": 31.2473597, "lon": 34.8557875, "city_id": "3", "category_id": "3" }, { "osm_id": "5972509860", "place_type": "PUBLIC_SERVICE", "name": "Al-Hajra Mosque", "name_ar": "מסגד אלהגרה", "name_he": "מסגד אלהגרה", "lat": 31.2471012, "lon": 34.8608517, "city_id": "3", "category_id": "9" }, { "osm_id": "12098062035", "place_type": "BUSINESS", "name": "Moonlight Cafe", "name_ar": "MOONLIGHT مقهى", "name_he": "קפה MOONLIGHT", "lat": 31.2415957, "lon": 34.8588912, "city_id": "3", "category_id": "5" }, { "osm_id": "12098062042", "place_type": "PUBLIC_SERVICE", "name": "AlRayan Training Center", "name_ar": "مركز الريان", "name_he": "אלריאן הכשרה מקצועית", "lat": 31.2472382, "lon": 34.8545192, "city_id": "3", "category_id": "13" }, { "osm_id": "12098062043", "place_type": "PUBLIC_SERVICE", "name": "Post Office", "name_ar": "البريد", "name_he": "הדואר", "lat": 31.247146, "lon": 34.8557301, "city_id": "3", "category_id": "12" }, { "osm_id": "12098062044", "place_type": "BUSINESS", "name": "Falafel Hamed", "name_ar": "فلافل حامد", "name_he": "פלאפל חאמד", "lat": 31.2481872, "lon": 34.8572626, "city_id": "3", "category_id": "4" }, { "osm_id": "12098062045", "place_type": "BUSINESS", "name": "Cafe HaMerkaz", "name_ar": "كافيه المركز", "name_he": "קפה המרכז", "lat": 31.246467, "lon": 34.8572564, "city_id": "3", "category_id": "5" }, { "osm_id": "12098062046", "place_type": "PUBLIC_SERVICE", "name": "Bedouin Heritage Center", "name_ar": "مركز التراث والثقافة البدوية", "name_he": "המרכז למורשת ולתרבות בדואית", "lat": 31.2469578, "lon": 34.8546919, "city_id": "3", "category_id": "14" }, { "osm_id": "12098062047", "place_type": "BUSINESS", "name": "Supermarket Al-Bari", "name_ar": "سوبر ماركت البري", "name_he": "סופר מארקט אלברי", "lat": 31.2461029, "lon": 34.8603948, "city_id": "3", "category_id": "3" }, { "osm_id": "588753417", "place_type": "BUSINESS", "name": "White Market", "name_ar": "السوق الأبيض", "name_he": "השוק הלבן", "lat": 31.2469687, "lon": 34.8544072, "city_id": "3", "category_id": "3" }, { "osm_id": "588753473", "place_type": "PUBLIC_SERVICE", "name": "Al-Risalah Mosque", "name_ar": "مسجد الرسالة", "name_he": "מסגד אלרסאלה", "lat": 31.2439642, "lon": 34.8541318, "city_id": "3", "category_id": "9" }, { "osm_id": "633518239", "place_type": "PUBLIC_SERVICE", "name": "Al-Risalah Park", "name_ar": "منتزه الرساله", "name_he": "פארק אלרסאלה", "lat": 31.2446444, "lon": 34.8544119, "city_id": "3", "category_id": "10" }, { "osm_id": "1079699446", "place_type": "PUBLIC_SERVICE", "name": "Al-Noor Mosque", "name_ar": "مسحد النور", "name_he": "מסגר אלנור", "lat": 31.2532359, "lon": 34.8574253, "city_id": "3", "category_id": "9" }, { "osm_id": "1079699447", "place_type": "PUBLIC_SERVICE", "name": "School Amal A", "name_ar": "مدرسة عمال أ", "name_he": "בית ספר אמאל א", "lat": 31.2485918, "lon": 34.8562948, "city_id": "3", "category_id": "7" }, { "osm_id": "1079699449", "place_type": "PUBLIC_SERVICE", "name": "School Abu Baker A", "name_ar": "مدرسة ابو بكر أ", "name_he": "בית ספר אבו בקר א", "lat": 31.247903, "lon": 34.8527772, "city_id": "3", "category_id": "7" }, { "osm_id": "1079699451", "place_type": "PUBLIC_SERVICE", "name": "Police Station", "name_ar": "مركز الشرطة", "name_he": "תחנת משטרה", "lat": 31.2470707, "lon": 34.8567783, "city_id": "3", "category_id": "null" }, { "osm_id": "1079699452", "place_type": "PUBLIC_SERVICE", "name": "Clalit Clinic", "name_ar": "كلاليت", "name_he": "כללית", "lat": 31.2467336, "lon": 34.8565959, "city_id": "3", "category_id": "15" }, { "osm_id": "1079699639", "place_type": "PUBLIC_SERVICE", "name": "Al-Risalah School", "name_ar": "مدرسة الرساله", "name_he": "בית ספר אלרסאלה", "lat": 31.2446507, "lon": 34.854673, "city_id": "3", "category_id": "7" }, { "osm_id": "1079699640", "place_type": "PUBLIC_SERVICE", "name": "Al-Risalah Kindergarten", "name_ar": "روضة الرساله", "name_he": "גן ילדים אלרסאלה", "lat": 31.2438908, "lon": 34.8546478, "city_id": "3", "category_id": "8" }, { "osm_id": "1306270387", "place_type": "PUBLIC_SERVICE", "name": "Park Tel Sheva", "name_ar": "منتزه تل السبع", "name_he": "פארק תל שבע", "lat": 31.2450816, "lon": 34.8546346, "city_id": "3", "category_id": "10" } ]

# =========================================
# 1) קטגוריות – יווצרו רק אם לא קיימות
# =========================================
CATEGORIES = [
    { "name_en": "Supermarket", "name_he": "סופרמרקט", "name_ar": "سوبرماركت" },
    { "name_en": "Restaurant", "name_he": "מסעדה", "name_ar": "مطعم" },
    { "name_en": "Cafe", "name_he": "בית קפה", "name_ar": "مقهى" },
    { "name_en": "Clothing", "name_he": "בגדים", "name_ar": "ملابس" },
    { "name_en": "School", "name_he": "בית ספר", "name_ar": "مدرسة" },
    { "name_en": "Kindergarten", "name_he": "גן ילדים", "name_ar": "روضة" },
    { "name_en": "Mosque", "name_he": "מסגד", "name_ar": "مسجد" },
    { "name_en": "Park", "name_he": "פארק", "name_ar": "حديقة" },
    { "name_en": "Sport Facility", "name_he": "מתקן ספורט", "name_ar": "مرفق رياضي" },
    { "name_en": "Post Office", "name_he": "דואר", "name_ar": "بريد" },
    { "name_en": "Community Center", "name_he": "מרכז קהילתי", "name_ar": "مركز جماهيرי" },
    { "name_en": "Municipality", "name_he": "מועצה מקומית", "name_ar": "مجلس محلي" },
    { "name_en": "Clinic", "name_he": "מרפאה", "name_ar": "عيادة" }
]


# =========================================
# 2) ערים – יווצרו רק אם אינן קיימות
# =========================================
CITIES = [
    {"name_he": "תל שבע", "name_ar": "تل السبع", "name_en": "Tel Sheva"},
    {"name_he": "חורה", "name_ar": "حورة", "name_en": "Hura"},
    {"name_he": "לקיה", "name_ar": "لقية", "name_en": "Lakiya"},
    {"name_he": "כסייפה", "name_ar": "كسيفة", "name_en": "Kuseife"},
    {"name_he": "רהט", "name_ar": "رهط", "name_en": "Rahat"},
    {"name_he": "שגב שלום", "name_ar": "شقيب السلام", "name_en": "Segev Shalom"},
    {"name_he": "ערערה בנגב", "name_ar": "عرعرة النقب", "name_en": "Arara BaNegev"},
]


# ======================================================
# פונקציה עוזרת: שולחת POST רק אם אין כפילות
# ======================================================
def safe_post(url, data):
    try:
        response = requests.post(url, json=data)
        if response.status_code == 200 or response.status_code == 201:
            print("✓ נוצר:", data)
        else:
            print("⚠ לא נוצר:", data)
            print("סיבה:", response.text)
    except Exception as e:
        print("שגיאה:", e)


# =========================================
# שתילת קטגוריות
# =========================================
def seed_categories():
    print("\n=== יצירת קטגוריות ===")

    for cat in CATEGORIES:
        safe_post(f"{BASE_URL}/admin/categories", cat)


# =========================================
# שתילת ערים
# =========================================
def seed_cities():
    print("\n=== יצירת ערים ===")

    for city in CITIES:
        safe_post(f"{BASE_URL}/admin/cities", city)


# =========================================
# הרצת הכל
# =========================================
if __name__ == "__main__":
    seed_categories()
    seed_cities()
    print("\n🎉 סיום השתילה בהצלחה!")
