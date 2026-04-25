import SwiftUI

struct SessionsExtensionView: View {
  @Environment(\.appTheme) private var theme
  let context: WorkspaceExtensionContext

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        if context.terminals.isEmpty {
          emptyState
        } else {
          ForEach(sessionsExtensionHourGroups(terminals: context.terminals)) { group in
            sessionSection(group)
          }
        }
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 12)
    }
    .scrollIndicators(.automatic)
  }

  @ViewBuilder
  private var emptyState: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("No terminal sessions")
        .font(.lc(size: 12, weight: .semibold))
        .foregroundStyle(theme.primaryTextColor)
      Text("Sessions will appear here after the bridge reports workspace terminals.")
        .font(.lc(size: 11, weight: .medium))
        .foregroundStyle(theme.mutedColor)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(.vertical, 6)
  }

  private func sessionSection(_ group: SessionsExtensionHourGroup) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 8) {
        Text(group.title)
          .font(.lc(size: 10, weight: .bold, design: .monospaced))
          .foregroundStyle(theme.primaryTextColor.opacity(0.76))
          .textCase(.uppercase)

        Rectangle()
          .fill(theme.borderColor.opacity(0.72))
          .frame(height: 1)
      }

      VStack(alignment: .leading, spacing: 0) {
        ForEach(Array(group.terminals.enumerated()), id: \.element.id) { index, terminal in
          terminalSessionRow(terminal)

          if index < group.terminals.count - 1 {
            Rectangle()
              .fill(theme.borderColor.opacity(0.46))
              .frame(height: 1)
              .padding(.leading, 28)
          }
        }
      }
    }
  }

  private func terminalSessionRow(_ terminal: BridgeTerminalRecord) -> some View {
    HStack(alignment: .center, spacing: 9) {
      sessionStatusIcon(terminal)

      Text(terminal.title)
        .font(.lc(size: 12, weight: .semibold))
        .foregroundStyle(theme.primaryTextColor)
        .lineLimit(1)
        .frame(minWidth: 0, maxWidth: .infinity, alignment: .leading)

      Text(terminal.kind)
        .font(.lc(size: 10, weight: .semibold, design: .monospaced))
        .foregroundStyle(theme.primaryTextColor.opacity(0.58))
        .lineLimit(1)

      Text(sessionsExtensionTimeLabel(for: terminal))
        .font(.lc(size: 10, weight: .semibold, design: .monospaced))
        .foregroundStyle(theme.primaryTextColor.opacity(0.54))
        .lineLimit(1)
        .frame(width: 52, alignment: .trailing)
    }
    .padding(.vertical, 7)
    .contentShape(Rectangle())
  }

  private func sessionStatusIcon(_ terminal: BridgeTerminalRecord) -> some View {
    ZStack {
      Circle()
        .fill(terminal.busy ? theme.successColor.opacity(0.14) : theme.primaryTextColor.opacity(0.06))
        .frame(width: 18, height: 18)

      Image(systemName: terminal.busy ? "bolt.fill" : "circle.fill")
        .font(.lc(size: terminal.busy ? 9 : 6, weight: .bold))
        .foregroundStyle(terminal.busy ? theme.successColor : theme.mutedColor.opacity(0.62))
    }
    .frame(width: 18, height: 18)
  }
}

struct SessionsExtensionHourGroup: Identifiable, Equatable {
  let id: String
  let title: String
  let terminals: [BridgeTerminalRecord]
}

func sessionsExtensionHourGroups(
  terminals: [BridgeTerminalRecord],
  calendar: Calendar = .current
) -> [SessionsExtensionHourGroup] {
  let entries = terminals.map { terminal in
    (terminal: terminal, date: sessionsExtensionDate(for: terminal))
  }

  let grouped = Dictionary(grouping: entries) { entry in
    guard let date = entry.date else {
      return "unknown"
    }

    return String(Int(calendar.dateInterval(of: .hour, for: date)?.start.timeIntervalSince1970 ?? date.timeIntervalSince1970))
  }

  return grouped.map { key, entries in
    let sortedEntries = entries.sorted { left, right in
      switch (left.date, right.date) {
      case let (leftDate?, rightDate?):
        return leftDate > rightDate
      case (_?, nil):
        return true
      case (nil, _?):
        return false
      case (nil, nil):
        return left.terminal.title.localizedStandardCompare(right.terminal.title) == .orderedAscending
      }
    }

    let title =
      if let date = sortedEntries.compactMap(\.date).first {
        sessionsExtensionHourTitle(for: date, calendar: calendar)
      } else {
        "No Recent Activity"
      }

    return SessionsExtensionHourGroup(
      id: key,
      title: title,
      terminals: sortedEntries.map(\.terminal)
    )
  }
  .sorted { left, right in
    if left.id == "unknown" { return false }
    if right.id == "unknown" { return true }
    return (Int(left.id) ?? 0) > (Int(right.id) ?? 0)
  }
}

func sessionsExtensionActivityLabel(for terminal: BridgeTerminalRecord) -> String {
  guard let activity = terminal.activity else {
    return terminal.busy ? "Active" : "Idle"
  }

  if activity.state == "tool_active", let toolName = activity.toolName {
    return toolName
  }

  if activity.state == "waiting", let waitingKind = activity.waitingKind {
    return waitingKind.capitalized
  }

  return activity.state
    .split(separator: "_")
    .map { $0.capitalized }
    .joined(separator: " ")
}

func sessionsExtensionTimeLabel(for terminal: BridgeTerminalRecord) -> String {
  guard let date = sessionsExtensionDate(for: terminal) else {
    return "--"
  }

  let formatter = DateFormatter()
  formatter.dateFormat = "h:mm"
  return formatter.string(from: date)
}

private func sessionsExtensionHourTitle(for date: Date, calendar: Calendar) -> String {
  let formatter = DateFormatter()
  formatter.dateFormat = calendar.isDateInToday(date) ? "ha" : "MMM d, ha"
  return formatter.string(from: date)
}

private func sessionsExtensionDate(for terminal: BridgeTerminalRecord) -> Date? {
  guard let isoString = terminal.activity?.updatedAt ?? terminal.activity?.lastEventAt else {
    return nil
  }

  return sessionsExtensionParseDate(isoString)
}

private func sessionsExtensionParseDate(_ isoString: String) -> Date? {
  let fractionalFormatter = ISO8601DateFormatter()
  fractionalFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

  return fractionalFormatter.date(from: isoString) ?? ISO8601DateFormatter().date(from: isoString)
}
