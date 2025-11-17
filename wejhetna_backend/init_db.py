from db import Base, engine
from models import Business

print("Creating tables...")
Base.metadata.create_all(bind=engine)
print("Done.")
