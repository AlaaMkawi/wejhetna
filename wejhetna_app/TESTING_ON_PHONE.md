# Testing on Physical Device - Quick Guide

## ✅ Setup Complete!
Your app is now configured to use IP: **172.19.36.174:8000**

## 📋 Steps to Test on Your Phone:

### 1. **Start the Backend Server**
```bash
cd wejhetna_backend
# Activate your virtual environment if you have one
python main.py
# OR if using uvicorn directly:
uvicorn main:app --host 0.0.0.0 --port 8000
```
**Important:** Use `--host 0.0.0.0` so it accepts connections from your network!

### 2. **Make Sure Phone and PC are on Same WiFi**
- Your phone and computer must be on the **same WiFi network**
- Check your phone's WiFi settings

### 3. **Start Metro Bundler (React Native)**
Open a **new terminal** and run:
```bash
cd wejhetna_app
npm start
```
This starts the Metro bundler. Keep this terminal open!

### 4. **Run App on Your Phone**

#### For Android:
```bash
# Make sure your phone is connected via USB and USB debugging is enabled
# Then run:
cd wejhetna_app
npm run android
```

#### For iOS (Mac only):
```bash
cd wejhetna_app
npm run ios
```

### 5. **Alternative: Use Expo Go (if available)**
If you have Expo Go installed, you can scan the QR code from Metro bundler.

## 🔧 Troubleshooting:

### If API calls fail:
1. **Check Windows Firewall**: Make sure port 8000 is allowed
2. **Verify IP**: Run `ipconfig` and make sure 172.19.36.174 is your WiFi IP
3. **Test Backend**: Open `http://172.19.36.174:8000/docs` in your phone's browser
4. **Check WiFi**: Make sure phone and PC are on the same network

### To switch back to Emulator:
Edit `wejhetna_app/config.ts` and change:
```typescript
export const API_BASE_URL = "http://10.0.2.2:8000";
```

## 📱 Quick Test:
1. Start backend: `cd wejhetna_backend && python main.py`
2. Start Metro: `cd wejhetna_app && npm start`
3. Run app: `cd wejhetna_app && npm run android` (or `npm run ios`)

Good luck! 🚀




