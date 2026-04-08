"""
Script to fix business_images_urls column type and data

⚠️ IMPORTANT: This script will MODIFY your database!
Make sure to backup your database before running this script.

This script will:
1. Change the column type from TEXT to TEXT[] (PostgreSQL array)
2. Fix existing data by reconstructing URLs from character arrays
3. Convert any JSON strings to proper arrays

Usage:
    python fix_business_images_urls_column.py
"""

import sys
import json
import re
from pathlib import Path

# Add the current directory to the path so we can import modules
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

DATABASE_URL = None

try:
    from dotenv import load_dotenv
    import os
    load_dotenv()
    if os.getenv("DATABASE_URL"):
        DATABASE_URL = os.getenv("DATABASE_URL")
except:
    pass

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Create a .env file (or set an environment variable) "
        "with your PostgreSQL connection string."
    )

def reconstruct_url_from_chars(chars_list_or_str):
    """Reconstruct a URL from a list of characters or string"""
    if not chars_list_or_str:
        return None
    
    # If it's a list, join it
    if isinstance(chars_list_or_str, list):
        url_str = ''.join(chars_list_or_str)
    else:
        url_str = str(chars_list_or_str)
    
    # Remove PostgreSQL array braces and commas if present
    # Handle format like: {h,t,t,p,:,/,/,...} or {"h","t","t","p",...}
    # First, try to extract complete URL patterns
    url_pattern = r'(https?://[^\s"\'{}]+|/uploads/[^\s"\'{}]+\.(?:png|jpg|jpeg|gif|webp))'
    matches = re.findall(url_pattern, url_str)
    if matches:
        return matches[0]  # Return first match
    
    # If PostgreSQL array format like {h,t,t,p,:,/,/,1,0,.,0,.,2,.,2,:,8,0,0,0,/,u,p,l,o,a,d,s,/,...}
    # Try to reconstruct by removing commas and braces
    cleaned = url_str.replace('{', '').replace('}', '').replace(',', '').replace('"', '').replace("'", '').replace('\\', '').strip()
    
    # Look for http:// or /uploads/ in cleaned string
    if 'http://' in cleaned or 'https://' in cleaned:
        match = re.search(r'(https?://[^\s]+)', cleaned)
        if match:
            return match.group(1)
    
    if '/uploads/' in cleaned:
        # Extract everything from /uploads/ to end of string or next space/special char
        match = re.search(r'(/uploads/[^\s"\'{}]+)', cleaned)
        if match:
            return match.group(1)
    
    # Last resort: try to find any pattern that looks like a URL
    # Look for /uploads/ followed by alphanumeric/hyphens ending in image extension
    match = re.search(r'(/uploads/[a-z0-9-]+\.(?:png|jpg|jpeg|gif|webp))', cleaned, re.IGNORECASE)
    if match:
        return match.group(1)
    
    return None

