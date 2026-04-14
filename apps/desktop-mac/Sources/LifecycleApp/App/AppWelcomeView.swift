import SwiftUI

struct AppWelcomeView: View {
  @Environment(\.appTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  let errorMessage: String?
  let onAddRepository: () -> Void
  let showsDeveloperDismissButton: Bool
  let onDismissDeveloperOverride: () -> Void

  @State private var didBeginDependencyCheck = false
  @State private var isCheckingDependencies = false
  @State private var dependencyResults = appWelcomeInitialDependencyResults()
  @State private var didBeginIntro = false
  @State private var showsLogo = false
  @State private var showsPrimaryAction = false
  @State private var introTask: Task<Void, Never>?

  private static let welcomeWordmark = "lifecycle"
  private static let wordmarkCharacterDelay = 0.082
  private static let wordmarkStartDelay = 0.34
  private static let buttonFadeDelay =
    wordmarkStartDelay
    + (wordmarkCharacterDelay * Double(max(welcomeWordmark.count - 1, 0)))
    + 0.18

  private var requiredDependenciesReady: Bool {
    appWelcomeRequiredDependenciesReady(dependencyResults)
  }

  private var missingDependencies: [AppWelcomeDependencyResult] {
    appWelcomeMissingDependencies(dependencyResults)
  }

  private var hasBlockingMissingDependencies: Bool {
    missingDependencies.contains { $0.requirement.isRequired }
  }

  private var canChooseRepository: Bool {
    !isCheckingDependencies && requiredDependenciesReady
  }

  var body: some View {
    GeometryReader { geometry in
      let horizontalPadding = max(24.0, geometry.size.width * 0.04)
      let contentWidth = min(460.0, geometry.size.width - (horizontalPadding * 2))

      ScrollView(showsIndicators: false) {
        VStack {
          Spacer(minLength: 0)

          VStack(spacing: missingDependencies.isEmpty ? 18 : 24) {
            VStack(spacing: 14) {
              LifecycleLogo(
                size: .medium,
                foregroundColor: theme.primaryColor
              )
                .opacity(showsLogo ? 1 : 0)
                .scaleEffect(showsLogo ? 1 : 0.94)
                .offset(y: showsLogo ? 0 : 8)

              TypewriterText(
                text: Self.welcomeWordmark,
                characterDelay: Self.wordmarkCharacterDelay,
                startDelay: Self.wordmarkStartDelay,
                showsCursor: false
              )
                .font(.lcPixel(size: 34))
                .foregroundStyle(theme.primaryTextColor)
            }
            .frame(maxWidth: .infinity)

            if !missingDependencies.isEmpty {
              appWelcomePreflightGroup
            }

            VStack(spacing: 12) {
              LCButton(
                label: "Add repository",
                variant: .primary,
                isEnabled: canChooseRepository,
                action: onAddRepository
              )

              if isCheckingDependencies {
                Text("Checking required tools…")
                  .font(.lc(size: 12, weight: .medium))
                  .foregroundStyle(theme.mutedColor)
              }

              if let errorMessage, !errorMessage.isEmpty {
                Text(errorMessage)
                  .font(.lc(size: 12, weight: .medium))
                  .foregroundStyle(theme.errorColor)
                  .multilineTextAlignment(.center)
                  .fixedSize(horizontal: false, vertical: true)
              }
            }
            .frame(maxWidth: .infinity)
            .opacity(showsPrimaryAction ? 1 : 0)
            .offset(y: showsPrimaryAction ? 0 : 8)
            .allowsHitTesting(showsPrimaryAction)
          }
          .frame(width: contentWidth)
          .padding(.vertical, 32)

          Spacer(minLength: 0)
        }
        .frame(minHeight: geometry.size.height)
      }
      .padding(.horizontal, horizontalPadding)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .overlay(alignment: .bottomLeading) {
        if showsDeveloperDismissButton {
          LCButton(
            label: "Back to app",
            variant: .ghost,
            size: .small,
            action: onDismissDeveloperOverride
          )
          .padding(.leading, 12)
          .padding(.bottom, 12)
          .opacity(showsPrimaryAction ? 1 : 0)
          .offset(y: showsPrimaryAction ? 0 : 8)
          .allowsHitTesting(showsPrimaryAction)
        }
      }
    }
    .background(theme.shellBackground.ignoresSafeArea())
    .onAppear {
      beginDependencyCheckIfNeeded()
      beginIntroIfNeeded()
    }
    .onDisappear {
      introTask?.cancel()
      introTask = nil
    }
  }

  private var appWelcomePreflightGroup: some View {
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 6) {
        Text(hasBlockingMissingDependencies ? "Missing required tools" : "Optional tools not found")
          .font(.lc(size: 13, weight: .semibold))
          .foregroundStyle(theme.primaryTextColor)

        Text(
          hasBlockingMissingDependencies
            ? "Install these before adding a repository."
            : "You can continue without these, or install them now."
        )
        .font(.lc(size: 12, weight: .medium))
        .foregroundStyle(theme.mutedColor)
        .fixedSize(horizontal: false, vertical: true)
      }
      .padding(.horizontal, 18)
      .padding(.top, 18)
      .padding(.bottom, 14)

      Divider()
        .overlay(theme.borderColor.opacity(0.62))

      VStack(spacing: 0) {
        ForEach(Array(missingDependencies.enumerated()), id: \.element.id) { index, result in
          AppWelcomeDependencyRow(result: result)

          if index < missingDependencies.count - 1 {
            Divider()
              .overlay(theme.borderColor.opacity(0.6))
          }
        }
      }

      Divider()
        .overlay(theme.borderColor.opacity(0.62))

      HStack {
        Spacer(minLength: 0)

        LCButton(
          label: isCheckingDependencies ? "Checking…" : "Check Again",
          variant: .surface,
          isEnabled: !isCheckingDependencies
        ) {
          runDependencyCheck()
        }
      }
      .padding(18)
    }
    .background(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .fill(theme.surfaceBackground)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .strokeBorder(theme.borderColor.opacity(0.66))
    )
    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
  }

  private func beginDependencyCheckIfNeeded() {
    guard !didBeginDependencyCheck else {
      return
    }

    didBeginDependencyCheck = true
    runDependencyCheck()
  }

  private func beginIntroIfNeeded() {
    guard !didBeginIntro else {
      return
    }

    didBeginIntro = true

    guard !reduceMotion else {
      showsLogo = true
      showsPrimaryAction = true
      return
    }

    withAnimation(.spring(response: 0.42, dampingFraction: 0.9)) {
      showsLogo = true
    }

    introTask = Task { @MainActor in
      try? await Task.sleep(nanoseconds: UInt64(Self.buttonFadeDelay * 1_000_000_000))
      guard !Task.isCancelled else {
        return
      }

      withAnimation(.easeOut(duration: 0.24)) {
        showsPrimaryAction = true
      }
    }
  }

  private func runDependencyCheck() {
    guard !isCheckingDependencies else {
      return
    }

    isCheckingDependencies = true
    dependencyResults = appWelcomeInitialDependencyResults()

    Task {
      let results = await resolveAppWelcomeDependencies()
      await MainActor.run {
        withAnimation(.easeOut(duration: 0.18)) {
          dependencyResults = results
          isCheckingDependencies = false
        }
      }
    }
  }
}

