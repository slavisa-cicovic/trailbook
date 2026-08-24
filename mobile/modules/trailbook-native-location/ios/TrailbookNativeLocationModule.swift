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
      try self.runOnMain {
        try self.startOnMain(tripId: tripId)
      }
    }

    AsyncFunction("stop") {
      try self.runOnMain {
        self.stopOnMain()
      }
    }

    AsyncFunction("peekEvents") { (maxCount: Int) -> [[String: Any]] in
      return self.peekEvents(maxCount: min(max(maxCount, 1), 250))
    }

    AsyncFunction("acknowledgeEvents") { (count: Int) in
      self.acknowledgeEvents(count: min(max(count, 0), 250))
    }

    AsyncFunction("pendingEventCount") { () -> Int in
      return self.pendingEventCount()
    }

    AsyncFunction("isRunning") { () -> Bool in
      return self.locationManager != nil
    }
  }

  @discardableResult
  private func runOnMain<T>(_ operation: @escaping () throws -> T) throws -> T {
    if Thread.isMainThread {
      return try operation()
    }

    var result: Result<T, Error>!
    DispatchQueue.main.sync {
      result = Result {
        try operation()
      }
    }
    return try result.get()
  }

  private func startOnMain(tripId: String) throws {
    let authorizationStatus = CLLocationManager.authorizationStatus()
    guard authorizationStatus == .authorizedAlways else {
      throw NSError(
        domain: "TrailbookNativeLocation",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Always location permission is required for native iOS recording."]
      )
    }

    stopOnMain()

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
    locationDelegate = delegate
    locationManager = manager
    manager.startUpdatingLocation()
    manager.requestLocation()
  }

  private func stopOnMain() {
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

  private func peekEvents(maxCount: Int) -> [[String: Any]] {
    return fileQueue.sync {
      let url = eventsFileUrl()
      guard let text = try? String(contentsOf: url, encoding: .utf8), !text.isEmpty else {
        return []
      }

      let events = text
        .split(separator: "\n")
        .prefix(maxCount)
        .compactMap { line -> [String: Any]? in
          guard let data = String(line).data(using: .utf8),
                let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
          }
          return json
        }

      return events
    }
  }

  private func acknowledgeEvents(count: Int) {
    guard count > 0 else { return }
    fileQueue.sync {
      let url = eventsFileUrl()
      guard let text = try? String(contentsOf: url, encoding: .utf8) else { return }
      let remaining = text.split(separator: "\n").dropFirst(count)
      if remaining.isEmpty {
        try? FileManager.default.removeItem(at: url)
      } else {
        try? (remaining.joined(separator: "\n") + "\n").write(
          to: url,
          atomically: true,
          encoding: .utf8
        )
      }
    }
  }

  private func pendingEventCount() -> Int {
    return fileQueue.sync {
      let url = eventsFileUrl()
      guard let text = try? String(contentsOf: url, encoding: .utf8) else { return 0 }
      return text.split(separator: "\n").count
    }
  }

  private func eventsFileUrl() -> URL {
    let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    return directory.appendingPathComponent("trailbook-native-location-events.jsonl")
  }
}
