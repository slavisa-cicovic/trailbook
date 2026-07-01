import CoreLocation
import ExpoModulesCore

private final class TrailbookLocationDelegate: NSObject, CLLocationManagerDelegate {
  private let onLocations: ([CLLocation]) -> Void
  private let onError: (Error) -> Void

  init(
    onLocations: @escaping ([CLLocation]) -> Void,
    onError: @escaping (Error) -> Void
  ) {
    self.onLocations = onLocations
    self.onError = onError
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    onLocations(locations)
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    onError(error)
  }
}

public class TrailbookNativeLocationModule: Module {
  private var locationManager: CLLocationManager?
  private var locationDelegate: TrailbookLocationDelegate?
  private var activeTripId: String?
  private let fileQueue = DispatchQueue(label: "trailbook.native-location.file")
  private let timestampFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  public func definition() -> ModuleDefinition {
    Name("TrailbookNativeLocation")
    Events("onLocations")

    AsyncFunction("start") { (tripId: String) in
      try self.start(tripId: tripId)
    }

    AsyncFunction("stop") {
      self.stop()
    }

    AsyncFunction("drainEvents") { () -> [[String: Any]] in
      return self.drainEvents()
    }

    AsyncFunction("isRunning") { () -> Bool in
      return self.locationManager != nil
    }
  }

  private func start(tripId: String) throws {
    let authorizationStatus = CLLocationManager.authorizationStatus()
    guard authorizationStatus == .authorizedAlways else {
      throw NSError(
        domain: "TrailbookNativeLocation",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Always location permission is required for native iOS recording."]
      )
    }

    stop()

    activeTripId = tripId
    let manager = CLLocationManager()
    let delegate = TrailbookLocationDelegate(
      onLocations: { [weak self] locations in
        self?.handleLocations(locations)
      },
      onError: { [weak self] error in
        self?.sendEvent("onLocations", [
          "error": error.localizedDescription
        ])
      }
    )
    manager.delegate = delegate
    manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
    manager.distanceFilter = 5
    manager.activityType = .otherNavigation
    manager.pausesLocationUpdatesAutomatically = false
    manager.allowsBackgroundLocationUpdates = true
    manager.showsBackgroundLocationIndicator = true
    manager.startUpdatingLocation()
    locationDelegate = delegate
    locationManager = manager
  }

  private func stop() {
    locationManager?.stopUpdatingLocation()
    locationManager?.delegate = nil
    locationManager = nil
    locationDelegate = nil
    activeTripId = nil
  }

  private func handleLocations(_ locations: [CLLocation]) {
    guard let tripId = activeTripId else {
      return
    }

    let events = locations.map { location in
      locationEvent(tripId: tripId, location: location)
    }

    appendEvents(events)
    sendEvent("onLocations", ["count": events.count])
  }

  private func locationEvent(tripId: String, location: CLLocation) -> [String: Any] {
    var event: [String: Any] = [
      "tripId": tripId,
      "timestamp": timestampFormatter.string(from: location.timestamp),
      "latitude": location.coordinate.latitude,
      "longitude": location.coordinate.longitude,
      "provider": "native-ios"
    ]

    if location.horizontalAccuracy >= 0 {
      event["accuracyM"] = location.horizontalAccuracy
    }
    if location.verticalAccuracy >= 0 {
      event["altitudeM"] = location.altitude
    }
    if location.speed >= 0 {
      event["speedMps"] = location.speed
    }
    if location.course >= 0 {
      event["bearingDeg"] = location.course
    }

    return event
  }

  private func appendEvents(_ events: [[String: Any]]) {
    guard !events.isEmpty else {
      return
    }

    fileQueue.sync {
      let url = eventsFileUrl()
      let lines = events.compactMap { event -> String? in
        guard JSONSerialization.isValidJSONObject(event),
              let data = try? JSONSerialization.data(withJSONObject: event),
              let json = String(data: data, encoding: .utf8) else {
          return nil
        }
        return json
      }

      guard !lines.isEmpty else {
        return
      }

      let text = lines.joined(separator: "\n") + "\n"
      if FileManager.default.fileExists(atPath: url.path),
         let handle = try? FileHandle(forWritingTo: url) {
        defer { try? handle.close() }
        try? handle.seekToEnd()
        if let data = text.data(using: .utf8) {
          try? handle.write(contentsOf: data)
        }
      } else {
        try? text.write(to: url, atomically: true, encoding: .utf8)
      }
    }
  }

  private func drainEvents() -> [[String: Any]] {
    return fileQueue.sync {
      let url = eventsFileUrl()
      guard let text = try? String(contentsOf: url, encoding: .utf8), !text.isEmpty else {
        return []
      }

      let events = text
        .split(separator: "\n")
        .compactMap { line -> [String: Any]? in
          guard let data = String(line).data(using: .utf8),
                let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
          }
          return json
        }

      try? FileManager.default.removeItem(at: url)
      return events
    }
  }

  private func eventsFileUrl() -> URL {
    let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    return directory.appendingPathComponent("trailbook-native-location-events.jsonl")
  }
}
