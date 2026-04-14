import AppKit
import CoreText
import SwiftUI

enum AppFontRole {
  case sans
  case mono
  case pixel
}

enum AppTypography {
  private static let sansName = "Geist"
  private static let monoName = "Geist Mono"
  private static let pixelName = "GeistPixel-Square"

  static func swiftUIFont(
    size: CGFloat,
    weight: Font.Weight = .regular,
    design: Font.Design = .default
  ) -> Font {
    let role: AppFontRole = design == .monospaced ? .mono : .sans
    guard AppResources.registerBundledFonts() else {
      return .system(size: size, weight: weight, design: design)
    }

    return Font.custom(fontName(for: role), size: size).weight(weight)
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
      sansName
    case .mono:
      monoName
    case .pixel:
      pixelName
    }
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
