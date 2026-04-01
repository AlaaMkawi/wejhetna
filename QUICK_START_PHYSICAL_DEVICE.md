# Quick Start: Test on Physical Phone

## 🚀 Fast Setup (5 minutes)

### Step 1: Enable USB Debugging (Android Only)

1. Settings → About Phone → Tap "Build Number" 7 times
2. Settings → Developer Options → Enable "USB Debugging"
3. Connect phone to computer via USB
4. Allow USB debugging when prompted

### Step 2: Find Your IP Address

**Option A: Use the helper script**
```powershell
.\find-my-ip.ps1
```

**Option B: Manual method**
```powershell
ipconfig | findstr /i "IPv4"
```
Look for an IP like `192.168.x.x` or `10.x.x.x` (NOT a loopback address or `169.254.x.x`)

### Step 3: Update Config File

Open `wejhetna_app/config.ts` and replace the IP:

```typescript
// Replace YOUR_IP with the IP from Step 2
export const API_BASE_URL = "http://YOUR_IP:8000";
```

**Example:**
```typescript
export const API_BASE_URL = "http://10.0.0.6:8000";
```

### Step 4: Start Backend Server

Open a terminal and run:
```bash
cd wejhetna_backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Important:** Use `--host 0.0.0.0` (not loopback-only) so your phone can connect!

### Step 5: Verify Device Connection

```bash
adb devices
```

You should see your device listed. If not, check USB debugging is enabled.

### Step 6: Run the App

**Terminal 1 - Start Metro:**
```bash
cd wejhetna_app
npm start
```

**Terminal 2 - Run on device:**
```bash
cd wejhetna_app
npm run android
```

The app will install and launch on your phone! 📱

---

## ⚠️ Common Issues

### "Can't connect to backend"
- ✅ Phone and computer on same Wi-Fi?
- ✅ IP address correct in `config.ts`?
- ✅ Backend running with `--host 0.0.0.0`?
- ✅ Windows Firewall allowing Python/port 8000?

### "Device not found"
- ✅ USB debugging enabled?
- ✅ USB cable connected?
- ✅ Try `adb kill-server` then `adb start-server`

### "App crashes"
- ✅ Metro bundler running?
- ✅ Backend server running?
- ✅ Check logs: `adb logcat` (Android)

---

## 📱 For iOS (Mac Only)

1. Connect iPhone via USB
2. Trust computer when prompted
3. Open Xcode → Select your device
4. Run: `npm run ios --device="Your iPhone Name"`

---

## 🔍 Test Connection

On your phone's browser, try:
```
http://YOUR_IP:8000/health
```

If you see `{"status":"ok"}`, the connection works! ✅

---

**Need more details?** See `PHYSICAL_DEVICE_TESTING_GUIDE.md` for complete instructions.

