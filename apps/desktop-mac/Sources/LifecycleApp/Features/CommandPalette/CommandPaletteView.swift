import SwiftUI

@MainActor
final class CommandPaletteController: ObservableObject {
  @Published var isPresented = false

  func open() {
    isPresented = true
  }

  func close() {
    isPresented = false
  }

  func toggle() {
    isPresented.toggle()
  }
}

struct CommandPaletteView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var controller: CommandPaletteController

  let commands: [CommandPaletteCommand]

  @FocusState private var isQueryFieldFocused: Bool
  @State private var query = ""
  @State private var activeIndex = 0

  private let maxVisibleResults = 200

  private var filteredCommands: [CommandPaletteCommand] {
    Array(filterAndSortCommandPaletteCommands(query: query, commands: commands).prefix(maxVisibleResults))
  }

  private var filteredCommandIDs: [String] {
    filteredCommands.map(\.id)
  }

  private var grouped: Bool {
    query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private var sections: [CommandPaletteSection] {
    buildCommandPaletteSections(commands: filteredCommands, grouped: grouped)
  }

  private var activeCommandID: String? {
    filteredCommands[safe: activeIndex]?.id
  }

  var body: some View {
    Group {
      if controller.isPresented {
        GeometryReader { geometry in
          ZStack(alignment: .top) {
            Color.black.opacity(0.34)
              .ignoresSafeArea()
              .onTapGesture {
                controller.close()
              }

            paletteCard(maxWidth: min(geometry.size.width - 40, 680))
              .padding(.top, 72)
              .padding(.horizontal, 20)
          }
          .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .transition(.opacity)
        .zIndex(1000)
        .onChange(of: controller.isPresented) { isPresented in
          guard isPresented else {
            reset()
            return
          }

          DispatchQueue.main.async {
            isQueryFieldFocused = true
          }
        }
        .onChange(of: filteredCommandIDs) { _ in
          guard !filteredCommands.isEmpty else {
            activeIndex = 0
            return
          }

          activeIndex = min(activeIndex, filteredCommands.count - 1)
        }
        .onMoveCommand(perform: handleMoveCommand)
        .onExitCommand {
          controller.close()
        }
      }
    }
  }

  private func paletteCard(maxWidth: CGFloat) -> some View {
    VStack(spacing: 0) {
      HStack(spacing: 10) {
        Image(systemName: "magnifyingglass")
          .font(.lc(size: 13, weight: .semibold))
          .foregroundStyle(theme.mutedColor)

        TextField(
          "",
          text: $query,
          prompt: Text("Type a command or search workspaces...")
            .foregroundColor(theme.mutedColor)
        )
        .textFieldStyle(.plain)
        .font(.lc(size: 14, weight: .medium))
        .foregroundStyle(theme.primaryTextColor)
        .focused($isQueryFieldFocused)
        .onSubmit {
          executeActiveCommand()
        }
        .onChange(of: query) { _ in
          activeIndex = 0
        }

        if !query.isEmpty {
          Button {
            query = ""
            activeIndex = 0
          } label: {
            Image(systemName: "xmark.circle.fill")
              .font(.lc(size: 13, weight: .medium))
              .foregroundStyle(theme.mutedColor.opacity(0.85))
          }
          .buttonStyle(.plain)
          .lcPointerCursor()
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 14)

      Rectangle()
        .fill(theme.borderColor)
        .frame(height: 1)

      ScrollViewReader { proxy in
        ScrollView {
          if filteredCommands.isEmpty {
            VStack(spacing: 8) {
              Image(systemName: "magnifyingglass")
                .font(.lc(size: 18, weight: .medium))
                .foregroundStyle(theme.mutedColor.opacity(0.7))
              Text("No matching commands")
                .font(.lc(size: 13, weight: .medium))
                .foregroundStyle(theme.mutedColor)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 36)
          } else {
            LazyVStack(alignment: .leading, spacing: 10) {
              ForEach(sections) { section in
                VStack(alignment: .leading, spacing: 6) {
                  if let label = section.label {
                    Text(label)
                      .font(.lc(size: 11, weight: .semibold))
                      .foregroundStyle(theme.mutedColor)
                      .padding(.horizontal, 14)
                      .padding(.top, 8)
                  }

                  VStack(spacing: 2) {
                    ForEach(section.items) { item in
                      CommandPaletteRow(
                        command: item.command,
                        isActive: item.index == activeIndex,
                        onHover: { isHovering in
                          if isHovering {
                            activeIndex = item.index
                          }
                        },
                        onSelect: {
                          execute(item.command)
                        }
                      )
                      .id(item.command.id)
                    }
                  }
                }
              }
            }
            .padding(.vertical, 10)
          }
        }
        .frame(maxHeight: 480)
        .onChange(of: activeCommandID) { nextID in
          guard let nextID else {
            return
          }

          withAnimation(.easeOut(duration: 0.12)) {
            proxy.scrollTo(nextID, anchor: .center)
          }
        }
      }
    }
    .frame(width: maxWidth)
    .background(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .fill(theme.panelBackground)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .strokeBorder(theme.borderColor)
    )
    .shadow(color: theme.cardShadowColor.opacity(0.8), radius: 32, x: 0, y: 18)
  }

  private func handleMoveCommand(_ direction: MoveCommandDirection) {
    guard !filteredCommands.isEmpty else {
      return
    }

    switch direction {
    case .down:
      activeIndex = (activeIndex + 1) % filteredCommands.count
    case .up:
      activeIndex = activeIndex == 0 ? filteredCommands.count - 1 : activeIndex - 1
    default:
      break
    }
  }

  private func executeActiveCommand() {
    guard let command = filteredCommands[safe: activeIndex] else {
      return
    }

    execute(command)
  }

  private func execute(_ command: CommandPaletteCommand) {
    controller.close()
    reset()
    command.perform()
  }

  private func reset() {
    query = ""
    activeIndex = 0
    isQueryFieldFocused = false
  }
}

private struct CommandPaletteRow: View {
  @Environment(\.appTheme) private var theme

  let command: CommandPaletteCommand
  let isActive: Bool
  let onHover: (Bool) -> Void
  let onSelect: () -> Void

  var body: some View {
    Button(action: onSelect) {
      HStack(spacing: 12) {
        Image(systemName: command.systemImage)
          .font(.lc(size: 12, weight: .semibold))
          .foregroundStyle(isActive ? theme.primaryTextColor : theme.mutedColor)
          .frame(width: 18)

        VStack(alignment: .leading, spacing: 2) {
          Text(command.title)
            .font(.lc(size: 13, weight: .semibold))
            .foregroundStyle(theme.primaryTextColor)

          if let subtitle = command.subtitle, !subtitle.isEmpty {
            Text(subtitle)
              .font(.lc(size: 11, weight: .medium))
              .foregroundStyle(theme.mutedColor)
              .lineLimit(1)
          }
        }

        Spacer(minLength: 12)

        if let shortcut = command.shortcut {
          Text(shortcut)
            .font(.lc(size: 10, weight: .semibold, design: .monospaced))
            .foregroundStyle(theme.mutedColor.opacity(0.9))
        }
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 10)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .fill(isActive ? theme.surfaceRaised : Color.clear)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .strokeBorder(isActive ? theme.borderColor : Color.clear)
      )
      .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
    .buttonStyle(.plain)
    .lcPointerCursor()
    .padding(.horizontal, 8)
    .onHover(perform: onHover)
  }
}

private extension Array {
  subscript(safe index: Int) -> Element? {
    guard indices.contains(index) else {
      return nil
    }

    return self[index]
  }
}
