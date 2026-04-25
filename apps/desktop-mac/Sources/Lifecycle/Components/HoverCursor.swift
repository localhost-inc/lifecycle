import AppKit
import SwiftUI

enum LCHoverCursorAction: Equatable {
  case push
  case pop
  case none
}

struct LCHoverCursorTransition: Equatable {
  let isHovering: Bool
  let action: LCHoverCursorAction
}

func hoverCursorTransition(
  isHovering: Bool,
  nextHovering: Bool,
  isEnabled: Bool
) -> LCHoverCursorTransition {
  guard isEnabled else {
    return hoverCursorResetTransition(isHovering: isHovering)
  }

  if nextHovering {
    return LCHoverCursorTransition(
      isHovering: true,
      action: isHovering ? .none : .push
    )
  }

  return hoverCursorResetTransition(isHovering: isHovering)
}

func hoverCursorResetTransition(isHovering: Bool) -> LCHoverCursorTransition {
  LCHoverCursorTransition(
    isHovering: false,
    action: isHovering ? .pop : .none
  )
}

private struct LCHoverCursorModifier: ViewModifier {
  @Environment(\.isEnabled) private var isEnabled

  let cursor: NSCursor

  @State private var isHovering = false

  func body(content: Content) -> some View {
    content
      .onHover { hovering in
        apply(
          hoverCursorTransition(
            isHovering: isHovering,
            nextHovering: hovering,
            isEnabled: isEnabled
          )
        )
      }
      .onChange(of: isEnabled) { nextEnabled in
        guard !nextEnabled else {
          return
        }

        apply(hoverCursorResetTransition(isHovering: isHovering))
      }
      .onDisappear {
        apply(hoverCursorResetTransition(isHovering: isHovering))
      }
  }

  private func apply(_ transition: LCHoverCursorTransition) {
    isHovering = transition.isHovering

    switch transition.action {
    case .push:
      cursor.push()
    case .pop:
      NSCursor.pop()
    case .none:
      break
    }
  }
}

extension View {
  func lcCursor(_ cursor: NSCursor) -> some View {
    modifier(LCHoverCursorModifier(cursor: cursor))
  }

  func lcPointerCursor() -> some View {
    lcCursor(.pointingHand)
  }

  func lcOpenHandCursor() -> some View {
    lcCursor(.openHand)
  }

  func lcResizeCursor(horizontal: Bool) -> some View {
    lcCursor(horizontal ? .resizeLeftRight : .resizeUpDown)
  }
}
