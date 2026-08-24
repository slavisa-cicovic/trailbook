package expo.modules.trailbooknativelocation

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.Tasks
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TrailbookNativeLocationModule : Module() {
  private lateinit var context: Context

  override fun definition() = ModuleDefinition {
    Name("TrailbookNativeLocation")

    OnCreate {
      context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    }

    AsyncFunction("start") { tripId: String -> start(tripId) }
    AsyncFunction("stop") { stop() }
    AsyncFunction("peekEvents") { maxCount: Int ->
      TrailbookLocationStorage.peek(context, maxCount.coerceIn(1, MAX_DRAIN_SIZE))
    }
    AsyncFunction("acknowledgeEvents") { count: Int ->
      TrailbookLocationStorage.acknowledge(context, count.coerceIn(0, MAX_DRAIN_SIZE))
    }
    AsyncFunction("pendingEventCount") { TrailbookLocationStorage.pendingCount(context) }
    AsyncFunction("isRunning") { TrailbookLocationStorage.activeTripId(context) != null }
  }

  private fun start(tripId: String) {
    require(tripId.isNotBlank()) { "Trip id is required." }
    ensureLocationPermission()
    TrailbookLocationStorage.setActiveTripId(context, tripId)
    ContextCompat.startForegroundService(context, Intent(context, TrailbookLocationService::class.java))
    try {
      val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 3_000L)
        .setMinUpdateIntervalMillis(2_000L)
        .setMinUpdateDistanceMeters(5f)
        .setMaxUpdateDelayMillis(0L)
        .build()
      Tasks.await(LocationServices.getFusedLocationProviderClient(context)
        .requestLocationUpdates(request, pendingIntent()))
    } catch (error: Throwable) {
      TrailbookLocationStorage.setActiveTripId(context, null)
      context.stopService(Intent(context, TrailbookLocationService::class.java))
      throw error
    }
  }

  private fun stop() {
    if (!::context.isInitialized) return
    try {
      Tasks.await(LocationServices.getFusedLocationProviderClient(context)
        .removeLocationUpdates(pendingIntent()))
    } finally {
      TrailbookLocationStorage.setActiveTripId(context, null)
      context.stopService(Intent(context, TrailbookLocationService::class.java))
      // append() and pendingCount() share the storage lock. Crossing this
      // barrier guarantees that a BroadcastReceiver already appending its
      // accepted batch has finished before JavaScript performs the final drain.
      TrailbookLocationStorage.pendingCount(context)
    }
  }

  private fun pendingIntent(): PendingIntent {
    val intent = Intent(context, TrailbookLocationReceiver::class.java).apply {
      action = ACTION_LOCATION_UPDATE
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_MUTABLE else 0
    return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags)
  }

  private fun ensureLocationPermission() {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) !=
      PackageManager.PERMISSION_GRANTED
    ) throw IllegalStateException("Precise location permission is required.")
  }

  companion object {
    const val ACTION_LOCATION_UPDATE = "com.slavisacicovic.trailbook.ACTION_NATIVE_LOCATION_UPDATE"
    private const val REQUEST_CODE = 7311
    private const val MAX_DRAIN_SIZE = 250
  }
}
