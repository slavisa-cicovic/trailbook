package expo.modules.trailbooknativelocation

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.LocationResult

class TrailbookLocationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != TrailbookNativeLocationModule.ACTION_LOCATION_UPDATE) return
    val tripId = TrailbookLocationStorage.activeTripId(context) ?: return
    val result = LocationResult.extractResult(intent) ?: return
    TrailbookLocationStorage.append(context, tripId, result.locations)
  }
}
