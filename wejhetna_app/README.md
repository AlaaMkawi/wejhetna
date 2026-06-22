# Wejhetna – Smart Community Platform

Wejhetna is a multilingual mobile application designed to improve access to local businesses, public services, navigation, community announcements, and transportation services.

The application focuses on communities in the Negev and currently includes places and services from Rahat, Laqiya, and Tel Sheva.

Wejhetna supports Arabic, Hebrew, and English.

---

## Table of Contents

* [About the Project](#about-the-project)
* [Main Features](#main-features)
* [User Roles](#user-roles)
* [Technologies](#technologies)
* [System Architecture](#system-architecture)
* [Project Structure](#project-structure)
* [Requirements](#requirements)
* [Downloading the Project](#downloading-the-project)
* [Backend Setup](#backend-setup)
* [Database Setup](#database-setup)
* [Frontend Setup](#frontend-setup)
* [API Configuration](#api-configuration)
* [Running on Android](#running-on-android)
* [Running on a Physical Android Device](#running-on-a-physical-android-device)
* [Running on iOS](#running-on-ios)
* [Running on a Physical iPhone](#running-on-a-physical-iphone)
* [Using Ngrok](#using-ngrok)
* [Building an Android APK](#building-an-android-apk)
* [Common Commands](#common-commands)
* [Troubleshooting](#troubleshooting)
* [Security Notes](#security-notes)
* [Project Team](#project-team)

---

# About the Project

Wejhetna was developed as a final Software Engineering project.

The purpose of the application is to provide one centralized platform for local information and services.

Users can discover nearby places, search for businesses and public services, navigate to destinations, save favorite places, view community announcements, and use community transportation services.

The system also provides dedicated interfaces for business owners, drivers, and administrators.

---

# Main Features

* Multilingual support in Arabic, Hebrew, and English.
* Map of local businesses and public services.
* Search by place name, category, city, or description.
* Place details, contact information, images, and opening hours.
* Navigation to selected destinations.
* Continued use of a previously prepared route when internet connectivity is interrupted.
* Favorite places.
* Community announcements.
* Business registration and management.
* Community transportation between passengers and approved drivers.
* OTP verification before starting a ride.
* Driver ratings.
* Administrative management and approval.

---

# User Roles

## Regular User

A regular user can:

* Browse and search for places.
* View place information.
* Save favorite places.
* Start navigation.
* View community announcements.
* Request transportation.
* Rate drivers.

## Business Owner

A business owner can:

* Register a business.
* Add and edit business information.
* Select the business location.
* Upload business images.
* Add opening hours and contact information.
* Submit community announcements.

## Driver

A driver can:

* Register as a driver.
* Upload the required documents.
* Wait for administrator approval.
* Set availability.
* Receive and manage ride requests.
* Navigate to passengers and destinations.

## Administrator

An administrator can:

* Manage users.
* Approve or reject driver requests.
* Manage business requests.
* Approve or reject community announcements.
* Manage places, cities, and categories.
* View ratings and reports.

---

# Technologies

## Mobile Application

* React Native
* TypeScript
* React
* React Navigation
* MapLibre
* NetInfo
* i18next

## Backend

* Python
* FastAPI
* SQLAlchemy
* PostgreSQL
* Celery
* REST API

## Development Tools

* Android Studio
* Xcode
* Visual Studio Code
* Cursor
* Git
* GitHub
* Postman
* Ngrok
* npm
* Gradle

---

# System Architecture

Wejhetna uses a client-server architecture:

```text
React Native Mobile Application
              |
              | REST API
              |
       FastAPI Backend
              |
              | SQLAlchemy
              |
       PostgreSQL Database
```

The backend handles authentication, application logic, places, posts, transportation requests, ratings, and administrative operations.

Celery may be used for background tasks such as sending emails.

---

# Project Structure

The project contains two main parts:

```text
wejhetna/
│
├── wejhetna_app/             # React Native mobile application
│   ├── android/              # Android native project
│   ├── ios/                  # iOS native project
│   ├── src/                  # Application source code
│   ├── App.tsx
│   ├── package.json
│   └── package-lock.json
│
├── wejhetna_backend/         # FastAPI backend
│   ├── data/                 # CSV and location data
│   ├── models/               # Database models
│   ├── routers/              # API routes
│   ├── schemas/              # Pydantic schemas
│   ├── services/             # Application logic
│   ├── requirements.txt
│   └── main.py
│
└── README.md
```

The exact internal folder names may differ slightly according to the current repository version.

---

# Requirements

Before running the project, install the required development tools.

## General Requirements

* Git
* Node.js
* npm
* Python
* PostgreSQL
* Visual Studio Code or Cursor

## Android Requirements

* Android Studio
* Android SDK
* Android SDK Platform Tools
* Java Development Kit
* Android Emulator or physical Android device

## iOS Requirements

iOS development requires a Mac.

* macOS
* Xcode
* Xcode Command Line Tools
* CocoaPods
* iOS Simulator or physical iPhone
* Apple ID

## Project Versions

The project was developed using versions similar to:

```text
React Native: 0.82.x
React: 19.x
MapLibre React Native: 10.x
FastAPI: 0.121.x
SQLAlchemy: 2.x
```

Use the versions already defined in `package.json`, `package-lock.json`, and `requirements.txt`.

Do not upgrade dependencies unless compatibility has been tested.

---

# Downloading the Project

Clone the project from GitHub:

```bash
git clone https://github.com/AlaaMkawi/wejhetna.git
cd wejhetna
```

The project can also be downloaded from GitHub as a ZIP file, but cloning with Git is recommended.

---

# Backend Setup

Open a terminal inside the backend folder:

```bash
cd wejhetna_backend
```

## Windows

Create a virtual environment:

```powershell
python -m venv .venv
```

Activate it:

```powershell
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks the activation script:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Then activate the environment again:

```powershell
.\.venv\Scripts\Activate.ps1
```

## macOS or Linux

Create a virtual environment:

```bash
python3 -m venv .venv
```

Activate it:

```bash
source .venv/bin/activate
```

## Install Backend Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

## Backend Environment Variables

Create a `.env` file inside `wejhetna_backend`.

Example:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/wejhetna
SECRET_KEY=YOUR_SECRET_KEY
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

EMAIL_HOST=YOUR_EMAIL_HOST
EMAIL_PORT=YOUR_EMAIL_PORT
EMAIL_USERNAME=YOUR_EMAIL_ADDRESS
EMAIL_PASSWORD=YOUR_EMAIL_PASSWORD
EMAIL_FROM=YOUR_EMAIL_ADDRESS
```

The exact variable names must match the backend source code.

Do not upload the real `.env` file to GitHub.

## Run the Backend

From the backend folder, run:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

If the FastAPI application is located inside an `app` folder, use:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

After the backend starts, open:

```text
http://127.0.0.1:8000/docs
```

This page displays the FastAPI Swagger documentation.

---

# Database Setup

Install and start PostgreSQL.

Create a new database:

```sql
CREATE DATABASE wejhetna;
```

Update the database connection in the backend `.env` file:

```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/wejhetna
```

## Database Tables

If the project uses Alembic migrations, run:

```bash
alembic upgrade head
```

If the project creates the tables automatically, starting the backend may create them.

Use the database initialization method already implemented in the project.

## Seed Data

The project includes scripts for adding cities, categories, and places.

Examples may include:

```bash
python seed_cities.py
python seed_categories.py
python seed_osm_places.py
python seed_laqiya_places.py
```

Only run files that exist in the backend folder.

Avoid running the same seed script more than once unless the script prevents duplicate records.

---

# Frontend Setup

Open a new terminal and enter the mobile application folder:

```bash
cd wejhetna_app
```

Install the dependencies:

```bash
npm install
```

For an installation based exactly on `package-lock.json`, use:

```bash
npm ci
```

Do not delete `package-lock.json` unless dependency changes are intentional.

---

# API Configuration

The mobile application must contain the correct backend address.

The API address may be stored in a file such as:

```text
src/services/api.ts
src/config/api.ts
src/constants/api.ts
.env
```

Use the location that exists in the project.

## Android Emulator

Use:

```text
http://10.0.2.2:8000
```

Example:

```typescript
export const API_BASE_URL = 'http://10.0.2.2:8000';
```

Do not use `localhost` from the Android Emulator.

## iOS Simulator

Use:

```text
http://localhost:8000
```

or:

```text
http://127.0.0.1:8000
```

## Physical Device on the Same Network

Use the local IP address of the computer:

```text
http://192.168.X.X:8000
```

Example:

```typescript
export const API_BASE_URL = 'http://192.168.1.15:8000';
```

The phone and computer must be connected to the same network.

The backend must run using:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Remote Device or APK

Use an Ngrok HTTPS address:

```text
https://example-name.ngrok-free.app
```

Do not add `/docs` to the API base address.

---

# Running on Android

## Using React Native CLI

Start Metro from the `wejhetna_app` folder:

```bash
npm start
```

Keep this terminal open.

Open another terminal in the same folder:

```bash
npm run android
```

or:

```bash
npx react-native run-android
```

## Using Android Studio

1. Open Android Studio.
2. Select `Open`.
3. Open:

```text
wejhetna_app/android
```

4. Wait for Gradle synchronization.
5. Open Device Manager.
6. Start an Android Emulator.
7. Select the emulator.
8. Press the green Run button.

Metro must also be running:

```bash
npm start
```

---

# Running on a Physical Android Device

## Enable Developer Options

On the Android phone:

1. Open Settings.
2. Open About Phone.
3. Press Build Number several times.
4. Open Developer Options.
5. Enable USB Debugging.

Connect the device to the computer with a USB cable.

Check the connection:

```bash
adb devices
```

The device should appear as:

```text
device
```

If it appears as `unauthorized`, approve USB debugging on the phone.

## Run the Application

Start Metro:

```bash
npm start
```

In another terminal:

```bash
npm run android
```

If Metro cannot connect to the phone:

```bash
adb reverse tcp:8081 tcp:8081
```

To forward the backend port through USB:

```bash
adb reverse tcp:8000 tcp:8000
```

After forwarding port `8000`, the Android device may use:

```text
http://127.0.0.1:8000
```

---

# Running on iOS

iOS development requires a Mac.

Enter the application folder:

```bash
cd wejhetna_app
```

Install JavaScript dependencies:

```bash
npm install
```

Install CocoaPods dependencies:

```bash
cd ios
pod install
cd ..
```

If the project uses Bundler:

```bash
bundle install
cd ios
bundle exec pod install
cd ..
```

Start Metro:

```bash
npm start
```

Open another terminal:

```bash
npm run ios
```

or:

```bash
npx react-native run-ios
```

## Using Xcode

Open the workspace file:

```text
wejhetna_app/ios/wejhetna_app.xcworkspace
```

When CocoaPods is used, open `.xcworkspace`, not only `.xcodeproj`.

Then:

1. Select an iOS Simulator.
2. Select the application target.
3. Press Run.

---

# Running on a Physical iPhone

A physical iPhone must be connected to a Mac.

1. Connect the iPhone to the Mac.
2. Open the `.xcworkspace` file in Xcode.
3. Select the project target.
4. Open `Signing & Capabilities`.
5. Select the development team.
6. Change the Bundle Identifier if required.
7. Select the connected iPhone.
8. Press Run.
9. Enable Developer Mode on the iPhone when requested.

For backend access, use:

* The computer’s local network IP address.
* An active Ngrok address.
* A deployed backend server.

An iOS project cannot be built directly from Windows.

---

# Using Ngrok

Ngrok creates a public HTTPS address for the local backend.

This is useful when:

* Testing an APK on another phone.
* Testing from an iPhone.
* The phone and computer are on different networks.
* A temporary public backend address is required.

First, start the backend:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Open another terminal:

```bash
ngrok http 8000
```

Ngrok displays an address similar to:

```text
https://example-name.ngrok-free.app
```

Use this address as the mobile application API base URL:

```typescript
export const API_BASE_URL =
  'https://example-name.ngrok-free.app';
```

After changing the API URL, restart Metro:

```bash
npm start -- --reset-cache
```

Then reload or rebuild the application.

Important:

* A free Ngrok URL may change after restarting Ngrok.
* The backend and Ngrok terminals must remain open.
* An APK stores the API URL that existed when it was built.
* If the Ngrok URL changes, the APK may need to be rebuilt.

---

# Building an Android APK

Enter the Android folder:

```powershell
cd wejhetna_app\android
```

## Clean the Project

Windows:

```powershell
.\gradlew.bat clean
```

macOS or Linux:

```bash
./gradlew clean
```

## Build a Release APK

Windows:

```powershell
.\gradlew.bat assembleRelease
```

macOS or Linux:

```bash
./gradlew assembleRelease
```

The release APK is usually created at:

```text
wejhetna_app/android/app/build/outputs/apk/release/app-release.apk
```

## Build a Debug APK

Windows:

```powershell
.\gradlew.bat assembleDebug
```

macOS or Linux:

```bash
./gradlew assembleDebug
```

The debug APK is usually created at:

```text
wejhetna_app/android/app/build/outputs/apk/debug/app-debug.apk
```

## Install the APK with ADB

```bash
adb install app-release.apk
```

To replace an existing installation:

```bash
adb install -r app-release.apk
```

Before sharing an APK, verify that:

* The API URL is correct.
* The backend is running.
* Ngrok is active if it is being used.
* PostgreSQL is running.
* The application was tested on a physical device.

---

# Common Commands

## Frontend

Install dependencies:

```bash
npm install
```

Start Metro:

```bash
npm start
```

Start Metro with a clean cache:

```bash
npm start -- --reset-cache
```

Run Android:

```bash
npm run android
```

Run iOS:

```bash
npm run ios
```

Run linting:

```bash
npm run lint
```

## Backend

Activate the environment on Windows:

```powershell
.\.venv\Scripts\Activate.ps1
```

Activate the environment on macOS or Linux:

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run the backend:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Android

Check connected devices:

```bash
adb devices
```

Forward Metro:

```bash
adb reverse tcp:8081 tcp:8081
```

Forward the backend:

```bash
adb reverse tcp:8000 tcp:8000
```

Stop Gradle:

```powershell
.\gradlew.bat --stop
```

Clean the Android project:

```powershell
.\gradlew.bat clean
```

Build a release APK:

```powershell
.\gradlew.bat assembleRelease
```

---

# Troubleshooting

## Network Error

Check that:

* The backend is running.
* PostgreSQL is running.
* The API address is correct.
* Ngrok is active when used.
* The Ngrok address has not changed.
* The computer firewall is not blocking the backend.
* The backend runs with `--host 0.0.0.0`.

Test the backend using:

```text
http://127.0.0.1:8000/docs
```

Or with Ngrok:

```text
https://YOUR-NGROK-ADDRESS/docs
```

## Android Emulator Cannot Connect to the Backend

Do not use:

```text
http://localhost:8000
```

Use:

```text
http://10.0.2.2:8000
```

## Physical Android Device Cannot Connect

Try:

```bash
adb reverse tcp:8000 tcp:8000
```

Or use the computer’s local IP address or Ngrok.

## Metro Connection Problem

Run:

```bash
npm start -- --reset-cache
```

For Android USB connections:

```bash
adb reverse tcp:8081 tcp:8081
```

## `gradlew` Is Not Recognized

Run Gradle commands from the Android folder:

```powershell
cd wejhetna_app\android
.\gradlew.bat clean
```

Do not run `gradlew` from the backend folder.

## Android Build Failure

Run:

```powershell
cd wejhetna_app\android
.\gradlew.bat --stop
.\gradlew.bat clean
```

Return to the frontend folder:

```powershell
cd ..
npm start -- --reset-cache
```

Open another terminal:

```powershell
npm run android
```

Also check:

* Java version.
* Android SDK.
* NDK version.
* CMake version.
* `local.properties`.
* Installed Android SDK platforms.

## CocoaPods Problem

Run:

```bash
cd wejhetna_app/ios
pod deintegrate
pod install --repo-update
```

If the project uses Bundler:

```bash
bundle install
cd ios
bundle exec pod install
```

## Places Are Not Displayed

Check that:

* The database contains places.
* Latitude and longitude values are valid.
* The city and category IDs are correct.
* The backend endpoint returns the places.
* The frontend is not filtering them incorrectly.
* The opening-hours format matches the frontend format.

## APK Opens but Login Does Not Work

Check:

* The API URL stored inside the APK.
* Whether the backend is running.
* Whether PostgreSQL is running.
* Whether the Ngrok URL is still active.
* Whether the phone has internet access.

---

# Security Notes

Do not upload sensitive files or information to GitHub.

Do not commit:

* `.env` files.
* Database passwords.
* JWT secret keys.
* Email passwords.
* API keys.
* Android signing keys.
* iOS certificates.
* Driver documents.
* Personal user information.
* Production database backups.

Recommended `.gitignore` entries:

```gitignore
.env
.env.*
!.env.example

node_modules/
.venv/
venv/
__pycache__/

android/.gradle/
android/app/build/
ios/Pods/
ios/build/

*.jks
*.keystore
*.p12
*.mobileprovision
```

Before publishing the repository, verify that no secret key or password exists in the Git history.

---

# Important Notes

To run the complete project, the following components must be active:

```text
1. PostgreSQL database
2. FastAPI backend
3. Correct backend environment variables
4. Required database data
5. Correct mobile API address
6. Metro server
7. Android or iOS environment
8. Ngrok or a deployed server when remote access is required
```

The mobile application alone is not enough. The backend and database must also be available.

---

# Project Team

Developed by:

* **Alaa Mkawi   **
* **Lena Abu Abid**
* **Hiba Nsasra**

Project advisor:

* **Ms.Alona Kutsyy**

---

# Academic Information

Wejhetna was developed as a final project in the Software Engineering program at Sami Shamoon College of Engineering.

The project demonstrates knowledge in:

* Mobile application development.
* Backend development.
* Database design.
* REST API development.
* Authentication and authorization.
* Role-based access.
* Map and navigation integration.
* Multilingual interfaces.
* Software testing.
* Git and team collaboration.

---

# Repository

```text
https://github.com/AlaaMkawi/wejhetna.git
```

---

# License

This project was developed for academic purposes.

Unless a separate license is provided, using, copying, or distributing the project outside its academic purpose requires permission from the project authors.
