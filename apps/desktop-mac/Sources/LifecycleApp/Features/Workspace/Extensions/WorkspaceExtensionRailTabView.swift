import SwiftUI

struct WorkspaceExtensionRailTabView: View {
  @Environment(\.appTheme) private var theme

  let tab: WorkspaceExtensionTabPresentation
  let isSelected: Bool
  let action: () -> Void

  private let horizontalPadding: CGFloat = 12
  private let labelSpacing: CGFloat = 8

  var body: some View {
    let tabMaximumWidth = theme.sizing.workspaceTabMaximumWidth
    let railHeight = theme.sizing.workspaceTabRailHeight
    let labelMaxWidth = max(0, tabMaximumWidth - (horizontalPadding * 2) - 14 - labelSpacing)

    ZStack(alignment: .leading) {
      Button(action: action) {
        HStack(spacing: isSelected ? labelSpacing : 0) {
          Image(systemName: tab.icon)
            .font(.lc(size: 12, weight: .semibold))
            .frame(width: 14, height: 14)
            .foregroundStyle(isSelected ? theme.primaryTextColor : theme.mutedColor)

          if isSelected {
            Text(tab.title)
              .font(.lc(size: 12, weight: .semibold))
              .foregroundStyle(theme.primaryTextColor)
              .lineLimit(1)
              .truncationMode(.tail)
              .frame(maxWidth: labelMaxWidth, alignment: .leading)
          }
        }
        .padding(.horizontal, horizontalPadding)
        .frame(height: railHeight, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .lcPointerCursor()
      .frame(maxWidth: tabMaximumWidth, alignment: .leading)
    }
    .frame(maxWidth: tabMaximumWidth, alignment: .leading)
    .frame(height: railHeight, alignment: .leading)
    .background(
      Rectangle()
        .fill(isSelected ? theme.surfaceBackground : Color.clear)
    )
    .overlay(alignment: .trailing) {
      Rectangle()
        .fill(theme.borderColor)
        .frame(width: 1)
    }
    .help(tabHelpText)
    .animation(.spring(response: 0.26, dampingFraction: 0.86), value: isSelected)
  }

  private var tabHelpText: String {
    if let subtitle = tab.subtitle, !subtitle.isEmpty {
      return "\(tab.title)\n\(subtitle)"
    }
    return tab.title
  }
}
