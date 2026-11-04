package `in`.way2cars.user

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Reports the phone's location during a trip, with the screen off and the app in the background, and shows
 * a permanent notification while it does. Runs natively because JS is paused in the background. Positions wait
 * in a file while offline. Stops itself when the server answers that the trip is over. Everything runs on one
 * background thread.
 */
class TripTrackingService : Service(), LocationListener {
  private lateinit var thread: HandlerThread
  private lateinit var handler: Handler
  private var url = ""
  private var token = ""
  private var intervalMs = 30_000L
  private var queue = JSONArray()
  private var lastGpsFixAt = 0L
  private var listening = false

  private val queueFile get() = File(filesDir, QUEUE_FILE)
  private val uploadTick = object : Runnable {
    override fun run() {
      upload()
      if (url.isNotEmpty()) handler.postDelayed(this, UPLOAD_EVERY_MS)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    thread = HandlerThread("trip-tracking").apply { start() }
    handler = Handler(thread.looper)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    try {
      showNotification()
    } catch (_: RuntimeException) {
      // Android refused a background start (e.g. restart after being killed). The app restarts it when opened.
      stopSelf()
      return START_NOT_STICKY
    }
    val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    intent?.getStringExtra(EXTRA_URL)?.let { newUrl ->
      val bookingId = intent.getStringExtra(EXTRA_BOOKING_ID).orEmpty()
      val previous = prefs.getString(EXTRA_BOOKING_ID, null)
      prefs.edit()
        .putString(EXTRA_URL, newUrl)
        .putString(EXTRA_TOKEN, intent.getStringExtra(EXTRA_TOKEN))
        .putString(EXTRA_BOOKING_ID, bookingId)
        .putInt(EXTRA_INTERVAL, intent.getIntExtra(EXTRA_INTERVAL, 30))
        .apply()
      if (previous != null && previous != bookingId) handler.post { queue = JSONArray(); queueFile.delete() }
    }
    val savedUrl = prefs.getString(EXTRA_URL, null)
    val savedToken = prefs.getString(EXTRA_TOKEN, null)
    if (savedUrl == null || savedToken == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    val seconds = prefs.getInt(EXTRA_INTERVAL, 30)
    handler.post {
      val firstStart = url.isEmpty()
      url = savedUrl
      token = savedToken
      intervalMs = seconds * 1000L
      if (firstStart) {
        loadQueue()
        startListening()
        handler.post(uploadTick)
      }
    }
    return START_STICKY
  }

  override fun onDestroy() {
    val manager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    manager.removeUpdates(this)
    handler.removeCallbacksAndMessages(null)
    thread.quitSafely()
    super.onDestroy()
  }

  private fun showNotification() {
    val channelId = "trip_tracking"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(channelId, "Trip location sharing", NotificationManager.IMPORTANCE_LOW)
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)
    val tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, channelId) else @Suppress("DEPRECATION") Notification.Builder(this)
    val notification = builder
      .setSmallIcon(R.drawable.ic_notification)
      .setContentTitle("WAY2CARS trip in progress")
      .setContentText("Sharing your location with WAY2CARS until you return the car.")
      .setOngoing(true)
      .setContentIntent(tap)
      .build()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun startListening() {
    if (listening) return
    val manager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    for (provider in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
      try {
        if (manager.allProviders.contains(provider)) {
          manager.requestLocationUpdates(provider, intervalMs, 0f, this, thread.looper)
          listening = true
        }
      } catch (_: SecurityException) {
        // Permission removed: nothing to report. Admin sees "signal lost" and the app shows a warning.
      } catch (_: IllegalArgumentException) {
      }
    }
  }

  override fun onLocationChanged(location: Location) {
    if (location.accuracy > MAX_ACCURACY_M) return
    val now = System.currentTimeMillis()
    if (location.provider == LocationManager.GPS_PROVIDER) {
      lastGpsFixAt = now
    } else if (now - lastGpsFixAt < intervalMs * 2) {
      return // GPS is working, so ignore the rougher network fix
    }
    val point = JSONObject()
      .put("lat", location.latitude)
      .put("lng", location.longitude)
      .put("recordedAt", location.time)
    if (location.hasAccuracy()) point.put("accuracyM", location.accuracy.toDouble())
    if (location.hasSpeed()) point.put("speedKmh", (location.speed * 3.6).coerceIn(0.0, 400.0))
    if (location.hasBearing()) point.put("headingDeg", location.bearing.toDouble().coerceIn(0.0, 360.0))
    queue.put(point)
    while (queue.length() > MAX_QUEUED) queue.remove(0)
    saveQueue()
  }

  override fun onProviderEnabled(provider: String) {}
  override fun onProviderDisabled(provider: String) {}
  @Deprecated("Required on Android 10 and below")
  override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}

  private fun upload() {
    while (queue.length() > 0) {
      val count = minOf(queue.length(), BATCH)
      val positions = JSONArray()
      for (i in 0 until count) positions.put(queue.get(i))
      val status = post(JSONObject().put("positions", positions).toString()) ?: return
      when {
        status in 200..299 || status == 400 || status == 422 -> { // sent, or will never be accepted
          for (i in 0 until count) queue.remove(0)
          saveQueue()
        }
        status == 401 || status == 404 || status == 410 -> { // trip over, or token no longer valid
          finish()
          return
        }
        else -> return // try again on the next tick
      }
    }
    // Nothing queued: still ask, so a phone without a fix learns when the trip has ended.
    val status = post("""{"positions":[]}""")
    if (status == 401 || status == 404 || status == 410) finish()
  }

  private fun post(body: String): Int? {
    var connection: HttpURLConnection? = null
    return try {
      connection = URL(url).openConnection() as HttpURLConnection
      connection.requestMethod = "POST"
      connection.connectTimeout = 15_000
      connection.readTimeout = 15_000
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setRequestProperty("Authorization", "Bearer $token")
      connection.outputStream.use { it.write(body.toByteArray()) }
      connection.responseCode
    } catch (_: Exception) {
      null // offline: positions stay queued
    } finally {
      connection?.disconnect()
    }
  }

  private fun finish() {
    url = ""
    clearSaved(this)
    queue = JSONArray()
    stopSelf()
  }

  private fun loadQueue() {
    queue = try {
      if (queueFile.exists()) JSONArray(queueFile.readText()) else JSONArray()
    } catch (_: Exception) {
      JSONArray()
    }
  }

  private fun saveQueue() {
    try {
      queueFile.writeText(queue.toString())
    } catch (_: Exception) {
      // Storage full: positions stay in memory
    }
  }

  companion object {
    const val EXTRA_URL = "url"
    const val EXTRA_TOKEN = "token"
    const val EXTRA_BOOKING_ID = "bookingId"
    const val EXTRA_INTERVAL = "intervalSeconds"
    private const val PREFS = "trip_tracking"
    private const val QUEUE_FILE = "trip_tracking_queue.json"
    private const val NOTIFICATION_ID = 7301
    private const val UPLOAD_EVERY_MS = 60_000L
    private const val BATCH = 200
    private const val MAX_QUEUED = 2880 // 24 hours at one position per 30 seconds
    private const val MAX_ACCURACY_M = 200f

    fun clearSaved(context: Context) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
      File(context.filesDir, QUEUE_FILE).delete()
    }
  }
}
