import SwiftUI

struct WorkspaceExtensionRailTabView: View {
  @Environment(\.appTheme) private var theme

  let tab: WorkspaceExtensionTabPresentation
  let isSelected: Bool
  let action: () -> Void

  private let collapsedWidth: CGFloat = 40
  private let expandedWidth: CGFloat = 126
  private let horizontalPadding: CGFloat = 12
  private let iconWidth: CGFloat = 14
  private let labelSpacing: CGFloat = 8

  var body: some View {
    let labelWidth = max(
      0,
      expandedWidth - (horizontalPadding * 2) - iconWidth - labelSpacing
    )

    ZStack(alignment: .leading) {
      Button(action: action) {
        HStack(spacing: isSelected ? labelSpacing : 0) {
          Image(systemName: tab.icon)
            .font(.system(size: 12, weight: .semibold))
            .frame(width: iconWidth, height: iconWidth)
            .foregroundStyle(isSelected ? theme.primaryTextColor : theme.mutedColor)

          Text(tab.title)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(theme.primaryTextColor)
            .lineLimit(1)
            .frame(width: isSelected ? labelWidth : 0, alignment: .leading)
            .opacity(isSelected ? 1 : 0)
            .clipped()
        }
        .frame(
          width: isSelected ? expandedWidth - (horizontalPadding * 2) : collapsedWidth,
          alignment: isSelected ? .leading : .center
        )
        .padding(.horizontal, isSelected ? horizontalPadding : 0)
        .padding(.vertical, 6)
        .frame(width: isSelected ? expandedWidth : collapsedWidth, alignment: .leading)
        .frame(maxHeight: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .lcPointerCursor()
      .frame(width: isSelected ? expandedWidth : collapsedWidth, alignment: .leading)
      .frame(maxHeight: .infinity, alignment: .leading)
    }
    .frame(width: isSelected ? expandedWidth : collapsedWidth, alignment: .leading)
    .frame(maxHeight: .infinity, alignment: .leading)
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
