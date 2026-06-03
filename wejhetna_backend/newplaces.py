import requests

API_URL = "https://hydrant-mutable-liqueur.ngrok-free.dev/admin/places"


def normalize(value):
    if value in ("", "null", None):
        return None
    return int(value)


# 📞 מספרי טלפון סטטיים – אחד לכל מקום (31 מקומות)
PHONES = [
    "0508348498",
    "0508348499",
    "0508348501",
    "0508348502",
    "0508348503",
    "0508348504",
    "0508348505",
    "0508348506",
    "0508348507",
    "0508348508",
    "0508348509",
    "0508348510",
    "0508348511",
    "0508348512",
    "0508348513",
    "0508348514",
    "0508348515",
    "0508348516",
    "0508348517",
    "0508348518",
    "0508348519",
    "0508348521",
    "0508348522",
    "0508348523",
    "0508348524",
    "0508348525",
    "0508348526",
    "0508348527",
    "0508348528",
    "0508348529",
    "0508348530",                   
    "0508348531",
    "0508348532",
    "0508348533",
]


places = [
    { "osm_id": "599579503", "place_type": "PUBLIC_SERVICE", "name": "Tel sheva", "name_ar": "تل السبع", "name_he": "תל שבע", "lat": 31.2456487, "lon": 34.8577683, "city_id": "9", "category_id": "28" },
    { "osm_id": "1802987391", "place_type": "PUBLIC_SERVICE", "name": "Industrial Zone", "name_ar": "منطقة صناعية", "name_he": "אזור תעשיה", "lat": 31.257468, "lon": 34.865252, "city_id": "9", "category_id": "28" },
    { "osm_id": "1802997239", "place_type": "PUBLIC_SERVICE", "name": "Al-Andalus School", "name_ar": "مدرسة الأندلس", "name_he": "בית ספר אלאנדלוס", "lat": 31.254929732227847, "lon": 34.86148881037913, "city_id": "9", "category_id": "19" },
    { "osm_id": "1803050875", "place_type": "PUBLIC_SERVICE", "name": "Water Tank", "name_ar": "الحاووز", "name_he": "מיכל מים", "lat": 31.257549, "lon": 34.865194, "city_id": "9", "category_id": "28" },
    { "osm_id": "1803050975", "place_type": "PUBLIC_SERVICE", "name": "Football Field", "name_ar": "ملعب كرة قدم", "name_he": "מגרש כדורגל", "lat": 31.247331, "lon": 34.848878, "city_id": "9", "category_id": "23" },
    { "osm_id": "1803050976", "place_type": "PUBLIC_SERVICE", "name": "Football Field", "name_ar": "ملعب كرة قدم", "name_he": "מגרש כדורגל", "lat": 31.247418, "lon": 34.848721, "city_id": "9", "category_id": "23" },
    { "osm_id": "1803051813", "place_type": "PUBLIC_SERVICE", "name": "Local Council", "name_ar": "المجلس المحلي", "name_he": "מועצה מקומית", "lat": 31.247663, "lon": 34.854762, "city_id": "9", "category_id": "26" },
    { "osm_id": "1803061832", "place_type": "PUBLIC_SERVICE", "name": "Beit Community Center", "name_ar": "مركز بايس جماهيري", "name_he": "מרכז קהילתי פאיס", "lat": 31.247752, "lon": 34.854844, "city_id": "9", "category_id": "25" },
    { "osm_id": "5971828375", "place_type": "PUBLIC_SERVICE", "name": "Kindergarten", "name_ar": "روضة", "name_he": "גן ילדים", "lat": 31.2422745, "lon": 34.8612015, "city_id": "9", "category_id": "20" },
    { "osm_id": "5971844953", "place_type": "BUSINESS", "name": "Bassam Supermarket", "name_ar": "سوبر ماركت بسام", "name_he": "בסאם סופר מרקט", "lat": 31.2421631, "lon": 34.8603759, "city_id": "9", "category_id": "15" },
    { "osm_id": "5972499099", "place_type": "BUSINESS", "name": "Supermarket Al-Asam", "name_ar": "سوبر ماركت الاعسم", "name_he": "סופר מארקט אלאעסאם", "lat": 31.2473597, "lon": 34.8557875, "city_id": "9", "category_id": "15" },
    { "osm_id": "5972509860", "place_type": "PUBLIC_SERVICE", "name": "Al-Hajra Mosque", "name_ar": "مسجد אלהגרה", "name_he": "מסגד אלהגרה", "lat": 31.2471012, "lon": 34.8608517, "city_id": "9", "category_id": "21" },
    { "osm_id": "12098062035", "place_type": "BUSINESS", "name": "Moonlight Cafe", "name_ar": "MOONLIGHT مقهى", "name_he": "קפה MOONLIGHT", "lat": 31.2415957, "lon": 34.8588912, "city_id": "9", "category_id": "17" },
    { "osm_id": "12098062042", "place_type": "PUBLIC_SERVICE", "name": "AlRayan Training Center", "name_ar": "مركز الريان", "name_he": "אלריאן הכשרה מקצועית", "lat": 31.2472382, "lon": 34.8545192, "city_id": "9", "category_id": "25" },
    { "osm_id": "12098062043", "place_type": "PUBLIC_SERVICE", "name": "Post Office", "name_ar": "البريد", "name_he": "הדואר", "lat": 31.247146, "lon": 34.8557301, "city_id": "9", "category_id": "24" },
    { "osm_id": "12098062044", "place_type": "BUSINESS", "name": "Falafel Hamed", "name_ar": "فلافل حامد", "name_he": "פלאפל חאמד", "lat": 31.2481872, "lon": 34.8572626, "city_id": "9", "category_id": "16" },
    { "osm_id": "12098062045", "place_type": "BUSINESS", "name": "Cafe HaMerkaz", "name_ar": "كافيه المركز", "name_he": "קפה המרכז", "lat": 31.246467, "lon": 34.8572564, "city_id": "9", "category_id": "17" },
    { "osm_id": "12098062046", "place_type": "PUBLIC_SERVICE", "name": "Bedouin Heritage Center", "name_ar": "مركز التراث والثقافة البدوية", "name_he": "המרכז למורשת ולתרבות בדואית", "lat": 31.2469578, "lon": 34.8546919, "city_id": "9", "category_id": "25" },
    { "osm_id": "12098062047", "place_type": "BUSINESS", "name": "Supermarket Al-Bari", "name_ar": "سوبر ماركت البري", "name_he": "סופר מארקט אלברי", "lat": 31.2461029, "lon": 34.8603948, "city_id": "9", "category_id": "15" },
    { "osm_id": "588753417", "place_type": "BUSINESS", "name": "White Market", "name_ar": "السوق الأبيض", "name_he": "השוק הלבן", "lat": 31.2469687, "lon": 34.8544072, "city_id": "9", "category_id": "15" },
    { "osm_id": "588753473", "place_type": "PUBLIC_SERVICE", "name": "Al-Risalah Mosque", "name_ar": "مسجد الرسالة", "name_he": "מסגד אלרסאלה", "lat": 31.2439642, "lon": 34.8541318, "city_id": "9", "category_id": "21" },
    { "osm_id": "1079699446", "place_type": "PUBLIC_SERVICE", "name": "Al-Noor Mosque", "name_ar": "مسحد النور", "name_he": "מסגר אלנור", "lat": 31.2532359, "lon": 34.8574253, "city_id": "9", "category_id": "21" },
    { "osm_id": "1079699447", "place_type": "PUBLIC_SERVICE", "name": "School Amal A", "name_ar": "مدرسة عمال أ", "name_he": "בית ספר אמאל א", "lat": 31.2485918, "lon": 34.8562948, "city_id": "9", "category_id": "19" },
    { "osm_id": "1079699449", "place_type": "PUBLIC_SERVICE", "name": "School Abu Baker A", "name_ar": "مدرسة ابو بكر أ", "name_he": "בית ספר אבו בקר א", "lat": 31.247903, "lon": 34.8527772, "city_id": "9", "category_id": "19" },
    { "osm_id": "1079699451", "place_type": "PUBLIC_SERVICE", "name": "Police Station", "name_ar": "مركز الشرطة", "name_he": "תחנת משטרה", "lat": 31.2470707, "lon": 34.8567783, "city_id": "9", "category_id": "28" },
    { "osm_id": "1079699452", "place_type": "PUBLIC_SERVICE", "name": "Clalit Clinic", "name_ar": "كلاليت", "name_he": "כללית", "lat": 31.2467336, "lon": 34.8565959, "city_id": "9", "category_id": "27" },
    { "osm_id": "1079699639", "place_type": "PUBLIC_SERVICE", "name": "Al-Risalah School", "name_ar": "مدرسة الرساله", "name_he": "בית ספר אלרסאלה", "lat": 31.2446507, "lon": 34.854673, "city_id": "9", "category_id": "19" },
    { "osm_id": "1079699640", "place_type": "PUBLIC_SERVICE", "name": "Al-Risalah Kindergarten", "name_ar": "روضة الرساله", "name_he": "גן ילדים אלרסאלה", "lat": 31.2438908, "lon": 34.8546478, "city_id": "9", "category_id": "20" },
    { "osm_id": "1306270387", "place_type": "PUBLIC_SERVICE", "name": "Park Tel Sheva", "name_ar": "منتزه تل السبع", "name_he": "פארק תל שבע", "lat": 31.2450816, "lon": 34.8546346, "city_id": "9", "category_id": "22" },

    {
        "osm_id": None,
        "place_type": "BUSINESS",
        "name": "Sharif Cafe",
        "name_ar": "مقهى شريف",
        "name_he": "בית קפה שריף",
        "lat": 31.250640508692957,
        "lon": 34.855445917403884,
        "city_id": "9",
        "category_id": "17"
    },

    {
        "osm_id": None,
        "place_type": "BUSINESS",
        "name": "Baraka",
        "name_ar": "بركة",
        "name_he": "בארכה",
        "lat": 31.247533616231536,
        "lon": 34.85335337788792,
        "city_id": "9",
        "category_id": "28"
    },

    {
        "osm_id": None,
        "place_type": "PUBLIC_SERVICE",
        "name": "Clalit Pharmacy",
        "name_ar": "صيدلية كلاليت",
        "name_he": "בית מרקחת כללית",
        "lat": 31.246849723834067,
        "lon": 34.85671203615897,
        "city_id": "9",
        "category_id": "27"
    },

    {
        "osm_id": None,
        "place_type": "BUSINESS",
        "name": "Mobile Phone Store",
        "name_ar": "متجر هواتف نقالة",
        "name_he": "חנות לטלפונים ניידים",
        "lat": 31.249032440917833,
        "lon": 34.855120142330286,
        "city_id": "9",
        "category_id": "28"
    },

    {
        "osm_id": None,
        "place_type": "BUSINESS",
        "name": "Manch",
        "name_ar": "مانش",
        "name_he": "מאנש",
        "lat": 31.254906801447365,
        "lon": 34.868722621756895,
        "city_id": "9",
        "category_id": "16"
    },
]


def newplaces():
    for idx, p in enumerate(places):
        payload = {
            "osm_id": p["osm_id"],
            "place_type": p["place_type"],
            "name": p["name"],
            "name_ar": p["name_ar"],
            "name_he": p["name_he"],
            "lat": p["lat"],
            "lon": p["lon"],
            "city_id": int(p["city_id"]),
            "category_id": normalize(p["category_id"]),
            "created_by_admin_id": 1,
            "phone": PHONES[idx],
        }

        print(f"Adding place: {p['name']} ...")
        res = requests.post(API_URL, json=payload)
        print("Status:", res.status_code)
        print("Response:", res.text)
        print("-----------------------------------")


if __name__ == "__main__":
    newplaces()