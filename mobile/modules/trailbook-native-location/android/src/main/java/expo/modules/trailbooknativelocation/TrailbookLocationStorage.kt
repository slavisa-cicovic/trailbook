package expo.modules.trailbooknativelocation

import android.content.Context
import android.location.Location
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

internal object TrailbookLocationStorage {
  private const val FILE_NAME = "trailbook-native-location-events.jsonl"
  private const val PREFS_NAME = "trailbook_native_location"
  private const val KEY_TRIP_ID = "activeTripId"
  private const val KEY_RECENT_KEYS = "recentLocationKeys"
  private const val MAX_RECENT_KEYS = 512
  private val lock = Any()

  fun activeTripId(context: Context): String? =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(KEY_TRIP_ID, null)

  fun setActiveTripId(context: Context, tripId: String?) {
    val editor = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
    if (tripId == null) editor.remove(KEY_TRIP_ID) else editor.putString(KEY_TRIP_ID, tripId)
    editor.apply()
  }

  fun append(context: Context, tripId: String, locations: List<Location>): Int = synchronized(lock) {
    if (locations.isEmpty()) return@synchronized 0
    val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    val recent = prefs.getString(KEY_RECENT_KEYS, "")
      .orEmpty().split('\n').filter { it.isNotBlank() }.toMutableList()
    val recentSet = recent.toMutableSet()
    var written = 0
    queueFile(context).appendText(buildString {
      locations.sortedBy { it.time }.forEach { location ->
        val key = "${location.time}:${location.latitude}:${location.longitude}"
        if (recentSet.add(key)) {
          append(toJson(tripId, location).toString()).append('\n')
          recent.add(key)
          written += 1
        }
      }
    })
    val retained = recent.takeLast(MAX_RECENT_KEYS)
    prefs.edit().putString(KEY_RECENT_KEYS, retained.joinToString("\n")).apply()
    written
  }

  fun peek(context: Context, maxCount: Int): List<Map<String, Any>> = synchronized(lock) {
    if (maxCount <= 0 || !queueFile(context).exists()) return@synchronized emptyList()
    queueFile(context).bufferedReader().useLines { lines ->
      lines.take(maxCount).mapNotNull { line ->
        runCatching { jsonToMap(JSONObject(line)) }.getOrNull()
      }.toList()
    }
  }

  fun acknowledge(context: Context, count: Int) = synchronized(lock) {
    if (count <= 0) return@synchronized
    val source = queueFile(context)
    if (!source.exists()) return@synchronized
    val replacement = File(context.filesDir, "$FILE_NAME.next")
    source.bufferedReader().use { reader ->
      replacement.bufferedWriter().use { writer ->
        var skipped = 0
        reader.forEachLine { line ->
          if (skipped < count) skipped += 1 else {
            writer.append(line)
            writer.newLine()
          }
        }
      }
    }
    if (!replacement.renameTo(source)) {
      replacement.copyTo(source, overwrite = true)
      replacement.delete()
    }
  }

  fun pendingCount(context: Context): Int = synchronized(lock) {
    if (!queueFile(context).exists()) 0 else queueFile(context).useLines { it.count() }
  }

  private fun queueFile(context: Context) = File(context.filesDir, FILE_NAME)

  private fun toJson(tripId: String, location: Location) = JSONObject().apply {
    put("tripId", tripId)
    put("timestamp", isoTimestamp(location.time))
    put("latitude", location.latitude)
    put("longitude", location.longitude)
    put("provider", "native-android")
    if (location.hasAccuracy()) put("accuracyM", location.accuracy.toDouble())
    if (location.hasAltitude()) put("altitudeM", location.altitude)
    if (location.hasSpeed()) put("speedMps", location.speed.toDouble())
    if (location.hasBearing()) put("bearingDeg", location.bearing.toDouble())
  }

  private fun jsonToMap(json: JSONObject): Map<String, Any> = buildMap {
    json.keys().forEach { key -> put(key, json.get(key)) }
  }

  private fun isoTimestamp(value: Long): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date(value))
}
