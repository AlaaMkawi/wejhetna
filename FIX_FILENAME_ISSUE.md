# Fix for "can't open file" Error

## The Problem

The filename is being truncated: `fix_business_images_urls_c` instead of `fix_business_images_urls_column.py`

## Solutions

### Solution 1: Use Quotes (Recommended)

```bash
python "fix_business_images_urls_column.py"
```

### Solution 2: Use Tab Completion

Type the first few letters and press Tab:
```bash
python fix<PRESS TAB>
```

This will auto-complete the filename.

### Solution 3: Use the Batch File

I've created a batch file for you. Just run:
```bash
RUN_ME.bat
```

### Solution 4: Check if File Exists

First, verify the file exists:
```bash
dir fix_business_images_urls_column.py
```

You should see the file listed.

### Solution 5: Copy-Paste Full Path

```bash
python C:\Users\hebam\OneDrive\Desktop\wejhetna\wejhetna_backend\fix_business_images_urls_column.py
```

---

## Quick Fix: Just Use Quotes

**Copy and paste this:**
```bash
python "fix_business_images_urls_column.py"
```

The quotes will prevent PowerShell from truncating the filename.

