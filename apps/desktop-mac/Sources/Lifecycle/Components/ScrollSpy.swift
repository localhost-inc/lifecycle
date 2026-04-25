import SwiftUI

private let lcScrollSpyDefaultActivationOffset: CGFloat = 96

private struct LCScrollSpySectionOffsetPreferenceKey<Selection: Hashable>: PreferenceKey {
  static var defaultValue: [Selection: CGFloat] { [:] }

  static func reduce(value: inout [Selection: CGFloat], nextValue: () -> [Selection: CGFloat]) {
    value.merge(nextValue(), uniquingKeysWith: { _, next in next })
  }
}

private struct LCScrollSpyContentBottomPreferenceKey: PreferenceKey {
  static let defaultValue: CGFloat = 0

  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
    value = nextValue()
  }
}

private struct LCScrollSpyViewportHeightPreferenceKey: PreferenceKey {
  static let defaultValue: CGFloat = 0

  static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
    value = nextValue()
  }
}

func lcScrollSpyActiveSelection<Selection: Hashable>(
  sections: [Selection],
  sectionOffsets: [Selection: CGFloat],
  viewportHeight: CGFloat,
  contentBottomOffset: CGFloat? = nil,
  activationOffset: CGFloat = lcScrollSpyDefaultActivationOffset,
  fallbackSelection: Selection
) -> Selection {
  guard !sectionOffsets.isEmpty else {
    return fallbackSelection
  }

  if
    let firstSection = sections.first,
    let lastSection = sections.last,
    let contentBottomOffset,
    viewportHeight > 0,
    contentBottomOffset <= viewportHeight + 1,
    (sectionOffsets[firstSection] ?? 0) < -1
  {
    return lastSection
  }

  let focusY = min(activationOffset, max(viewportHeight * 0.25, 0))
  var activeSelection = fallbackSelection

  for section in sections {
    guard let offset = sectionOffsets[section] else {
      continue
    }

    if offset <= focusY {
      activeSelection = section
      continue
    }

    break
  }

  return activeSelection
}

struct LCScrollSpy<Selection: Hashable, Content: View>: View {
  @Binding var activeSelection: Selection
  let sections: [Selection]
  let activationOffset: CGFloat
  let showsIndicators: Bool
  @ViewBuilder let content: (Namespace.ID) -> Content

  @Namespace private var coordinateSpace
  @State private var sectionOffsets: [Selection: CGFloat] = [:]
  @State private var contentBottomOffset: CGFloat = 0
  @State private var viewportHeight: CGFloat = 0

  init(
    activeSelection: Binding<Selection>,
    sections: [Selection],
    activationOffset: CGFloat = lcScrollSpyDefaultActivationOffset,
    showsIndicators: Bool = false,
    @ViewBuilder content: @escaping (Namespace.ID) -> Content
  ) {
    _activeSelection = activeSelection
    self.sections = sections
    self.activationOffset = activationOffset
    self.showsIndicators = showsIndicators
    self.content = content
  }

  var body: some View {
    ScrollView(showsIndicators: showsIndicators) {
      content(coordinateSpace)
    }
    .coordinateSpace(name: coordinateSpace)
    .background {
      GeometryReader { geometry in
        Color.clear.preference(
          key: LCScrollSpyViewportHeightPreferenceKey.self,
          value: geometry.size.height
        )
      }
    }
    .onPreferenceChange(LCScrollSpySectionOffsetPreferenceKey<Selection>.self) { nextOffsets in
      sectionOffsets = nextOffsets
      syncActiveSelection()
    }
    .onPreferenceChange(LCScrollSpyContentBottomPreferenceKey.self) { nextContentBottomOffset in
      contentBottomOffset = nextContentBottomOffset
      syncActiveSelection()
    }
    .onPreferenceChange(LCScrollSpyViewportHeightPreferenceKey.self) { nextViewportHeight in
      viewportHeight = nextViewportHeight
      syncActiveSelection()
    }
  }

  private func syncActiveSelection() {
    guard let fallbackSelection = sections.first else {
      return
    }

    let nextSelection = lcScrollSpyActiveSelection(
      sections: sections,
      sectionOffsets: sectionOffsets,
      viewportHeight: viewportHeight,
      contentBottomOffset: contentBottomOffset,
      activationOffset: activationOffset,
      fallbackSelection: fallbackSelection
    )
    guard nextSelection != activeSelection else {
      return
    }

    withAnimation(.easeInOut(duration: 0.18)) {
      activeSelection = nextSelection
    }
  }
}

extension View {
  func lcScrollSpyTarget<Selection: Hashable>(
    _ selection: Selection,
    in coordinateSpace: Namespace.ID
  ) -> some View {
    background {
      GeometryReader { geometry in
        Color.clear.preference(
          key: LCScrollSpySectionOffsetPreferenceKey<Selection>.self,
          value: [
            selection: geometry.frame(in: .named(coordinateSpace)).minY,
          ]
        )
      }
    }
  }

  func lcScrollSpyContentBottom(in coordinateSpace: Namespace.ID) -> some View {
    background {
      GeometryReader { geometry in
        Color.clear.preference(
          key: LCScrollSpyContentBottomPreferenceKey.self,
          value: geometry.frame(in: .named(coordinateSpace)).maxY
        )
      }
    }
  }
}
