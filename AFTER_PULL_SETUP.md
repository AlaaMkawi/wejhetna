# After Pull — Developer Setup

Quick steps after `git pull` when dependencies or the database schema may have changed.

**Repo layout:** `wejhetna_backend/` (FastAPI), `wejhetna_app/` (React Native CLI).

---

## 1. Backend

From the repo root:

```bash
cd wejhetna_backend
```

### 1.1 Virtual environment (create once, then reuse)

**Windows (PowerShell)**

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**macOS / Linux**

```bash
python3 -m venv venv
source venv/bin/activate
```

### 1.2 Dependencies

Run when `requirements.txt` changed or after a fresh clone:

```bash
pip install -r requirements.txt
```

### 1.3 Environment

Ensure `.env` exists in `wejhetna_backend/` with a valid `DATABASE_URL` (PostgreSQL + PostGIS).

### 1.4 Database migration (run after pulls that touch DB / rides)

```bash
python add_ride_request_tables.py
```

This creates/updates `driver_availability`, `ride_requests`, extra columns, and migrates `ride_requests.status` when needed.

### 1.5 Start the API

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API: `http://localhost:8000` · Docs: `http://localhost:8000/docs`

---

## 2. Frontend (Metro)

```bash
cd wejhetna_app
```

### 2.1 Dependencies

Run when `package.json` / lockfile changed:

```bash
npm install
```

### 2.2 Start Metro

```bash
npm start
```

Leave this terminal open.

### 2.3 Android — port reverse (physical device only)

With the phone connected over USB and USB debugging enabled:

```bash
adb reverse tcp:8081 tcp:8081
```

So the device can load the JS bundle from your PC’s Metro (`localhost:8081`).

---

## 3. Mobile testing (ngrok + real device)

### 3.1 Expose the backend

With FastAPI running on port `8000`:

```bash
ngrok http 8000
```

Copy the **HTTPS** URL ngrok prints (e.g. `https://xxxx.ngrok-free.dev`).

### 3.2 Point the app at the API

In `wejhetna_app/config.ts`, set:

```ts
export const API_BASE_URL = "https://YOUR-NGROK-HOST.ngrok-free.dev";
```

Commit this **only** if the team shares a stable tunnel; otherwise each developer sets their own URL locally.

### 3.3 Install / open the app on Android

**First install or after native changes** (see section 4):

```bash
cd wejhetna_app
npx react-native run-android
```

**JS-only changes:** app already installed → shake device → **Reload**, or use Metro’s reload.

---

## 4. When do I need to rebuild?

| Situation | Need `npx react-native run-android`? |
|-----------|----------------------------------------|
| Pulled **JS/TS only** changes | **No** — reload Metro (or let Fast Refresh run). |
| Pulled **new npm package** with native code, **Podfile/Gradle**, or **Android/iOS project** edits | **Yes** |
| Unsure | Run **`npm install`**, then rebuild once. |

**You do not** need a full rebuild for:

- Changes under `src/`, `config.ts`, images, JSON locales  
- Most `git pull` updates that only touch JS and don’t add native dependencies  

**You do** need a rebuild for:

- New native modules, React Native upgrade, Android manifest / Gradle changes  
- First install on a new emulator/device  

---

## 5. Minimal checklist after pull

1. `git pull`
2. **Backend:** `activate venv` → `pip install -r requirements.txt` (if needed) → `python add_ride_request_tables.py` → `uvicorn main:app --reload --host 0.0.0.0 --port 8000`
3. **App:** `cd wejhetna_app` → `npm install` (if needed) → `npm start`
4. **Device:** `adb reverse tcp:8081 tcp:8081` → update `API_BASE_URL` if ngrok URL changed → reload app or rebuild per section 4
