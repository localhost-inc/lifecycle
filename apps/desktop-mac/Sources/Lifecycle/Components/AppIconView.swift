import Foundation
import SwiftUI

enum AppIconName {
  static let assetPrefix = "asset:"

  static func profileIconName(for kind: String) -> String {
    switch kind {
    case BridgeTerminalKind.claude.rawValue:
      return "asset:provider-claude"
    case BridgeTerminalKind.codex.rawValue:
      return "asset:provider-openai"
    case BridgeTerminalKind.opencode.rawValue:
      return "asset:provider-opencode"
    case BridgeTerminalKind.custom.rawValue:
      return "slider.horizontal.3"
    default:
      return "terminal"
    }
  }

  static func assetName(from iconName: String) -> String? {
    guard iconName.hasPrefix(assetPrefix) else {
      return nil
    }

    let assetName = iconName.dropFirst(assetPrefix.count)
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return assetName.isEmpty ? nil : String(assetName)
  }
}

struct AppIconView: View {
  let name: String
  let size: CGFloat
  let color: Color
  var weight: Font.Weight = .semibold

  var body: some View {
    let assetName = AppIconName.assetName(from: name)

    if let assetName,
       let image = AppResources.profileIconImage(named: assetName)
    {
      Image(nsImage: image)
        .resizable()
        .scaledToFit()
        .foregroundStyle(color)
        .frame(width: size, height: size)
    } else {
      Image(systemName: assetName == nil ? name : "terminal")
        .font(.lc(size: size, weight: weight))
        .foregroundStyle(color)
        .frame(width: size, height: size)
    }
  }
}
