import AppKit
import CoreText
import Foundation

enum AppResources {
  private struct BundledFontResource {
    let name: String
    let resourceExtension: String
  }

  private static let bundledFonts = [
    BundledFontResource(name: "Geist-Variable", resourceExtension: "ttf"),
    BundledFontResource(name: "GeistMono-Variable", resourceExtension: "ttf"),
    BundledFontResource(name: "GeistPixel-Square", resourceExtension: "woff2"),
  ]
  private static let bundledFontsRegistered: Bool = {
    var allAvailable = true
    for font in bundledFonts {
      guard let url = bundledResourceURL(
        name: font.name,
        extension: font.resourceExtension
      ) else {
        allAvailable = false
        continue
      }

      var error: Unmanaged<CFError>?
      let registered = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error)
      if !registered {
        if let resolvedError = error?.takeRetainedValue(),
           CFErrorGetDomain(resolvedError) == kCTFontManagerErrorDomain,
           CFErrorGetCode(resolvedError) == CTFontManagerError.alreadyRegistered.rawValue
        {
          continue
        }

        allAvailable = false
      }
    }

    return allAvailable
  }()

  static let lifecycleLogoImage: NSImage? = {
    guard let url = bundledResourceURL(name: "logo-light", extension: "svg"),
          let image = NSImage(contentsOf: url)
    else {
      return nil
    }

    image.isTemplate = true
    return image
  }()

  static let lifecycleWordmarkImage: NSImage? = {
    guard let url = bundledResourceURL(name: "wordmark-light", extension: "svg"),
          let image = NSImage(contentsOf: url)
    else {
      return nil
    }

    image.isTemplate = true
    return image
  }()

  static func profileIconImage(named name: String) -> NSImage? {
    guard let url = bundledResourceURL(
      name: name,
      extension: "svg",
      subdirectory: "ProfileIcons"
    ),
      let image = NSImage(contentsOf: url)
    else {
      return nil
    }

    image.isTemplate = true
    return image
  }

  static func bundledTerminalThemeConfigPath() -> String {
    bundledResourceURL(name: "terminal-theme", extension: "config")?.path ?? ""
  }

  static func registerBundledFonts() -> Bool {
    bundledFontsRegistered
  }

  private static func bundledResourceURL(
    name: String,
    extension resourceExtension: String,
    subdirectory: String? = nil
  ) -> URL? {
    let resourceBundleName = "Lifecycle_Lifecycle.bundle"
    let mainBundleCandidates = [
      Bundle.main.resourceURL?.appendingPathComponent(resourceBundleName),
      Bundle.main.bundleURL.appendingPathComponent(resourceBundleName),
    ]

    for candidate in mainBundleCandidates {
      guard let candidate else {
        continue
      }

      var resourceURL = candidate
      if let subdirectory {
        resourceURL = resourceURL.appendingPathComponent(subdirectory, isDirectory: true)
      }
      resourceURL = resourceURL.appendingPathComponent("\(name).\(resourceExtension)")
      if FileManager.default.fileExists(atPath: resourceURL.path) {
        return resourceURL
      }
    }

    if let bundled = Bundle.module.url(
      forResource: name,
      withExtension: resourceExtension,
      subdirectory: subdirectory
    ) {
      return bundled
    }

    if subdirectory != nil {
      return Bundle.module.url(forResource: name, withExtension: resourceExtension)
    }

    return nil
  }
}
