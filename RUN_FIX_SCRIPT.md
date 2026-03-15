# Where to Run the Fix Script

## Quick Answer

Run the fix script from the **`wejhetna_backend`** directory using:

```bash
python fix_business_images_urls_column.py
```

---

## Detailed Instructions

### Step 1: Open a Terminal/Command Prompt

**Windows:**
- Press `Win + R`
- Type `cmd` and press Enter
- OR right-click Start Menu → "Command Prompt" or "Windows Terminal"
- OR open PowerShell

**Mac/Linux:**
- Press `Cmd + Space` (Mac) or `Ctrl + Alt + T` (Linux)
- Type "Terminal" and press Enter

---

### Step 2: Navigate to the Backend Directory

**Current working directory:** `c:\Users\hebam\OneDrive\Desktop\wejhetna`

**Navigate to backend:**
```bash
cd wejhetna_backend
```

**Full path on Windows:**
```bash
cd C:\Users\hebam\OneDrive\Desktop\wejhetna\wejhetna_backend
```

**Verify you're in the right place:**
```bash
# Windows
dir fix_business_images_urls_column.py

# Mac/Linux
ls fix_business_images_urls_column.py
```

You should see the file listed. If you get "file not found", you're in the wrong directory.

---

### Step 3: Activate Virtual Environment (If You Have One)

**Check if you have a virtual environment:**
```bash
# Windows
dir .venv

# Mac/Linux
ls .venv
```

**If .venv exists, activate it:**

**Windows:**
```bash
.venv\Scripts\activate
```

**Mac/Linux:**
```bash
source .venv/bin/activate
```

You should see `(.venv)` or similar in your prompt after activation.

**If you don't have a virtual environment, skip this step.**

---

### Step 4: Run the Fix Script

**Run the script:**
```bash
python fix_business_images_urls_column.py
```

**Alternative (if `python` doesn't work):**
```bash
python3 fix_business_images_urls_column.py
```

**On Windows, you might also try:**
```bash
py fix_business_images_urls_column.py
```

---

### Step 5: Follow the Prompts

The script will:
1. Show you what will be changed
2. Ask for confirmation: `Do you want to proceed with the fix? (yes/no):`
3. Type `yes` and press Enter to proceed
4. Show progress as it fixes the database

---

## Complete Example Session

Here's what a complete session looks like:

```bash
# 1. Navigate to backend directory
cd C:\Users\hebam\OneDrive\Desktop\wejhetna\wejhetna_backend

# 2. Activate virtual environment (if you have one)
.venv\Scripts\activate

# 3. Run the fix script
python fix_business_images_urls_column.py

# 4. Output will show:
# ============================================================
# Fixing business_images_urls column type and data...
# ============================================================
# ⚠️  This script will MODIFY your database!
# ============================================================
# 
# 1. Checking current column type...
#    Current type: text
#    ❌ Column type is text, needs to be ARRAY
# 
# 2. Getting all places with business_images_urls...
#    Found 3 place(s)
# 
# 3. Analyzing data...
# 
# 4. Preview of changes:
#    Place ID 4 (Testcofe):
#    Old: {http://10.0.2.2:8000/uploads/07429a991c6a427aa215925f540eadb7.png}
#    New: ['http://10.0.2.2:8000/uploads/07429a991c6a427aa215925f540eadb7.png']
# 
# ============================================================
# Do you want to proceed with the fix? (yes/no): yes
# 
# 5. Creating temporary column...
#    ✅ Temporary column created
# 
# 6. Migrating data...
#    ✅ Migrated 3 place(s)
# 
# 7. Dropping old column...
#    ✅ Old column dropped
# 
# 8. Renaming temporary column...
#    ✅ Column renamed
# 
# 9. Verifying fix...
#    New type: ARRAY
#    ✅ Column type is now correct!
# 
#    Sample data:
#    Place ID 4 (Testcofe): ['http://10.0.2.2:8000/uploads/07429a991c6a427aa215925f540eadb7.png']
# 
# ============================================================
# ✅ Fix complete!
# ============================================================
```

---

## Troubleshooting

### "python: command not found" or "python: can't open file"

**Solution:** Make sure you're in the correct directory:
```bash
# Check current directory
cd

# Should show: C:\Users\hebam\OneDrive\Desktop\wejhetna\wejhetna_backend

# If not, navigate there:
cd C:\Users\hebam\OneDrive\Desktop\wejhetna\wejhetna_backend
```

### "ModuleNotFoundError: No module named 'models'"

**Solution:** Make sure you're in the `wejhetna_backend` directory:
```bash
cd wejhetna_backend
python fix_business_images_urls_column.py
```

### "Could not connect to database"

**Solution:** 
1. Make sure PostgreSQL is running
2. Check your database credentials in `database.py` or `.env` file
3. Verify you can connect to the database manually

### "Permission denied" or "Access denied"

**Solution:** 
1. Run Command Prompt as Administrator (Windows: right-click → "Run as administrator")
2. Make sure your PostgreSQL user has ALTER TABLE permissions
3. Check that the database user has the correct privileges

---

## Summary

**Location:** `wejhetna_backend` directory

**Command:**
```bash
cd wejhetna_backend
python fix_business_images_urls_column.py
```

**Full path on your system:**
```
C:\Users\hebam\OneDrive\Desktop\wejhetna\wejhetna_backend\fix_business_images_urls_column.py
```

