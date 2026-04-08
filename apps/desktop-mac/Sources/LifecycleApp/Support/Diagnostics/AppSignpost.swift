import Foundation
import OSLog

struct AppSignpostInterval {
  let signposter: OSSignposter
  let name: StaticString
  let state: OSSignpostIntervalState
}

enum AppSignpost {
  @MainActor
  private static func signposter(for category: AppLogCategory) -> OSSignposter {
    OSSignposter(subsystem: AppLog.subsystem, category: category.rawValue)
  }

  @MainActor
  static func begin(_ category: AppLogCategory, _ name: StaticString) -> AppSignpostInterval {
    let signposter = signposter(for: category)
    let state = signposter.beginInterval(name)
    return AppSignpostInterval(signposter: signposter, name: name, state: state)
  }

  @MainActor
  static func end(_ interval: AppSignpostInterval) {
    interval.signposter.endInterval(interval.name, interval.state)
  }

  @MainActor
  static func withInterval<T>(
    _ category: AppLogCategory,
    _ name: StaticString,
    operation: () throws -> T
  ) rethrows -> T {
    let interval = begin(category, name)
    defer { end(interval) }
    return try operation()
  }

  @MainActor
  static func withInterval<T>(
    _ category: AppLogCategory,
    _ name: StaticString,
    operation: () async throws -> T
  ) async rethrows -> T {
    let interval = begin(category, name)
    defer { end(interval) }
    return try await operation()
  }
}
