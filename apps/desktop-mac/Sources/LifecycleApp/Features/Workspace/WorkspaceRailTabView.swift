import SwiftUI

struct WorkspaceRailTabView<TrailingAccessory: View>: View {
  @Environment(\.appTheme) private var theme

  let label: String
  let icon: String
  let isSelected: Bool
  let trailingContentInset: CGFloat
  let action: () -> Void
  let trailingAccessory: TrailingAccessory

  init(
    label: String,
    icon: String,
    isSelected: Bool,
    trailingContentInset: CGFloat = 14,
    action: @escaping () -> Void,
    @ViewBuilder trailingAccessory: () -> TrailingAccessory
  ) {
    self.label = label
    self.icon = icon
    self.isSelected = isSelected
    self.trailingContentInset = trailingContentInset
    self.action = action
    self.trailingAccessory = trailingAccessory()
  }

  var body: some View {
    let tabMaximumWidth = theme.sizing.workspaceTabMaximumWidth
    let railHeight = theme.sizing.workspaceTabRailHeight
    let labelMaxWidth = max(
      0,
      tabMaximumWidth - theme.sizing.workspaceTabLeadingInset - trailingContentInset - theme.spacing.xxxl
    )

    ZStack(alignment: .trailing) {
      Button(action: action) {
        HStack(spacing: 8) {
          Image(systemName: icon)
            .font(.lc(size: 11, weight: .semibold))
            .foregroundStyle(isSelected ? theme.primaryTextColor : theme.mutedColor)

          Text(label)
            .lineLimit(1)
            .truncationMode(.tail)
            .font(.lc(size: 12, weight: .semibold))
            .foregroundStyle(isSelected ? theme.primaryTextColor : theme.mutedColor)
            .frame(maxWidth: labelMaxWidth, alignment: .leading)
        }
        .padding(.leading, theme.sizing.workspaceTabLeadingInset)
        .padding(.trailing, trailingContentInset)
        .frame(height: railHeight, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .lcPointerCursor()
      .frame(maxWidth: tabMaximumWidth, alignment: .leading)

      trailingAccessory
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
  }
}

extension WorkspaceRailTabView where TrailingAccessory == EmptyView {
  init(
    label: String,
    icon: String,
    isSelected: Bool,
    action: @escaping () -> Void
  ) {
    self.init(
      label: label,
      icon: icon,
      isSelected: isSelected,
      action: action
    ) {
      EmptyView()
    }
  }
}
