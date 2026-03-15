#!/usr/bin/env python3
"""
Simple script to check if OPENAI_API_KEY is configured correctly.
Run this from the wejhetna_backend directory.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)
load_dotenv()  # Also try loading from current directory

print("=" * 60)
print("Checking OpenAI API Key Configuration")
print("=" * 60)

# Check if .env file exists
if env_path.exists():
    print(f"[OK] .env file found at: {env_path}")
else:
    print(f"[ERROR] .env file NOT found at: {env_path}")
    print(f"\nPlease create a .env file in the wejhetna_backend directory with:")
    print("OPENAI_API_KEY=sk-proj-...")
    exit(1)

# Check if API key is set
api_key = os.getenv("OPENAI_API_KEY")
if api_key:
    # Show first 10 and last 4 characters for verification
    masked_key = f"{api_key[:10]}...{api_key[-4:]}" if len(api_key) > 14 else "***"
    print(f"[OK] OPENAI_API_KEY found: {masked_key}")
    
    # Check format
    if api_key.startswith("sk-"):
        print("[OK] API key format looks correct (starts with 'sk-')")
    else:
        print("[WARNING] API key should start with 'sk-'")
    
    if len(api_key) > 20:
        print("[OK] API key length looks reasonable")
    else:
        print("[WARNING] API key seems too short")
else:
    print("[ERROR] OPENAI_API_KEY not found in environment variables")
    print("\nPlease add the following line to your .env file:")
    print("OPENAI_API_KEY=sk-proj-...")
    exit(1)

print("\n" + "=" * 60)
print("Configuration looks good!")
print("=" * 60)
print("\nNote: If you just created/updated the .env file, make sure to:")
print("1. Restart your backend server")
print("2. The .env file should be in: wejhetna_backend/.env")

