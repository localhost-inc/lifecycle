import SwiftUI

struct WorkspaceRailTabView<TrailingAccessory: View>: View {
  @Environment(\.appTheme) private var theme

  let label: String
  let icon: String
  let isBusy: Bool
  let isSelected: Bool
  let trailingContentInset: CGFloat
  let action: () -> Void
  let trailingAccessory: TrailingAccessory

  init(
    label: String,
    icon: String,
    isBusy: Bool = false,
    isSelected: Bool,
    trailingContentInset: CGFloat = 14,
    action: @escaping () -> Void,
    @ViewBuilder trailingAccessory: () -> TrailingAccessory
  ) {
    self.label = label
    self.icon = icon
    self.isBusy = isBusy
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
          AppIconView(
            name: icon,
            size: 14,
            color: isSelected ? theme.primaryTextColor : theme.mutedColor
          )
          .overlay(alignment: .topTrailing) {
            if isBusy {
              Circle()
                .fill(theme.successColor)
                .frame(width: 5, height: 5)
                .offset(x: 3, y: -3)
            }
          }

          TypewriterText(text: label, characterDelay: 0.025, showsCursor: false)
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
    isBusy: Bool = false,
    isSelected: Bool,
    action: @escaping () -> Void
  ) {
    self.init(
      label: label,
      icon: icon,
      isBusy: isBusy,
      isSelected: isSelected,
      action: action
    ) {
      EmptyView()
    }
  }
}