private struct AppWelcomeDependencyRow: View {
  @Environment(\.appTheme) private var theme

  let result: AppWelcomeDependencyResult

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline, spacing: 10) {
        Circle()
          .fill(statusColor)
          .frame(width: 7, height: 7)

        Text(result.requirement.title)
          .font(.lc(size: 14, weight: .semibold))
          .foregroundStyle(theme.primaryTextColor)

        Text(result.requirement.isRequired ? "required" : "optional")
          .font(.lc(size: 10, weight: .bold, design: .monospaced))
          .foregroundStyle(theme.mutedColor.opacity(0.72))

        Spacer(minLength: 8)

        Text(statusLabel)
          .font(.lc(size: 10, weight: .bold, design: .monospaced))
          .foregroundStyle(statusColor)
      }

      Text(detailText)
        .font(.lc(size: 11, weight: .medium, design: .monospaced))
        .foregroundStyle(detailColor)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.leading, 17)
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 16)
  }

  private var statusLabel: String {
    switch result.state {
    case .checking:
      "checking"
    case .installed:
      "installed"
    case .missing:
      "missing"
    }
  }

  private var statusColor: Color {
    switch result.state {
    case .checking:
      theme.accentColor
    case .installed:
      theme.successColor
    case .missing:
      result.requirement.isRequired ? theme.errorColor : theme.warningColor
    }
  }

  private var detailText: String {
    switch result.state {
    case .checking:
      return result.requirement.summary
    case let .installed(version):
      return version
    case let .missing(details):
      if let details, !details.isEmpty {
        return "\(details)\n\(result.requirement.installHint)"
      }
      return result.requirement.installHint
    }
  }

  private var detailColor: Color {
    switch result.state {
    case .checking:
      theme.mutedColor.opacity(0.86)
    case .installed:
      theme.primaryTextColor.opacity(0.86)
    case .missing:
      theme.mutedColor.opacity(0.9)
    }
  }
}
