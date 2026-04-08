"""
Migration script to add business_images_urls and business_license_image_url columns
to business_owner_place_requests table.

Run this script once to add the columns to your database.
"""

from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import DATABASE_URL - try both possible file names
try:
    from database import DATABASE_URL
except ImportError:
    try:
        from db import DATABASE_URL
    except ImportError:
        DATABASE_URL = os.getenv("DATABASE_URL")
        if not DATABASE_URL:
            print("❌ Error: DATABASE_URL is not set. Please create a .env file or set an environment variable.")
            exit(1)

def add_columns():
    """Add business_images_urls and business_license_image_url columns to the table."""
    
    engine = create_engine(DATABASE_URL)
    
    print("=" * 60)
    print("Adding columns to business_owner_place_requests table...")
    print("=" * 60)
    
    with engine.connect() as conn:
        # Check if columns already exist
        check_query = text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'business_owner_place_requests' 
            AND column_name IN ('business_license_image_url', 'business_images_urls')
        """)
        
        result = conn.execute(check_query)
        existing_columns = [row[0] for row in result]
        
        if 'business_license_image_url' in existing_columns:
            print("⚠️  Column 'business_license_image_url' already exists. Skipping...")
        else:
            print("✅ Adding 'business_license_image_url' column...")
            conn.execute(text("""
                ALTER TABLE business_owner_place_requests 
                ADD COLUMN business_license_image_url TEXT
            """))
            conn.commit()
            print("✅ Column 'business_license_image_url' added successfully!")
        
        if 'business_images_urls' in existing_columns:
            print("⚠️  Column 'business_images_urls' already exists. Skipping...")
        else:
            print("✅ Adding 'business_images_urls' column...")
            # For PostgreSQL, use ARRAY type
            conn.execute(text("""
                ALTER TABLE business_owner_place_requests 
                ADD COLUMN business_images_urls TEXT[]
            """))
            conn.commit()
            print("✅ Column 'business_images_urls' added successfully!")
    
    print("=" * 60)
    print("✅ Migration completed successfully!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Restart your backend server")
    print("2. Test the app - photos should now be saved and displayed!")

if __name__ == "__main__":
    try:
        add_columns()
    except Exception as e:
        print(f"❌ Error: {e}")
        print("\nMake sure:")
        print("1. Your database is running")
        print("2. The database connection in database.py is correct")
        print("3. You have permission to alter the table")

