import SwiftUI

struct TypewriterRenderState: Equatable {
  let visibleText: String
  let showsCursor: Bool
  let cursor: String

  var displayText: String {
    visibleText + (showsCursor ? cursor : "")
  }
}

func typewriterVisibleCharacterCount(
  totalCharacters: Int,
  startDate: Date,
  currentDate: Date,
  characterDelay: TimeInterval,
  startDelay: TimeInterval
) -> Int {
  guard totalCharacters > 0 else {
    return 0
  }

  let elapsed = currentDate.timeIntervalSince(startDate) - max(0, startDelay)
  guard elapsed >= 0 else {
    return 0
  }

  guard characterDelay > 0 else {
    return totalCharacters
  }

  return min(totalCharacters, Int(floor(elapsed / characterDelay)) + 1)
}

func typewriterDisplayedText(_ text: String, visibleCharacterCount: Int) -> String {
  guard visibleCharacterCount > 0 else {
    return ""
  }

  return String(Array(text).prefix(visibleCharacterCount))
}

func typewriterRenderState(
  text: String,
  startDate: Date,
  currentDate: Date,
  characterDelay: TimeInterval,
  startDelay: TimeInterval,
  cursor: String,
  showsCursor: Bool,
  revealsImmediately: Bool
) -> TypewriterRenderState {
  if revealsImmediately {
    return TypewriterRenderState(
      visibleText: text,
      showsCursor: false,
      cursor: cursor
    )
  }

  let characters = Array(text)
  let visibleCharacterCount = typewriterVisibleCharacterCount(
    totalCharacters: characters.count,
    startDate: startDate,
    currentDate: currentDate,
    characterDelay: characterDelay,
    startDelay: startDelay
  )
  let visibleText = typewriterDisplayedText(text, visibleCharacterCount: visibleCharacterCount)

  return TypewriterRenderState(
    visibleText: visibleText,
    showsCursor: showsCursor && visibleCharacterCount < characters.count,
    cursor: cursor
  )
}

struct TypewriterText: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  let text: String
  var characterDelay: TimeInterval = 0.045
  var startDelay: TimeInterval = 0
  var cursor: String = "▌"
  var showsCursor: Bool = true

  @State private var startDate = Date()

  var body: some View {
    TimelineView(.periodic(from: startDate, by: max(characterDelay, 1.0 / 30.0))) { context in
      let renderState = typewriterRenderState(
        text: text,
        startDate: startDate,
        currentDate: context.date,
        characterDelay: characterDelay,
        startDelay: startDelay,
        cursor: cursor,
        showsCursor: showsCursor,
        revealsImmediately: reduceMotion
      )

      Text(renderState.displayText)
        .accessibilityLabel(text)
    }
    .onAppear {
      startDate = Date()
    }
    .onChange(of: text) { _ in
      startDate = Date()
    }
  }
}
