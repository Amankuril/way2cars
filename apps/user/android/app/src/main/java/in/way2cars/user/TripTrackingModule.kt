package `in`.way2cars.user

import android.content.Context
import android.content.Intent
import android.location.LocationManager
import android.os.Build
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ViewManager

/** JS control of [TripTrackingService]. Must be started while the app is on screen (an Android rule). */
class TripTrackingModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "TripTracking"

  @ReactMethod
  fun start(config: ReadableMap, promise: Promise) {
    try {
      val intent = Intent(context, TripTrackingService::class.java)
        .putExtra(TripTrackingService.EXTRA_URL, config.getString("url"))
        .putExtra(TripTrackingService.EXTRA_TOKEN, config.getString("token"))
        .putExtra(TripTrackingService.EXTRA_BOOKING_ID, config.getString("bookingId"))
        .putExtra(TripTrackingService.EXTRA_INTERVAL, config.getInt("intervalSeconds"))
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
      promise.resolve(true)
    } catch (e: RuntimeException) {
      promise.reject("TRIP_TRACKING_START", e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    context.stopService(Intent(context, TripTrackingService::class.java))
    TripTrackingService.clearSaved(context)
    promise.resolve(true)
  }

  /** Whether the phone's location switch is on. */
  @ReactMethod
  fun isLocationEnabled(promise: Promise) {
    val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    promise.resolve(
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) manager.isLocationEnabled
      else manager.isProviderEnabled(LocationManager.GPS_PROVIDER) || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER),
    )
  }
}

class TripTrackingPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(TripTrackingModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
