# Step-by-Step Guide: Check and Fix business_images_urls

This guide will help you check how `business_images_urls` is stored in your database and fix it if needed.

---

## Step 1: Check the Database

### Option A: Using the Python Script (Recommended)

1. **Open a terminal/command prompt**

2. **Navigate to the backend directory:**
   ```bash
   cd wejhetna_backend
   ```

3. **Run the check script:**
   ```bash
   python check_business_images_urls.py
   ```

4. **What to look for:**
   - If you see "It's a LIST" → ✅ Data is stored correctly (PostgreSQL array)
   - If you see "It's a STRING" → ❌ Data needs to be fixed (stored as JSON string)

### Option B: Using PostgreSQL directly

1. **Open pgAdmin or psql command line**

2. **Connect to your database:**
   - Database: `wejhetna_db`
   - User: `postgres`
   - Password: `123` (or check your .env file)

3. **Run this SQL query:**
   ```sql
   SELECT 
       id, 
       name, 
       business_images_urls,
       pg_typeof(business_images_urls) as type_name
   FROM places 
   WHERE business_images_urls IS NOT NULL 
   LIMIT 5;
   ```

4. **Check the type_name column:**
   - Should show: `text[]` or `ARRAY` → ✅ Correct (PostgreSQL array)
   - Shows: `text` → ❌ Wrong (stored as string, needs fixing)

---

## Step 2: Check Console Logs

1. **Start your React Native app** (if not already running)

2. **Open the Metro bundler console** (where you run `npm start` or `npx react-native start`)

3. **Navigate to a screen that shows images:**
   - For business owners: Go to "Manage My Business" screen
   - For regular users: Go to Home screen and select a place

4. **Look for these log messages:**
   ```
   === LOADING BUSINESS IMAGES ===
   Raw business_images_urls: ...
   Type: ...
   Parsed businessImages: ...
   ```

5. **What to look for:**
   - `Type: object` and `Parsed businessImages: [...]` with array items → ✅ Correct
   - `Type: string` and warnings about parsing → ❌ Data is stored as string

6. **Check for warning messages like:**
   ```
   business_images_urls is a string but not a valid JSON array
   Failed to parse business_images_urls as JSON
   business_images_urls is not an array or string
   ```

---

## Step 3: Fix Database Records (If Needed)

⚠️ **IMPORTANT: Backup your database before running this script!**

### Option A: Using the Python Script (Recommended)

1. **Make sure you've completed Step 1** and confirmed that data needs fixing

2. **Navigate to the backend directory:**
   ```bash
   cd wejhetna_backend
   ```

3. **Run the fix script:**
   ```bash
   python fix_business_images_urls.py
   ```

4. **Review the output:**
   - The script will show you what will be changed
   - Type `yes` to confirm, or `no` to cancel

5. **Verify the fix:**
   - Run `check_business_images_urls.py` again
   - Check that data is now stored as arrays

### Option B: Using PostgreSQL directly

1. **Connect to your database** (same as Step 1, Option B)

2. **For each place that needs fixing, run:**
   ```sql
   -- Replace X with the place ID
   -- Replace 'url1', 'url2' with actual URLs
   UPDATE places 
   SET business_images_urls = ARRAY['url1', 'url2', 'url3']
   WHERE id = X;
   ```

3. **Example:**
   ```sql
   -- If business_images_urls was stored as: '["http://10.0.2.2:8000/uploads/image1.jpg"]'
   -- Convert it to: ARRAY['http://10.0.2.2:8000/uploads/image1.jpg']
   
   UPDATE places 
   SET business_images_urls = ARRAY['http://10.0.2.2:8000/uploads/image1.jpg']
   WHERE id = 4;
   ```

4. **Verify:**
   ```sql
   SELECT id, name, business_images_urls, pg_typeof(business_images_urls)
   FROM places 
   WHERE id = X;
   ```

---

## Step 4: Test the Fix

1. **Restart your backend server** (if running):
   ```bash
   # Stop the server (Ctrl+C)
   # Start it again
   uvicorn main:app --reload
   ```

2. **Reload your React Native app:**
   - In the app: Pull to refresh or navigate away and back
   - Or: Stop and restart the app

3. **Check the console logs again:**
   - You should no longer see parsing warnings
   - Images should load correctly

4. **Check the backend logs:**
   - You should no longer see requests like `/uploads/h`, `/uploads/t`, etc.
   - You should see requests like `/uploads/image1.jpg`, `/uploads/image2.jpg`, etc.

---

## Troubleshooting

### If the script can't connect to the database:

1. **Check your database credentials:**
   - Open `wejhetna_backend/database.py` or check your `.env` file
   - Verify: username, password, database name, host, port

2. **Make sure PostgreSQL is running:**
   - Check if the PostgreSQL service is running
   - Try connecting with pgAdmin or psql

### If you see "No module named 'models'":

1. **Make sure you're in the correct directory:**
   ```bash
   cd wejhetna_backend
   ```

2. **Check if you need to activate a virtual environment:**
   ```bash
   # Windows
   .venv\Scripts\activate
   
   # Mac/Linux
   source .venv/bin/activate
   ```

### If the fix script doesn't work:

1. **Check the error message** - it will tell you what went wrong

2. **Try fixing one record at a time** using Option B (PostgreSQL directly)

3. **Check if the column type is correct:**
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'places' AND column_name = 'business_images_urls';
   ```
   - Should show: `data_type = ARRAY`

---

## Summary

✅ **Correct storage:** PostgreSQL ARRAY type (`text[]`)
❌ **Incorrect storage:** TEXT type with JSON string

The fix converts JSON strings to proper PostgreSQL arrays, which SQLAlchemy will automatically handle as Python lists.

