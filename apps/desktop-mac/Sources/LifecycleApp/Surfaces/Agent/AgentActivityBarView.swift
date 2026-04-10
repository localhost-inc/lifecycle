import SwiftUI

private let agentActivityBarHeight: CGFloat = 30

struct AgentActivityBarView: View {
  @Environment(\.appTheme) private var theme

  let visible: Bool
  let agentStatus: String?
  let latestStatus: String?
  let canCancel: Bool
  let onCancel: (() async -> Void)?

  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      HStack(spacing: 6) {
        Circle()
          .fill(theme.primaryTextColor.opacity(0.72))
          .frame(width: 6, height: 6)
          .scaleEffect(visible ? pulseScale(for: context.date) : 1)

        Text(activityLabel)
          .font(.system(size: 12, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.primaryTextColor.opacity(0.92))

        if let latestStatus, !latestStatus.isEmpty {
          Text(verbatim: "· \(latestStatus)")
            .lineLimit(1)
            .truncationMode(.tail)
            .font(.system(size: 12, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.mutedColor.opacity(0.72))
        }

        Spacer(minLength: 0)

        if canCancel, let onCancel, visible {
          Button {
            Task {
              await onCancel()
            }
          } label: {
            Text("cancel")
              .font(.system(size: 12, weight: .medium, design: .monospaced))
              .foregroundStyle(theme.mutedColor.opacity(0.78))
          }
          .buttonStyle(.plain)
          .lcPointerCursor()
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 6)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .frame(height: visible ? agentActivityBarHeight : 0, alignment: .top)
    .opacity(visible ? 1 : 0)
    .clipped()
    .animation(.easeOut(duration: 0.15), value: visible)
  }

  private var activityLabel: String {
    switch agentStatus?.lowercased() {
    case "starting":
      "Starting"
    case "waiting_approval":
      "Waiting"
    case "running":
      "Working"
    default:
      "Working"
    }
  }

  private func pulseScale(for date: Date) -> CGFloat {
    let phase = sin(date.timeIntervalSinceReferenceDate * 4)
    return 0.85 + ((phase + 1) * 0.08)
  }
}
