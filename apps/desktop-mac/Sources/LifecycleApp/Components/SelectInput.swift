import SwiftUI

struct LCSelectInput<Value: Hashable>: View {
  @Environment(\.appTheme) private var theme

  @Binding var selection: Value
  let options: [LCSelectOption<Value>]
  var width: CGFloat? = 160

  var body: some View {
    Picker("", selection: $selection) {
      ForEach(options) { option in
        Text(option.label).tag(option.value)
      }
    }
    .pickerStyle(.menu)
    .tint(theme.primaryTextColor)
    .frame(width: width)
    .lcPointerCursor()
  }
}

struct LCSelectOption<Value: Hashable>: Identifiable {
  let label: String
  let value: Value

  var id: Value { value }
}
