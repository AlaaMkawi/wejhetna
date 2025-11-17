import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# לקרוא את .env
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set in .env")

# יצירת engine
engine = create_engine(DATABASE_URL, echo=True)

# יצירת Session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# בסיס לכל המודלים
Base = declarative_base()
