# schemas.py
from pydantic import BaseModel

# סכימה להצגת עסק (GET)
class BusinessRead(BaseModel):
    id: int
    name: str
    category: str | None = None

    class Config:
        orm_mode = True


# סכימה ליצירת עסק חדש (POST)
class BusinessCreate(BaseModel):
    name: str
    category: str | None = None
    latitude: float
    longitude: float
