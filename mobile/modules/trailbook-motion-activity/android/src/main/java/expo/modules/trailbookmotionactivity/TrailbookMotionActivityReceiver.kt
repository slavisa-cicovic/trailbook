package expo.modules.trailbookmotionactivity

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.DetectedActivity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

internal class TrailbookMotionActivityReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != TrailbookMotionActivityModule.ACTION_ACTIVITY_UPDATE) return
    if (!ActivityRecognitionResult.hasResult(intent)) return

    val result = ActivityRecognitionResult.extractResult(intent) ?: return
    val activity = result.probableActivities.maxByOrNull { it.confidence } ?: return
    val recordedAtMillis = result.time.takeIf { it > 0 } ?: System.currentTimeMillis()

    TrailbookMotionActivityStorage.save(
      context,
      normalizeType(activity.type),
      normalizeConfidence(activity.confidence),
      isoTimestamp(recordedAtMillis),
    )
  }

  private fun isoTimestamp(value: Long): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date(value))

  private fun normalizeConfidence(value: Int) = when {
    value >= 75 -> "high"
    value >= 40 -> "medium"
    else -> "low"
  }

  private fun normalizeType(value: Int) = when (value) {
    DetectedActivity.IN_VEHICLE -> "drive"
    DetectedActivity.ON_BICYCLE -> "bike"
    DetectedActivity.ON_FOOT,
    DetectedActivity.WALKING,
    DetectedActivity.RUNNING -> "walk"
    DetectedActivity.STILL -> "stationary"
    else -> "unknown"
  }
}
