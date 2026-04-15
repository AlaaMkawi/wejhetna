package com.wejhetna_app.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.location.*
import com.google.android.gms.tasks.CancellationTokenSource
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

class FusedLocationModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val client: FusedLocationProviderClient =
    LocationServices.getFusedLocationProviderClient(reactContext)

  private val nextWatchId = AtomicInteger(1)
  private val callbacks = ConcurrentHashMap<Int, LocationCallback>()

  override fun getName(): String = "FusedLocation"

  // React Native's NativeEventEmitter expects these methods to exist on the native module.
  // They are used for bookkeeping (especially in the New Architecture).
  private var listenerCount: Int = 0

  @ReactMethod
  fun addListener(eventName: String) {
    listenerCount += 1
    // No-op: we emit events via RCTDeviceEventEmitter when location updates arrive.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    listenerCount -= count
    if (listenerCount < 0) listenerCount = 0
    // No-op. We keep per-watch callbacks and stop them on clearWatch.
  }

  private fun hasLocationPermission(ctx: Context): Boolean {
    val fine = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
    val coarse = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION)
    return fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED
  }

  private fun sendEvent(name: String, params: WritableMap) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, params)
  }

  @ReactMethod
  fun getCurrentPosition(options: ReadableMap, promise: Promise) {
    val ctx = reactContext.applicationContext
    if (!hasLocationPermission(ctx)) {
      val err = Arguments.createMap().apply {
        putInt("code", 1)
        putString("message", "PERMISSION_DENIED")
      }
      promise.reject("PERMISSION_DENIED", err.toString())
      return
    }

    val enableHighAccuracy = options.getBoolean("enableHighAccuracy")
    val timeoutMs = if (options.hasKey("timeout")) options.getInt("timeout") else 15000

    val priority =
      if (enableHighAccuracy) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY

    val cts = CancellationTokenSource()
    // Best-effort timeout
    reactContext
      .runOnUiQueueThread {
        android.os.Handler(Looper.getMainLooper()).postDelayed({ cts.cancel() }, timeoutMs.toLong())
      }

    client
      .getCurrentLocation(priority, cts.token)
      .addOnSuccessListener { loc ->
        if (loc == null) {
          val err = Arguments.createMap().apply {
            putInt("code", 2)
            putString("message", "No location available (null fix).")
          }
          promise.reject("POSITION_UNAVAILABLE", err.toString())
          return@addOnSuccessListener
        }

        val coords = Arguments.createMap().apply {
          putDouble("latitude", loc.latitude)
          putDouble("longitude", loc.longitude)
          if (loc.hasAccuracy()) putDouble("accuracy", loc.accuracy.toDouble())
          if (loc.hasSpeed()) putDouble("speed", loc.speed.toDouble())
          if (loc.hasBearing()) putDouble("heading", loc.bearing.toDouble())
        }

        val result = Arguments.createMap().apply {
          putMap("coords", coords)
          putDouble("timestamp", loc.time.toDouble())
        }
        promise.resolve(result)
      }
      .addOnFailureListener { e ->
        promise.reject("POSITION_UNAVAILABLE", e)
      }
  }

  @ReactMethod
  fun watchPosition(options: ReadableMap, promise: Promise) {
    val ctx = reactContext.applicationContext
    if (!hasLocationPermission(ctx)) {
      promise.reject("PERMISSION_DENIED", "PERMISSION_DENIED")
      return
    }

    val watchId = nextWatchId.getAndIncrement()
    val enableHighAccuracy = options.getBoolean("enableHighAccuracy")
    val intervalMs = if (options.hasKey("interval")) options.getInt("interval") else 1000
    val distanceM = if (options.hasKey("distanceFilter")) options.getInt("distanceFilter") else 0

    val priority =
      if (enableHighAccuracy) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY

    val req =
      LocationRequest.Builder(priority, intervalMs.toLong())
        .setMinUpdateIntervalMillis((intervalMs / 2).toLong())
        .setMinUpdateDistanceMeters(distanceM.toFloat())
        .build()

    val cb =
      object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
          val loc = result.lastLocation ?: return
          val coords = Arguments.createMap().apply {
            putDouble("latitude", loc.latitude)
            putDouble("longitude", loc.longitude)
            if (loc.hasAccuracy()) putDouble("accuracy", loc.accuracy.toDouble())
            if (loc.hasSpeed()) putDouble("speed", loc.speed.toDouble())
            if (loc.hasBearing()) putDouble("heading", loc.bearing.toDouble())
          }
          val payload = Arguments.createMap().apply {
            putInt("watchId", watchId)
            putMap("coords", coords)
            putDouble("timestamp", loc.time.toDouble())
          }
          sendEvent("FusedLocationUpdate", payload)
        }

        override fun onLocationAvailability(availability: LocationAvailability) {
          val payload = Arguments.createMap().apply {
            putInt("watchId", watchId)
            putBoolean("isLocationAvailable", availability.isLocationAvailable)
          }
          sendEvent("FusedLocationAvailability", payload)
        }
      }

    callbacks[watchId] = cb
    client
      .requestLocationUpdates(req, cb, Looper.getMainLooper())
      .addOnSuccessListener {
        promise.resolve(watchId)
      }
      .addOnFailureListener { e ->
        callbacks.remove(watchId)
        promise.reject("WATCH_FAILED", e)
      }
  }

  @ReactMethod
  fun clearWatch(watchId: Int) {
    val cb = callbacks.remove(watchId) ?: return
    client.removeLocationUpdates(cb)
  }
}

