import SwiftUI

enum AgentComposerLayout {
  case docked
  case centered
}

struct AgentComposerView: View {
  @Environment(\.appTheme) private var theme
  @FocusState private var isFocused: Bool

  @Binding var draftPrompt: String

  let layout: AgentComposerLayout
  let isSending: Bool
  let canEdit: Bool
  let planMode: Bool

  var body: some View {
    let isCentered = layout == .centered

    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top, spacing: 0) {
        Text("▶")
          .font(.system(size: 13, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.accentColor)
          .padding(.top, 4)
          .padding(.trailing, 6)

        ZStack(alignment: .topLeading) {
          if draftPrompt.isEmpty {
            Text(verbatim: placeholderText)
              .font(.system(size: 13, weight: .medium, design: .monospaced))
              .foregroundStyle(theme.mutedColor.opacity(0.68))
              .padding(.top, 1)
              .allowsHitTesting(false)
          }

          TextEditor(text: $draftPrompt)
            .font(.system(size: 13, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.primaryTextColor)
            .scrollContentBackground(.hidden)
            .focused($isFocused)
            .disabled(!canEdit || isSending)
            .frame(minHeight: isCentered ? 54 : 30, maxHeight: isCentered ? 120 : 96)
            .background(Color.clear)
          }
      }
      .padding(.horizontal, isCentered ? 20 : 16)
      .padding(.top, isCentered ? 16 : 12)
      .padding(.bottom, isCentered ? 12 : 8)
    }
    .background(theme.surfaceRaised.opacity(0.5))
    .contentShape(Rectangle())
    .onTapGesture {
      isFocused = true
    }
  }

  private var placeholderText: String {
    if planMode {
      return "plan mode - shift+tab to exit"
    }

    return "Ask the agent to inspect, edit, or explain this workspace."
  }
}
