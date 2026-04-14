import SwiftUI

enum TerminalCreationMenuButtonStyle {
  case iconOnly
  case prominent
}

struct TerminalCreationMenuButton: View {
  @Environment(\.appTheme) private var theme

  let style: TerminalCreationMenuButtonStyle
  let action: (BridgeTerminalKind) -> Void

  var body: some View {
    Menu {
      ForEach(BridgeTerminalKind.creatableCases) { kind in
        Button {
          action(kind)
        } label: {
          Label(kind.displayTitle, systemImage: kind.systemImage)
        }
      }
    } label: {
      switch style {
      case .iconOnly:
        Image(systemName: "plus")
          .font(.lc(size: 12, weight: .semibold))
          .foregroundStyle(theme.mutedColor)
          .frame(width: 28, height: 28)
          .contentShape(Rectangle())
      case .prominent:
        Label("Open Tab", systemImage: "plus")
          .font(.lc(size: 12, weight: .medium))
          .foregroundStyle(theme.primaryTextColor)
          .padding(.horizontal, 14)
          .padding(.vertical, 6)
          .background(theme.surfaceRaised.opacity(0.6), in: RoundedRectangle(cornerRadius: 6))
          .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(theme.borderColor.opacity(0.4)))
      }
    }
    .menuStyle(.borderlessButton)
    .menuIndicator(.hidden)
    .lcPointerCursor()
  }
}
