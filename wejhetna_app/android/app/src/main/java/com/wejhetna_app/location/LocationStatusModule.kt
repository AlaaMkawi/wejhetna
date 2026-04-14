package com.wejhetna_app.location

import android.content.Context
import android.location.LocationManager
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability

class LocationStatusModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "LocationStatus"

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      val ctx: Context = reactContext.applicationContext
      val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as LocationManager

      val gpsEnabled = try { lm.isProviderEnabled(LocationManager.GPS_PROVIDER) } catch (_: Throwable) { false }
      val networkEnabled = try { lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) } catch (_: Throwable) { false }

      val locationEnabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        lm.isLocationEnabled
      } else {
        try {
          val mode = Settings.Secure.getInt(ctx.contentResolver, Settings.Secure.LOCATION_MODE)
          mode != Settings.Secure.LOCATION_MODE_OFF
        } catch (_: Throwable) {
          gpsEnabled || networkEnabled
        }
      }

      val api = GoogleApiAvailability.getInstance()
      val gmsCode = api.isGooglePlayServicesAvailable(ctx)
      val playServicesAvailable = gmsCode == ConnectionResult.SUCCESS

      val map = Arguments.createMap().apply {
        putBoolean("locationEnabled", locationEnabled)
        putBoolean("gpsEnabled", gpsEnabled)
        putBoolean("networkEnabled", networkEnabled)
        putBoolean("playServicesAvailable", playServicesAvailable)
        putInt("playServicesStatus", gmsCode)
      }

      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject("LOCATION_STATUS_FAILED", e)
    }
  }
}

