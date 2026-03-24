# Step-by-Step Guide: Testing on Physical Phone

This guide will help you test your React Native app on a physical Android or iOS device.

## Prerequisites

- ✅ Node.js installed (v20+)
- ✅ React Native development environment set up
- ✅ Backend server running (`wejhetna_backend`)
- ✅ Physical phone (Android or iOS)

---

## For Android Devices

### Step 1: Enable Developer Options on Your Phone

1. Open **Settings** on your Android phone
2. Go to **About Phone** (or **About Device**)
3. Find **Build Number** (might be under "Software Information")
4. Tap **Build Number** 7 times until you see "You are now a developer!"
5. Go back to Settings → **Developer Options**
6. Enable **USB Debugging**
7. Enable **Install via USB** (if available)

### Step 2: Connect Your Phone to Computer

1. Connect your phone to your computer using a USB cable
2. On your phone, you'll see a popup asking "Allow USB debugging?" → Tap **Allow**
3. Check "Always allow from this computer" if you want
4. Tap **OK**

### Step 3: Verify Device Connection

Open PowerShell or Command Prompt and run:

```bash
adb devices
```

You should see your device listed, for example:
```
List of devices attached
ABC123XYZ    device
```

If you see "unauthorized", check your phone for the USB debugging permission popup.

### Step 4: Find Your Computer's IP Address

**On Windows:**
1. Open PowerShell
2. Run: `ipconfig`
3. Look for **IPv4 Address** under your active network adapter (usually starts with 192.168.x.x or 10.0.x.x)

**Example output:**
```
Wireless LAN adapter Wi-Fi:
   IPv4 Address. . . . . . . . . . . : 192.168.1.100
```

### Step 5: Update API Base URL

Your app needs to connect to your backend server. Since you're using a physical device, you need to use your computer's IP address instead of `10.0.2.2` (which only works for Android emulator).

1. Open `wejhetna_app/config.ts`
2. Update the API_BASE_URL to use your computer's IP:

```typescript
// Replace 192.168.1.100 with YOUR computer's IP address from Step 4
export const API_BASE_URL = "http://192.168.1.100:8000";
```

**Important:** Make sure your phone and computer are on the **same Wi-Fi network**!

### Step 6: Configure Backend to Accept Connections

Your backend needs to accept connections from your local network:

1. Make sure your backend is running on `0.0.0.0` instead of `localhost` or `127.0.0.1`
2. In `wejhetna_backend`, when starting the server, use:

```bash
cd wejhetna_backend
uvicorn main:app --host 0.0.0.0 --port 8000
```

Or if using FastAPI directly:
```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### Step 7: Allow Firewall Access (Windows)

Windows Firewall might block the connection:

1. Open **Windows Defender Firewall**
2. Click **Allow an app or feature through Windows Firewall**
3. Click **Change Settings** → **Allow another app**
4. Browse to your Python executable (or allow Python)
5. Make sure both **Private** and **Public** are checked
6. Click **OK**

Alternatively, when you start the backend, Windows will ask for permission - click **Allow access**.

### Step 8: Build and Run on Your Phone

1. Open PowerShell in the project root
2. Navigate to the app directory:
   ```bash
   cd wejhetna_app
   ```

3. Make sure Metro bundler is running (in a separate terminal):
   ```bash
   npm start
   ```

4. In another terminal, run:
   ```bash
   cd wejhetna_app
   npm run android
   ```

   Or if you want to specify the device:
   ```bash
   npx react-native run-android --deviceId=ABC123XYZ
   ```
   (Replace ABC123XYZ with your device ID from `adb devices`)

### Step 9: Verify Connection

1. The app should install and launch on your phone
2. Check the Metro bundler terminal - you should see the app connecting
3. Try logging in or making an API call
4. Check the backend terminal - you should see incoming requests

---

## For iOS Devices (Mac Only)

### Step 1: Connect Your iPhone

1. Connect your iPhone to your Mac using a USB cable
2. Unlock your iPhone
3. If prompted, tap **Trust This Computer**

### Step 2: Configure Xcode

1. Open Xcode
2. Go to **Xcode** → **Settings** (or **Preferences**)
3. Click **Accounts** tab
4. Sign in with your Apple ID
5. Go to **Signing & Capabilities** in your project settings
6. Select your **Team** (your Apple ID)
7. Xcode will automatically manage signing

### Step 3: Update API Base URL

Same as Android - update `wejhetna_app/config.ts` with your Mac's IP address:

```typescript
export const API_BASE_URL = "http://192.168.1.100:8000";
```

### Step 4: Find Your Mac's IP Address

Open Terminal and run:
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Look for your IP address (usually 192.168.x.x)

### Step 5: Run on iPhone

1. Open Terminal
2. Navigate to the app:
   ```bash
   cd wejhetna_app
   ```

3. Run:
   ```bash
   npm run ios --device="Your iPhone Name"
   ```

   Or open Xcode and select your device from the device dropdown, then click Run.

---

## Troubleshooting

### Device Not Detected (Android)

- Make sure USB debugging is enabled
- Try a different USB cable
- Try a different USB port
- Run `adb kill-server` then `adb start-server`
- Check if device shows in `adb devices`

### Can't Connect to Backend

- **Check IP address:** Make sure you're using the correct IP from `ipconfig`/`ifconfig`
- **Check network:** Phone and computer must be on the same Wi-Fi
- **Check firewall:** Windows/Mac firewall might be blocking port 8000
- **Check backend:** Make sure backend is running with `--host 0.0.0.0`
- **Test connection:** On your phone's browser, try opening `http://YOUR_IP:8000/health`

### App Crashes on Launch

- Check Metro bundler is running
- Check device logs: `adb logcat` (Android) or Xcode console (iOS)
- Try clearing cache: `npm start -- --reset-cache`

### Build Errors

- Clean build: `cd android && ./gradlew clean` (Android)
- Clear Metro cache: `npm start -- --reset-cache`
- Reinstall node_modules: `rm -rf node_modules && npm install`

---

## Quick Reference Commands

```bash
# Check connected devices (Android)
adb devices

# View device logs (Android)
adb logcat

# Restart ADB (Android)
adb kill-server
adb start-server

# Find IP address (Windows)
ipconfig

# Find IP address (Mac/Linux)
ifconfig | grep "inet "

# Start Metro bundler
cd wejhetna_app
npm start

# Run on Android device
npm run android

# Run on iOS device (Mac only)
npm run ios --device="iPhone Name"
```

---

## Important Notes

1. **Same Network Required:** Your phone and computer must be on the same Wi-Fi network for the app to connect to the backend.

2. **IP Address Changes:** If your computer's IP address changes (e.g., after restarting router), you'll need to update `config.ts` again.

3. **Backend Must Be Running:** Make sure your backend server is running before testing the app.

4. **Development vs Production:** This setup is for development. For production, you'll need a proper server with a domain name.

---

## Need Help?

If you encounter issues:
1. Check the Metro bundler terminal for errors
2. Check the backend terminal for API errors
3. Check device logs using `adb logcat` (Android)
4. Make sure all prerequisites are installed correctly

Good luck testing! 🚀

