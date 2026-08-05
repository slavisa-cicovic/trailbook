import CoreMotion
import ExpoModulesCore

private let storageKey = "trailbook_motion_activity"

public final class TrailbookMotionActivityModule: Module {
  private static let manager = CMMotionActivityManager()
  private static let queue = OperationQueue()

  public func definition() -> ModuleDefinition {
    Name("TrailbookMotionActivity")

    AsyncFunction("isAvailableAsync") {
      CMMotionActivityManager.isActivityAvailable()
    }

    AsyncFunction("getLatestActivityAsync") {
      UserDefaults.standard.dictionary(forKey: storageKey)
    }

    AsyncFunction("startUpdatesAsync") {
      guard CMMotionActivityManager.isActivityAvailable() else {
        throw NSError(domain: "TrailbookMotionActivity", code: 1, userInfo: [
          NSLocalizedDescriptionKey: "Core Motion activity updates are unavailable."
        ])
      }
      let status = CMMotionActivityManager.authorizationStatus()
      if status == .denied || status == .restricted {
        throw NSError(domain: "TrailbookMotionActivity", code: 2, userInfo: [
          NSLocalizedDescriptionKey: "Motion activity access is denied."
        ])
      }

      UserDefaults.standard.removeObject(forKey: storageKey)
      Self.manager.stopActivityUpdates()
      Self.manager.startActivityUpdates(to: Self.queue) { activity in
        guard let activity else { return }
        UserDefaults.standard.set([
          "type": self.normalizeType(activity),
          "confidence": self.normalizeConfidence(activity.confidence),
          "recordedAt": ISO8601DateFormatter().string(from: activity.startDate),
          "sourcePlatform": "ios"
        ], forKey: storageKey)
      }
    }

    AsyncFunction("stopUpdatesAsync") {
      Self.manager.stopActivityUpdates()
      UserDefaults.standard.removeObject(forKey: storageKey)
    }
  }

  private func normalizeConfidence(_ value: CMMotionActivityConfidence) -> String {
    switch value {
    case .high: return "high"
    case .medium: return "medium"
    case .low: return "low"
    @unknown default: return "low"
    }
  }

  private func normalizeType(_ activity: CMMotionActivity) -> String {
    if activity.automotive { return "drive" }
    if activity.cycling { return "bike" }
    if activity.walking || activity.running { return "walk" }
    if activity.stationary { return "stationary" }
    return "unknown"
  }
}
