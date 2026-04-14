import SwiftUI

private let agentTranscriptBottomAnchorID = "agent-transcript-bottom"

struct AgentTranscriptStatusRow: Identifiable, Equatable {
  let id: String
  let text: String
  let tone: Tone

  enum Tone: Equatable {
    case muted
    case error
  }
}

struct AgentTranscriptView: View {
  @Environment(\.appTheme) private var theme

  let messages: [AgentRenderableMessage]
  let statusRows: [AgentTranscriptStatusRow]
  let isRunning: Bool
  let activityBarVisible: Bool
  let activityBarAgentStatus: String?
  let activityBarLatestStatus: String?
  let activityBarCanCancel: Bool
  let activityBarOnCancel: (() async -> Void)?
  let resolvingApprovalIDs: Set<String>
  let onResolveApproval: AgentApprovalResolver

  var body: some View {
    GeometryReader { geometry in
      ScrollViewReader { proxy in
        ScrollView {
          VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 0)

            LazyVStack(alignment: .leading, spacing: 0) {
              ForEach(statusRows) { row in
                HStack(alignment: .top, spacing: 0) {
                  Text(statusPrefix(for: row.tone))
                    .font(.lc(size: 13, weight: .medium, design: .monospaced))
                    .foregroundStyle(statusPrefixColor(for: row.tone))

                  Text(verbatim: " \(row.text)")
                    .font(.lc(size: 13, weight: .medium, design: .monospaced))
                    .foregroundStyle(statusTextColor(for: row.tone))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
              }

              ForEach(Array(messages.enumerated()), id: \.element.id) { index, message in
                AgentTranscriptMessageView(
                  message: message,
                  isStreaming: isRunning && index == messages.count - 1 && message.style == .assistant,
                  resolvingApprovalIDs: resolvingApprovalIDs,
                  onResolveApproval: onResolveApproval
                )
              }

              AgentActivityBarView(
                visible: activityBarVisible,
                agentStatus: activityBarAgentStatus,
                latestStatus: activityBarLatestStatus,
                canCancel: activityBarCanCancel,
                onCancel: activityBarOnCancel
              )

              Color.clear
                .frame(height: 1)
                .id(agentTranscriptBottomAnchorID)
            }
            .padding(.top, 16)
            .padding(.bottom, 8)
          }
          .frame(
            maxWidth: .infinity,
            minHeight: geometry.size.height,
            alignment: .bottomLeading
          )
        }
        .onAppear {
          proxy.scrollTo(agentTranscriptBottomAnchorID, anchor: .bottom)
        }
        .onChange(of: messages.last?.id) { _ in
          withAnimation(.easeOut(duration: 0.18)) {
            proxy.scrollTo(agentTranscriptBottomAnchorID, anchor: .bottom)
          }
        }
        .onChange(of: activityBarVisible) { _ in
          withAnimation(.easeOut(duration: 0.18)) {
            proxy.scrollTo(agentTranscriptBottomAnchorID, anchor: .bottom)
          }
        }
      }
    }
  }

  private func statusPrefix(for tone: AgentTranscriptStatusRow.Tone) -> String {
    switch tone {
    case .muted:
      "[~]"
    case .error:
      "[!]"
    }
  }

  private func statusPrefixColor(for tone: AgentTranscriptStatusRow.Tone) -> Color {
    switch tone {
    case .muted:
      theme.accentColor
    case .error:
      theme.errorColor
    }
  }

  private func statusTextColor(for tone: AgentTranscriptStatusRow.Tone) -> Color {
    switch tone {
    case .muted:
      theme.mutedColor
    case .error:
      theme.errorColor
    }
  }
}
