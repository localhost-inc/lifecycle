import SwiftUI

struct WorkspaceRailTabView<TrailingAccessory: View>: View {
  @Environment(\.appTheme) private var theme

  let title: String
  let subtitle: String?
  let isSelected: Bool
  let trailingContentInset: CGFloat
  let action: () -> Void
  let trailingAccessory: TrailingAccessory

  init(
    title: String,
    subtitle: String?,
    isSelected: Bool,
    trailingContentInset: CGFloat = 14,
    action: @escaping () -> Void,
    @ViewBuilder trailingAccessory: () -> TrailingAccessory
  ) {
    self.title = title
    self.subtitle = subtitle
    self.isSelected = isSelected
    self.trailingContentInset = trailingContentInset
    self.action = action
    self.trailingAccessory = trailingAccessory()
  }

  var body: some View {
    ZStack(alignment: .trailing) {
      Button(action: action) {
        VStack(alignment: .leading, spacing: 2) {
          Text(title)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(isSelected ? theme.primaryTextColor : theme.mutedColor)

          if let subtitle {
            Text(subtitle)
              .font(.system(size: 10, weight: .medium, design: .monospaced))
              .foregroundStyle(isSelected ? theme.mutedColor : theme.mutedColor.opacity(0.78))
          }
        }
        .frame(minWidth: 112, alignment: .leading)
        .padding(.leading, 18)
        .padding(.trailing, trailingContentInset)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .frame(maxWidth: .infinity, alignment: .leading)

      trailingAccessory
    }
    .frame(minWidth: 126, alignment: .leading)
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
    title: String,
    subtitle: String?,
    isSelected: Bool,
    action: @escaping () -> Void
  ) {
    self.init(
      title: title,
      subtitle: subtitle,
      isSelected: isSelected,
      action: action
    ) {
      EmptyView()
    }
  }
}
