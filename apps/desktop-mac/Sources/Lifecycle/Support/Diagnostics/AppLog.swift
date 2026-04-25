import Foundation
import OSLog

enum AppLogCategory: String, CaseIterable, Codable, Sendable {
  case app
  case bridge
  case workspace
  case terminal
  case agent
  case ui
  case feedback
}

enum AppLogLevel: String, Codable, Sendable {
  case debug
  case info
  case notice
  case error
  case fault
}

struct AppLogEntry: Codable, Equatable, Sendable {
  let timestamp: Date
  let level: AppLogLevel
  let category: AppLogCategory
  let message: String
  let metadata: [String: String]
}

actor AppLogStore {
  private let limit: Int
  private var entries: [AppLogEntry] = []

  init(limit: Int) {
    self.limit = max(limit, 1)
  }

  func append(_ entry: AppLogEntry) {
    entries.append(entry)
    if entries.count > limit {
      entries.removeFirst(entries.count - limit)
    }
  }

  func snapshot(limit requestedLimit: Int?) -> [AppLogEntry] {
    guard let requestedLimit else {
      return entries
    }

    guard requestedLimit > 0 else {
      return []
    }

    return Array(entries.suffix(requestedLimit))
  }
}

enum AppLog {
  static let subsystem = Bundle.main.bundleIdentifier ?? "inc.localhost.lifecycle.desktop-mac"

  private static let store = AppLogStore(limit: 800)

  static func snapshot(limit: Int? = nil) async -> [AppLogEntry] {
    await store.snapshot(limit: limit)
  }

  static func debug(
    _ category: AppLogCategory,
    _ message: String,
    metadata: [String: String] = [:]
  ) {
    record(.debug, category, message, metadata: metadata)
  }

  static func info(
    _ category: AppLogCategory,
    _ message: String,
    metadata: [String: String] = [:]
  ) {
    record(.info, category, message, metadata: metadata)
  }

  static func notice(
    _ category: AppLogCategory,
    _ message: String,
    metadata: [String: String] = [:]
  ) {
    record(.notice, category, message, metadata: metadata)
  }

  static func error(
    _ category: AppLogCategory,
    _ message: String,
    metadata: [String: String] = [:]
  ) {
    record(.error, category, message, metadata: metadata)
  }

  static func error(
    _ category: AppLogCategory,
    _ message: String,
    error: Error,
    metadata: [String: String] = [:]
  ) {
    var mergedMetadata = metadata
    mergedMetadata["error"] = error.localizedDescription
    record(.error, category, message, metadata: mergedMetadata)
  }

  static func fault(
    _ category: AppLogCategory,
    _ message: String,
    metadata: [String: String] = [:]
  ) {
    record(.fault, category, message, metadata: metadata)
  }

  private static func record(
    _ level: AppLogLevel,
    _ category: AppLogCategory,
    _ message: String,
    metadata: [String: String]
  ) {
    let logger = Logger(subsystem: subsystem, category: category.rawValue)

    switch level {
    case .debug:
      logger.debug("\(message, privacy: .public)")
    case .info:
      logger.info("\(message, privacy: .public)")
    case .notice:
      logger.notice("\(message, privacy: .public)")
    case .error:
      logger.error("\(message, privacy: .public)")
    case .fault:
      logger.fault("\(message, privacy: .public)")
    }

    let entry = AppLogEntry(
      timestamp: Date(),
      level: level,
      category: category,
      message: message,
      metadata: metadata
    )

    Task {
      await store.append(entry)
    }
  }
}
