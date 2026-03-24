"""
Script to check how business_images_urls is stored in the database

Usage:
    python check_business_images_urls.py

This script will:
1. Connect to the database
2. Check the data type of business_images_urls column
3. Show sample data to see how it's stored
"""

import sys
import json
from pathlib import Path

# Add the current directory to the path so we can import modules
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from models import Place

# Database connection (same as in database.py)
DATABASE_URL = "postgresql+psycopg2://postgres:123@localhost:5432/wejhetna_db"

try:
    from dotenv import load_dotenv
    import os
    load_dotenv()
    if os.getenv("DATABASE_URL"):
        DATABASE_URL = os.getenv("DATABASE_URL")
except:
    pass

def check_database():
    print("=" * 60)
    print("Checking business_images_urls in database...")
    print("=" * 60)
    
    # Create engine and session
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        # Check the column type
        print("\n1. Checking column type...")
        inspector = inspect(engine)
        columns = inspector.get_columns('places')
        for col in columns:
            if col['name'] == 'business_images_urls':
                print(f"   Column name: {col['name']}")
                print(f"   Column type: {col['type']}")
                print(f"   Nullable: {col['nullable']}")
                break
        
        # Get places with business_images_urls
        print("\n2. Checking places with business_images_urls...")
        places = db.query(Place).filter(Place.business_images_urls != None).limit(5).all()
        
        if not places:
            print("   No places found with business_images_urls")
        else:
            print(f"   Found {len(places)} place(s) with business_images_urls\n")
            
            for i, place in enumerate(places, 1):
                print(f"   Place {i}:")
                print(f"   - ID: {place.id}")
                print(f"   - Name: {place.name}")
                print(f"   - business_images_urls value: {place.business_images_urls}")
                print(f"   - Type: {type(place.business_images_urls)}")
                
                # Check if it's a list or string
                if isinstance(place.business_images_urls, list):
                    print(f"   - It's a LIST with {len(place.business_images_urls)} items")
                    for j, url in enumerate(place.business_images_urls, 1):
                        print(f"     [{j}] {url}")
                elif isinstance(place.business_images_urls, str):
                    print(f"   - It's a STRING (should be a list!)")
                    print(f"   - String length: {len(place.business_images_urls)}")
                    print(f"   - String content: {place.business_images_urls[:100]}...")
                    
                    # Try to parse as JSON
                    try:
                        parsed = json.loads(place.business_images_urls)
                        if isinstance(parsed, list):
                            print(f"   - Can be parsed as JSON array with {len(parsed)} items")
                        else:
                            print(f"   - Can be parsed as JSON but it's not an array: {type(parsed)}")
                    except:
                        print(f"   - Cannot be parsed as JSON")
                else:
                    print(f"   - It's a {type(place.business_images_urls)} (unexpected type!)")
                
                print()
        
        # Check raw SQL to see how PostgreSQL stores it
        print("\n3. Checking raw SQL data...")
        result = db.execute(text("""
            SELECT id, name, business_images_urls, 
                   pg_typeof(business_images_urls) as type_name
            FROM places 
            WHERE business_images_urls IS NOT NULL 
            LIMIT 3
        """))
        
        rows = result.fetchall()
        if rows:
            for row in rows:
                print(f"   Place ID {row[0]} ({row[1]}):")
                print(f"   - PostgreSQL type: {row[3]}")
                print(f"   - Raw value: {row[2]}")
                print()
        else:
            print("   No places found with business_images_urls")
        
        print("=" * 60)
        print("Check complete!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    check_database()

