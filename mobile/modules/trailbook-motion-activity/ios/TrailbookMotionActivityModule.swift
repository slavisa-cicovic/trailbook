import CoreMotion
import ExpoModulesCore

private let confidenceKey = "confidence"
private let recordedAtKey = "recordedAt"
private let sourcePlatformKey = "sourcePlatform"
private let typeKey = "type"
private let userDefaultsKey = "trailbook_motion_activity"

public final class TrailbookMotionActivityModule: Module {
  private static let activityManager = CMMotionActivityManager()
  private static let operationQueue = OperationQueue()
  private static var isUpdating = false

  public func definition() -> ModuleDefinition {
    Name("TrailbookMotionActivity")

    AsyncFunction("isAvailableAsync") {
      CMMotionActivityManager.isActivityAvailable()
    }

    AsyncFunction("isIgnoringBatteryOptimizationsAsync") {
      true
    }

    AsyncFunction("openBatteryOptimizationSettingsAsync") {
      return
    }

    AsyncFunction("getLatestActivityAsync") {
      return UserDefaults.standard.dictionary(forKey: userDefaultsKey)
    }

    AsyncFunction("startUpdatesAsync") {
      guard CMMotionActivityManager.isActivityAvailable() else {
        throw NSError(domain: "TrailbookMotionActivity", code: 1, userInfo: [
          NSLocalizedDescriptionKey: "Core Motion activity updates are not available on this device."
        ])
      }

      let authorizationStatus = CMMotionActivityManager.authorizationStatus()

      if authorizationStatus == .denied || authorizationStatus == .restricted {
        throw NSError(domain: "TrailbookMotionActivity", code: 2, userInfo: [
          NSLocalizedDescriptionKey: "Motion activity access is denied."
        ])
      }

      if Self.isUpdating {
        return
      }

      UserDefaults.standard.removeObject(forKey: userDefaultsKey)

      Self.activityManager.startActivityUpdates(to: Self.operationQueue) { activity in
        guard let activity else {
          return
        }

        let payload: [String: String] = [
          typeKey: self.normalizeType(activity),
          confidenceKey: self.normalizeConfidence(activity.confidence),
          recordedAtKey: ISO8601DateFormatter().string(from: activity.startDate),
          sourcePlatformKey: "ios"
        ]

        UserDefaults.standard.set(payload, forKey: userDefaultsKey)
      }

      Self.isUpdating = true
    }

    AsyncFunction("stopUpdatesAsync") {
      Self.activityManager.stopActivityUpdates()
      UserDefaults.standard.removeObject(forKey: userDefaultsKey)
      Self.isUpdating = false
    }
  }

  private func normalizeConfidence(_ confidence: CMMotionActivityConfidence) -> String {
    switch confidence {
    case .high:
      return "high"
    case .medium:
      return "medium"
    case .low:
      return "low"
    @unknown default:
      return "low"
    }
  }

  private func normalizeType(_ activity: CMMotionActivity) -> String {
    if activity.automotive {
      return "drive"
    }

    if activity.cycling {
      return "bike"
    }

    if activity.walking || activity.running {
      return "walk"
    }

    if activity.stationary {
      return "stationary"
    }

    return "unknown"
  }
}
