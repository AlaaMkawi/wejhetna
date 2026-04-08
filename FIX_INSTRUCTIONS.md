# How to Run the Fix Script

## Quick Answer

1. **Run the script:**
   ```bash
   python fix_business_images_urls_column.py
   ```

2. **When prompted, type `yes` (full word, not just "y"):**
   ```
   Do you want to proceed with the fix? (type 'yes' to confirm): yes
   ```

---

## What the Script Will Do

✅ **Fix Place ID 4 (Testcofe):**
- Old: `{http://10.0.2.2:8000/uploads/07429a991c6a427aa215925f540eadb7.png}`
- New: `['http://10.0.2.2:8000/uploads/07429a991c6a427aa215925f540eadb7.png']`
- ✅ This will work perfectly!

⚠️ **Places 5 and 6:**
- These have severely corrupted data (stored character-by-character)
- They will be set to `NULL` (empty)
- This is OK - you can re-upload images for these places later through the app

---

## Step-by-Step

1. **Make sure you're in the backend directory:**
   ```bash
   cd C:\Users\hebam\OneDrive\Desktop\wejhetna\wejhetna_backend
   ```

2. **Run the script:**
   ```bash
   python fix_business_images_urls_column.py
   ```

3. **Review the output** - it will show:
   - What will be changed
   - Which places will be fixed
   - Which places will be set to NULL

4. **Type `yes` (full word) when prompted:**
   ```
   Do you want to proceed with the fix? (type 'yes' to confirm): yes
   ```
   ⚠️ **IMPORTANT:** Type `yes` (not `y`)

5. **Wait for it to complete** - you'll see:
   - ✅ Temporary column created
   - ✅ Data migrated
   - ✅ Old column dropped
   - ✅ Column renamed
   - ✅ Fix complete!

---

## After Running

1. **Restart your backend server** (if running)
2. **Restart your React Native app**
3. **Test the images** - Place ID 4 should now show images correctly
4. **For places 5 and 6**, you can re-upload images through the "Manage My Business" screen

---

## Troubleshooting

### "Cancelled" message
- **Cause:** You typed "y" instead of "yes"
- **Solution:** Type the full word "yes"

### Places 5 and 6 set to NULL
- **This is expected** - the data was too corrupted to fix automatically
- **Solution:** Re-upload images through the app after the fix

### Script fails
- Check the error message
- Make sure PostgreSQL is running
- Make sure you have database permissions

