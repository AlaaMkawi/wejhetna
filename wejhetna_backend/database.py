# database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# ⚠️ CHANGE username, password, dbname if needed
DATABASE_URL = "postgresql+psycopg2://postgres:123@localhost:5432/wejhetna_db"

engine = create_engine(DATABASE_URL, echo=True)  # echo=True = log SQL to console

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
