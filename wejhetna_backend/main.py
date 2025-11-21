from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from db import SessionLocal
from models import Business
from schemas import BusinessRead, BusinessCreate

app = FastAPI(
    title="Wejhetna Backend",
    version="0.1.0"
)

# CORS (לאפליקציית React Native)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Database session ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Health check ---
@app.get("/")
def root():
    return {"message": "Wejhetna backend is alive 🚀"}

@app.get("/health")
def health():
    return {"status": "ok"}

# --- GET All Businesses ---
@app.get("/businesses", response_model=list[BusinessRead])
def list_businesses(db: Session = Depends(get_db)):
    return db.query(Business).all()

# --- POST Create Business ---
@app.post("/businesses", response_model=BusinessRead)
def create_business(item: BusinessCreate, db: Session = Depends(get_db)):
    # בדיקה אם שם כבר קיים
    existing = db.query(Business).filter(Business.name == item.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Business name already exists")

    # יצירת נקודה בפורמט WKT
    location_wkt = f"POINT({item.longitude} {item.latitude})"

    new_item = Business(
        name=item.name,
        category=item.category,
        location=location_wkt
    )

    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    return new_item