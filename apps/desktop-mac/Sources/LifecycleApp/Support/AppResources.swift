import AppKit
import Foundation

enum AppResources {
  static let lifecycleLogoImage: NSImage? = {
    guard let url = bundledResourceURL(name: "logo-light", extension: "svg"),
          let image = NSImage(contentsOf: url)
    else {
      return nil
    }

    image.isTemplate = true
    return image
  }()

  static func bundledTerminalThemeConfigPath() -> String {
    bundledResourceURL(name: "terminal-theme", extension: "config")?.path ?? ""
  }

  private static func bundledResourceURL(name: String, extension resourceExtension: String) -> URL? {
    let resourceBundleName = "LifecycleMac_LifecycleApp.bundle"
    let mainBundleCandidates = [
      Bundle.main.resourceURL?.appendingPathComponent(resourceBundleName),
      Bundle.main.bundleURL.appendingPathComponent(resourceBundleName),
    ]

    for candidate in mainBundleCandidates {
      guard let candidate else {
        continue
      }

      let resourceURL = candidate.appendingPathComponent("\(name).\(resourceExtension)")
      if FileManager.default.fileExists(atPath: resourceURL.path) {
        return resourceURL
      }
    }

    return Bundle.module.url(forResource: name, withExtension: resourceExtension)
  }
}
