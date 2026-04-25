import AppKit
import CoreText
import SwiftUI

enum AppFontRole {
  case sans
  case mono
  case pixel
}

enum AppTypography {
  static let defaultUIFontName = "Geist"
  static let defaultCodeFontName = "Geist Mono"

  nonisolated(unsafe) private static var uiFontName = defaultUIFontName
  nonisolated(unsafe) private static var codeFontName = defaultCodeFontName
  private static let pixelName = "GeistPixel-Square"

  static func setFonts(ui: String, code: String) {
    uiFontName = normalizedFontName(ui, fallback: defaultUIFontName)
    codeFontName = normalizedFontName(code, fallback: defaultCodeFontName)
  }

  static func swiftUIFont(
    size: CGFloat,
    weight: Font.Weight = .regular,
    design: Font.Design = .default
  ) -> Font {
    let role: AppFontRole = design == .monospaced ? .mono : .sans
    guard AppResources.registerBundledFonts() else {
      return .system(size: size, weight: weight, design: design)
    }

    let name = fontName(for: role)
    guard NSFont(name: name, size: size) != nil else {
      return .system(size: size, weight: weight, design: design)
    }

    return Font.custom(name, size: size).weight(weight)
  }

  static func pixelSwiftUIFont(size: CGFloat) -> Font {
    guard AppResources.registerBundledFonts() else {
      return .system(size: size, weight: .regular, design: .monospaced)
    }

    return Font.custom(fontName(for: .pixel), size: size)
  }

  static func nsFont(
    size: CGFloat,
    weight: NSFont.Weight = .regular,
    role: AppFontRole = .sans
  ) -> NSFont {
    guard AppResources.registerBundledFonts(),
          let familyFont = NSFont(name: fontName(for: role), size: size)
    else {
      return role == .mono
        ? NSFont.monospacedSystemFont(ofSize: size, weight: weight)
        : NSFont.systemFont(ofSize: size, weight: weight)
    }

    if role == .pixel {
      return familyFont
    }

    let traits: [NSFontDescriptor.TraitKey: Any] = [.weight: weight]
    let descriptor = familyFont.fontDescriptor.addingAttributes([
      .traits: traits,
    ])
    return NSFont(descriptor: descriptor, size: size) ?? familyFont
  }

  private static func fontName(for role: AppFontRole) -> String {
    switch role {
    case .sans:
      uiFontName
    case .mono:
      codeFontName
    case .pixel:
      pixelName
    }
  }

  private static func normalizedFontName(_ name: String, fallback: String) -> String {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? fallback : trimmed
  }
}

extension Font {
  static func lc(
    size: CGFloat,
    weight: Font.Weight = .regular,
    design: Font.Design = .default
  ) -> Font {
    AppTypography.swiftUIFont(size: size, weight: weight, design: design)
  }

  static func lcPixel(size: CGFloat) -> Font {
    AppTypography.pixelSwiftUIFont(size: size)
  }
}
