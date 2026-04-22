package expo.modules.trailbookmotionactivity

import android.content.Context

private const val PREFERENCES_NAME = "trailbook_motion_activity"
private const val KEY_CONFIDENCE = "confidence"
private const val KEY_RECORDED_AT = "recordedAt"
private const val KEY_TYPE = "type"

internal object TrailbookMotionActivityStorage {
  fun clear(context: Context) {
    preferences(context).edit().clear().apply()
  }

  fun load(context: Context): Map<String, String>? {
    val preferences = preferences(context)
    val type = preferences.getString(KEY_TYPE, null) ?: return null
    val confidence = preferences.getString(KEY_CONFIDENCE, null) ?: return null
    val recordedAt = preferences.getString(KEY_RECORDED_AT, null) ?: return null

    return mapOf(
      "type" to type,
      "confidence" to confidence,
      "recordedAt" to recordedAt,
      "sourcePlatform" to "android",
    )
  }

  fun save(context: Context, type: String, confidence: String, recordedAt: String) {
    preferences(context)
      .edit()
      .putString(KEY_TYPE, type)
      .putString(KEY_CONFIDENCE, confidence)
      .putString(KEY_RECORDED_AT, recordedAt)
      .apply()
  }

  private fun preferences(context: Context) =
    context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
}
