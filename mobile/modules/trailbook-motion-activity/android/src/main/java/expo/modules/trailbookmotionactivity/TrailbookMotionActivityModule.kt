package expo.modules.trailbookmotionactivity

import android.Manifest
import android.app.PendingIntent
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.PowerManager
import android.os.Build
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityRecognitionClient
import com.google.android.gms.tasks.Tasks
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TrailbookMotionActivityModule : Module() {
  private lateinit var context: Context
  private lateinit var activityRecognitionClient: ActivityRecognitionClient

  override fun definition() = ModuleDefinition {
    Name("TrailbookMotionActivity")

    OnCreate {
      context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      activityRecognitionClient = ActivityRecognition.getClient(context)
    }

    AsyncFunction("isAvailableAsync") {
      GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
    }

    AsyncFunction("isIgnoringBatteryOptimizationsAsync") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        true
      } else {
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        powerManager.isIgnoringBatteryOptimizations(context.packageName)
      }
    }

    AsyncFunction("openBatteryOptimizationSettingsAsync") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
      }
      null
    }

    AsyncFunction("getAndroidRecordingEnvironmentAsync") {
      mapOf(
        "activityRecognitionPermissionGranted" to hasPermissionIfRequired(
          Manifest.permission.ACTIVITY_RECOGNITION,
          Build.VERSION_CODES.Q,
        ),
        "backgroundLocationPermissionGranted" to hasPermissionIfRequired(
          Manifest.permission.ACCESS_BACKGROUND_LOCATION,
          Build.VERSION_CODES.Q,
        ),
        "batteryOptimizationIgnored" to isIgnoringBatteryOptimizations(),
        "coarseLocationPermissionGranted" to hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION),
        "fineLocationPermissionGranted" to hasPermission(Manifest.permission.ACCESS_FINE_LOCATION),
        "foregroundServiceLocationPermissionGranted" to hasForegroundServiceLocationPermission(),
        "locationEnabled" to isLocationEnabled(),
        "notificationPermissionGranted" to hasPermissionIfRequired(
          Manifest.permission.POST_NOTIFICATIONS,
          Build.VERSION_CODES.TIRAMISU,
        ),
        "packageName" to context.packageName,
        "standbyBucket" to getStandbyBucketName(),
      )
    }

    AsyncFunction("getLatestActivityAsync") {
      TrailbookMotionActivityStorage.load(context)
    }

    AsyncFunction("startUpdatesAsync") {
      if (!isUpdating) {
        ensurePermissionIfNeeded()
        TrailbookMotionActivityStorage.clear(context)
        Tasks.await(activityRecognitionClient.requestActivityUpdates(5000L, createPendingIntent()))
        isUpdating = true
      }
      null
    }

    AsyncFunction("stopUpdatesAsync") {
      if (::activityRecognitionClient.isInitialized && isUpdating) {
        Tasks.await(activityRecognitionClient.removeActivityUpdates(createPendingIntent()))
      }
      TrailbookMotionActivityStorage.clear(context)
      isUpdating = false
      null
    }
  }

  private fun createPendingIntent(): PendingIntent {
    val intent = Intent(context, TrailbookMotionActivityReceiver::class.java).apply {
      action = ACTION_ACTIVITY_UPDATE
    }
    val flags =
      PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0

    return PendingIntent.getBroadcast(context, 4491, intent, flags)
  }

  private fun ensurePermissionIfNeeded() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      return
    }

    val status = ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION)

    if (status != PackageManager.PERMISSION_GRANTED) {
      throw IllegalStateException("ACTIVITY_RECOGNITION permission is required.")
    }
  }

  private fun hasPermission(permission: String): Boolean {
    return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
  }

  private fun hasPermissionIfRequired(permission: String, minSdk: Int): Boolean {
    return Build.VERSION.SDK_INT < minSdk || hasPermission(permission)
  }

  private fun hasForegroundServiceLocationPermission(): Boolean {
    return if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      true
    } else {
      hasPermission(Manifest.permission.FOREGROUND_SERVICE_LOCATION)
    }
  }

  private fun isIgnoringBatteryOptimizations(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      return true
    }

    val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    return powerManager.isIgnoringBatteryOptimizations(context.packageName)
  }

  private fun isLocationEnabled(): Boolean {
    val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      locationManager.isLocationEnabled
    } else {
      locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
        locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }
  }

  private fun getStandbyBucketName(): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
      return null
    }

    val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

    return when (usageStatsManager.appStandbyBucket) {
      UsageStatsManager.STANDBY_BUCKET_ACTIVE -> "active"
      UsageStatsManager.STANDBY_BUCKET_WORKING_SET -> "working_set"
      UsageStatsManager.STANDBY_BUCKET_FREQUENT -> "frequent"
      UsageStatsManager.STANDBY_BUCKET_RARE -> "rare"
      UsageStatsManager.STANDBY_BUCKET_RESTRICTED -> "restricted"
      else -> "unknown"
    }
  }

  companion object {
    const val ACTION_ACTIVITY_UPDATE = "com.slavisacicovic.trailbook.ACTION_ACTIVITY_UPDATE"
    private var isUpdating = false
  }
}
