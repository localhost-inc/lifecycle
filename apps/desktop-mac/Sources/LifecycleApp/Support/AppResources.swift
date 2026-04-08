import Foundation

enum AppResources {
  static func bundledGhosttyThemeConfigPath() -> String {
    let resourceBundleName = "LifecycleMac_LifecycleApp.bundle"

    let mainBundleCandidates = [
      Bundle.main.resourceURL?.appendingPathComponent(resourceBundleName),
      Bundle.main.bundleURL.appendingPathComponent(resourceBundleName),
    ]

    for candidate in mainBundleCandidates {
      guard let candidate else {
        continue
      }

      let resourceURL = candidate.appendingPathComponent("ghostty-theme.config")
      if FileManager.default.fileExists(atPath: resourceURL.path) {
        return resourceURL.path
      }
    }

    if let bundledURL = Bundle.module.url(forResource: "ghostty-theme", withExtension: "config") {
      return bundledURL.path
    }

    return ""
  }
}
