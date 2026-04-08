import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Create a .env file (or set an environment variable) "
        "with your PostgreSQL connection string, e.g. "
        '"postgresql+psycopg2://USER:PASSWORD@HOST:5432/DBNAME".'
    )

engine = create_engine(DATABASE_URL, echo=True)  # echo=True = log SQL to console

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()
