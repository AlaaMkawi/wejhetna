"""
Script to fix business_images_urls if stored incorrectly

⚠️ IMPORTANT: This script will MODIFY your database!
Make sure to backup your database before running this script.

Usage:
    python fix_business_images_urls.py

This script will:
1. Find places where business_images_urls is stored as a JSON string
2. Convert them to proper PostgreSQL arrays
3. Show what will be changed before making changes
"""

import sys
import json
from pathlib import Path

# Add the current directory to the path so we can import modules
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import create_engine, text
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

def fix_database():
    print("=" * 60)
    print("Fixing business_images_urls in database...")
    print("=" * 60)
    print("⚠️  This script will MODIFY your database!")
    print("=" * 60)
    
    # Create engine and session
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        # First, find places that need fixing
        print("\n1. Finding places that need fixing...\n")
        places = db.query(Place).filter(Place.business_images_urls != None).all()
        
        places_to_fix = []
        for place in places:
            if isinstance(place.business_images_urls, str):
                # Try to parse as JSON
                try:
                    parsed = json.loads(place.business_images_urls)
                    if isinstance(parsed, list):
                        places_to_fix.append({
                            'id': place.id,
                            'name': place.name,
                            'old_value': place.business_images_urls,
                            'new_value': parsed
                        })
                except:
                    pass
        
        if not places_to_fix:
            print("✅ No places need fixing! All business_images_urls are already stored as arrays.")
            return
        
        print(f"Found {len(places_to_fix)} place(s) that need fixing:\n")
        for item in places_to_fix:
            print(f"Place ID {item['id']} ({item['name']}):")
            print(f"  Old (string): {item['old_value'][:100]}...")
            print(f"  New (array): {item['new_value']}")
            print()
        
        # Ask for confirmation
        print("=" * 60)
        response = input("Do you want to fix these places? (yes/no): ")
        if response.lower() != 'yes':
            print("Cancelled.")
            return
        
        # Fix each place
        print("\n2. Fixing places...\n")
        fixed_count = 0
        
        for item in places_to_fix:
            try:
                # Update using raw SQL to ensure proper array type
                # PostgreSQL array format: ARRAY['url1', 'url2', 'url3']
                urls_array = item['new_value']
                if urls_array:
                    # Convert to PostgreSQL array format
                    array_sql = "ARRAY[" + ", ".join([f"'{url.replace(chr(39), chr(39)+chr(39))}'" for url in urls_array]) + "]"
                    query = text(f"""
                        UPDATE places 
                        SET business_images_urls = :urls_array
                        WHERE id = :place_id
                    """)
                    # Use array directly (SQLAlchemy should handle it)
                    db.execute(
                        text("UPDATE places SET business_images_urls = :urls WHERE id = :id"),
                        {"urls": urls_array, "id": item['id']}
                    )
                else:
                    db.execute(
                        text("UPDATE places SET business_images_urls = NULL WHERE id = :id"),
                        {"id": item['id']}
                    )
                
                db.commit()
                print(f"✅ Fixed Place ID {item['id']} ({item['name']})")
                fixed_count += 1
            except Exception as e:
                print(f"❌ Error fixing Place ID {item['id']}: {e}")
                db.rollback()
        
        print("\n" + "=" * 60)
        print(f"✅ Fixed {fixed_count} place(s)!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    fix_database()

