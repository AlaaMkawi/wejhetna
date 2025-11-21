from db import Base, engine
from models import Business
from models import *  # make sure Business, User, etc. are imported


print("Creating tables...")
Base.metadata.create_all(bind=engine)
print("Done.")
