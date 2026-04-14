import SwiftUI

struct LCTextInput: View {
  @Environment(\.appTheme) private var theme
  @FocusState private var isFocused: Bool

  @Binding var text: String
  var placeholder: String = ""
  var width: CGFloat? = nil
  var onSubmit: (() -> Void)? = nil

  var body: some View {
    TextField("", text: $text, prompt: promptText)
      .textFieldStyle(.plain)
      .font(.lc(size: 12, weight: .medium))
      .foregroundStyle(theme.primaryTextColor)
      .padding(.horizontal, 10)
      .padding(.vertical, 7)
      .background(
        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .fill(theme.surfaceBackground)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .strokeBorder(isFocused ? theme.accentColor : theme.borderColor)
      )
      .focused($isFocused)
      .frame(width: width)
      .onSubmit {
        onSubmit?()
      }
  }

  private var promptText: Text? {
    guard !placeholder.isEmpty else { return nil }
    return Text(placeholder)
      .foregroundColor(theme.mutedColor)
  }
}