def fix_database():
    print("=" * 60)
    print("Fixing business_images_urls column type and data...")
    print("=" * 60)
    print("WARNING: This script will MODIFY your database!")
    print("=" * 60)
    
    # Create engine and session
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        # Step 1: Check current column type
        print("\n1. Checking current column type...")
        result = db.execute(text("""
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name = 'places' AND column_name = 'business_images_urls'
        """))
        row = result.fetchone()
        if row:
            current_type = row[0]
            print(f"   Current type: {current_type}")
            if current_type == 'ARRAY' or '[]' in str(current_type):
                print("   ✅ Column is already an array type!")
                return
            else:
                print(f"   ❌ Column type is {current_type}, needs to be ARRAY")
        else:
            print("   ❌ Column not found!")
            return
        
        # Step 2: Get all places with business_images_urls
        print("\n2. Getting all places with business_images_urls...")
        result = db.execute(text("""
            SELECT id, name, business_images_urls
            FROM places 
            WHERE business_images_urls IS NOT NULL
        """))
        places = result.fetchall()
        
        if not places:
            print("   No places found with business_images_urls")
        else:
            print(f"   Found {len(places)} place(s)")
        
        # Step 3: Prepare data fixes
        print("\n3. Analyzing data...")
        fixes = []
        
        for place_id, place_name, old_value in places:
            new_value = None
            
            if old_value is None:
                continue
            
            # Try to parse as JSON string first
            if isinstance(old_value, str):
                try:
                    parsed = json.loads(old_value)
                    if isinstance(parsed, list):
                        # It's a JSON array string - use it directly
                        new_value = parsed
                    else:
                        # Try to extract URL from string
                        url = reconstruct_url_from_chars(old_value)
                        if url:
                            new_value = [url]
                except:
                    # Not JSON, try to extract URL from string
                    url = reconstruct_url_from_chars(old_value)
                    if url:
                        new_value = [url]
            elif isinstance(old_value, list):
                # It's already a list (from SQLAlchemy)
                # Try to reconstruct URL from character list
                url = reconstruct_url_from_chars(old_value)
                if url:
                    new_value = [url]
            
            # If still None, skip
            if new_value is None:
                print(f"   ⚠️  Could not parse Place ID {place_id} ({place_name}), will set to NULL")
                new_value = None
            
            fixes.append({
                'id': place_id,
                'name': place_name,
                'old': old_value,
                'new': new_value
            })
        
        # Show what will be changed
        print("\n4. Preview of changes:")
        for fix in fixes:
            print(f"\n   Place ID {fix['id']} ({fix['name']}):")
            print(f"   Old: {str(fix['old'])[:100]}...")
            print(f"   New: {fix['new']}")
        
        # Ask for confirmation
        print("\n" + "=" * 60)
        response = input("Do you want to proceed with the fix? (type 'yes' to confirm): ")
        if response.lower().strip() != 'yes':
            print("Cancelled.")
            return
        
        # Step 4: Create a temporary column
        print("\n5. Creating temporary column...")
        db.execute(text("""
            ALTER TABLE places 
            ADD COLUMN business_images_urls_temp TEXT[]
        """))
        db.commit()
        print("   ✅ Temporary column created")
        
        # Step 5: Migrate data to temporary column
        print("\n6. Migrating data...")
        for fix in fixes:
            if fix['new'] is None:
                db.execute(text("""
                    UPDATE places 
                    SET business_images_urls_temp = NULL 
                    WHERE id = :id
                """), {"id": fix['id']})
            else:
                db.execute(text("""
                    UPDATE places 
                    SET business_images_urls_temp = :urls 
                    WHERE id = :id
                """), {"urls": fix['new'], "id": fix['id']})
        db.commit()
        print(f"   ✅ Migrated {len(fixes)} place(s)")
        
        # Step 6: Drop old column
        print("\n7. Dropping old column...")
        db.execute(text("""
            ALTER TABLE places 
            DROP COLUMN business_images_urls
        """))
        db.commit()
        print("   ✅ Old column dropped")
        
        # Step 7: Rename temporary column
        print("\n8. Renaming temporary column...")
        db.execute(text("""
            ALTER TABLE places 
            RENAME COLUMN business_images_urls_temp TO business_images_urls
        """))
        db.commit()
        print("   ✅ Column renamed")
        
        # Step 8: Verify
        print("\n9. Verifying fix...")
        result = db.execute(text("""
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name = 'places' AND column_name = 'business_images_urls'
        """))
        row = result.fetchone()
        if row:
            new_type = row[0]
            print(f"   New type: {new_type}")
            if 'ARRAY' in str(new_type) or '[]' in str(new_type):
                print("   ✅ Column type is now correct!")
            else:
                print(f"   ⚠️  Column type is still {new_type}")
        
        # Check data
        result = db.execute(text("""
            SELECT id, name, business_images_urls 
            FROM places 
            WHERE business_images_urls IS NOT NULL 
            LIMIT 3
        """))
        rows = result.fetchall()
        if rows:
            print("\n   Sample data:")
            for row in rows:
                print(f"   Place ID {row[0]} ({row[1]}): {row[2]}")
        
        print("\n" + "=" * 60)
        print("✅ Fix complete!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        print("\n⚠️  Changes have been rolled back!")
    finally:
        db.close()

if __name__ == "__main__":
    fix_database()

