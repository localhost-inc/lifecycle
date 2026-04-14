import SwiftUI

struct AgentTranscriptMessageView: View {
  @Environment(\.appTheme) private var theme

  let message: AgentRenderableMessage
  let isStreaming: Bool
  let resolvingApprovalIDs: Set<String>
  let onResolveApproval: AgentApprovalResolver

  var body: some View {
    switch message.style {
    case .user:
      userRow
    case .assistant, .passive:
      assistantRow
    }
  }

  private var userRow: some View {
    HStack(alignment: .top, spacing: 8) {
      Text("▶")
        .font(.lc(size: 13, weight: .medium, design: .monospaced))
        .foregroundStyle(theme.accentColor)
        .padding(.top, 3)

      VStack(alignment: .leading, spacing: 6) {
        ForEach(message.segments) { segment in
          AgentTranscriptSegmentView(
            message: message,
            segment: segment,
            isStreaming: false,
            resolvingApprovalIDs: resolvingApprovalIDs,
            onResolveApproval: onResolveApproval
          )
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
    .background(theme.surfaceRaised.opacity(0.5))
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var assistantRow: some View {
    VStack(
      alignment: .leading,
      spacing: message.isToolOnly ? 4 : 10
    ) {
      ForEach(Array(message.segments.enumerated()), id: \.element.id) { index, segment in
        AgentTranscriptSegmentView(
          message: message,
          segment: segment,
          isStreaming: isStreaming && index == message.segments.count - 1,
          resolvingApprovalIDs: resolvingApprovalIDs,
          onResolveApproval: onResolveApproval
        )
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, message.isToolOnly ? 6 : 12)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
