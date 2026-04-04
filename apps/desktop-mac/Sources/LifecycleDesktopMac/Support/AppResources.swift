import Foundation

enum AppResources {
  static func ghosttyThemeConfigPath() -> String {
    let resourceBundleName = "LifecycleDesktopMac_LifecycleDesktopMac.bundle"

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
