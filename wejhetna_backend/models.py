from sqlalchemy import Column, Integer, String, Boolean
from geoalchemy2 import Geography
from db import Base

class Business(Base):
    __tablename__ = "businesses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=True)

    location = Column(
        Geography(geometry_type="POINT", srid=4326),
        nullable=True
    )

