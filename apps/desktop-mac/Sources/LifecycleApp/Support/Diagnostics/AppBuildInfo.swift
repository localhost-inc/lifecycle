import Foundation

struct AppBuildInfo: Codable, Equatable, Sendable {
  let appName: String
  let bundleIdentifier: String
  let appVersion: String
  let buildVersion: String
  let gitSHA: String?
  let executablePath: String
  let bundlePath: String
  let macOSVersion: String
  let processID: Int32

  static func current() -> AppBuildInfo {
    let bundle = Bundle.main
    return AppBuildInfo(
      appName: bundle.object(forInfoDictionaryKey: "CFBundleName") as? String ?? "Lifecycle",
      bundleIdentifier: bundle.bundleIdentifier ?? AppLog.subsystem,
      appVersion: bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev",
      buildVersion: bundle.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "dev",
      gitSHA: ProcessInfo.processInfo.environment["LIFECYCLE_GIT_SHA"],
      executablePath: bundle.executableURL?.path ?? CommandLine.arguments.first ?? "",
      bundlePath: bundle.bundleURL.path,
      macOSVersion: ProcessInfo.processInfo.operatingSystemVersionString,
      processID: ProcessInfo.processInfo.processIdentifier
    )
  }
}
