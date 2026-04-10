import SwiftUI

private let appWelcomeTitle = "lifecycle"
private let appWelcomeTypingInterval: TimeInterval = 0.12
private let appWelcomeLogoSettleDelay: TimeInterval = 0.28
private let appWelcomeSubtitleDelay: TimeInterval = 0.45

struct AppWelcomeView: View {
  @Environment(\.appTheme) private var theme
  @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion

  let errorMessage: String?

  @State private var didStartAnimation = false
  @State private var logoSettled = false
  @State private var logoFloating = false
  @State private var typedCount = 0
  @State private var showSubtitle = false
  @State private var cursorVisible = true

  var body: some View {
    ZStack {
      appWelcomeBackground

      VStack(spacing: 0) {
        appWelcomeLogo

        VStack(spacing: 10) {
          appWelcomeTitleView

          if showSubtitle {
            Text("No repositories configured.")
              .font(.system(size: 13, weight: .medium))
              .foregroundStyle(theme.mutedColor)
              .multilineTextAlignment(.center)
              .transition(.opacity.combined(with: .move(edge: .bottom)))
          }

          if let errorMessage, !errorMessage.isEmpty {
            Text(errorMessage)
              .font(.system(size: 11, weight: .medium, design: .monospaced))
              .foregroundStyle(theme.errorColor)
              .multilineTextAlignment(.center)
              .frame(maxWidth: 420)
              .transition(.opacity)
              .padding(.top, 4)
          }
        }
        .offset(y: logoSettled ? -18 : 0)
      }
      .padding(.horizontal, 32)
      .padding(.bottom, 36)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(theme.shellBackground)
    .onAppear {
      startWelcomeAnimationIfNeeded()
    }
    .onReceive(Timer.publish(every: appWelcomeTypingInterval, on: .main, in: .common).autoconnect()) { _ in
      guard didStartAnimation,
            !accessibilityReduceMotion,
            typedCount < appWelcomeTitle.count
      else {
        return
      }

      typedCount += 1

      if typedCount == appWelcomeTitle.count {
        DispatchQueue.main.asyncAfter(deadline: .now() + appWelcomeSubtitleDelay) {
          withAnimation(.easeOut(duration: 0.35)) {
            showSubtitle = true
          }
        }
      }
    }
  }

  private var appWelcomeBackground: some View {
    ZStack {
      theme.shellBackground

      Circle()
        .fill(theme.accentColor.opacity(0.08))
        .frame(width: 360, height: 360)
        .blur(radius: 90)
        .offset(x: -220, y: -120)

      Circle()
        .fill(theme.primaryTextColor.opacity(0.05))
        .frame(width: 260, height: 260)
        .blur(radius: 80)
        .offset(x: 240, y: 140)
    }
    .ignoresSafeArea()
  }

  @ViewBuilder
  private var appWelcomeLogo: some View {
    if let logo = AppResources.lifecycleLogoImage {
      Image(nsImage: logo)
        .renderingMode(.template)
        .resizable()
        .scaledToFit()
        .frame(width: 220, height: 220)
        .foregroundStyle(theme.primaryTextColor)
        .scaleEffect(logoSettled ? 0.58 : 1)
        .offset(y: logoSettled ? (logoFloating ? -44 : -34) : 0)
        .shadow(color: theme.cardShadowColor.opacity(0.35), radius: 24, x: 0, y: 10)
        .animation(.spring(response: 0.7, dampingFraction: 0.82), value: logoSettled)
        .animation(.easeInOut(duration: 3.2).repeatForever(autoreverses: true), value: logoFloating)
    }
  }

  private var appWelcomeTitleView: some View {
    HStack(spacing: 0) {
      Text(String(appWelcomeTitle.prefix(typedCount)))
        .font(.system(size: 38, weight: .bold, design: .monospaced))
        .foregroundStyle(theme.primaryTextColor)

      Rectangle()
        .fill(theme.primaryTextColor)
        .frame(width: 5, height: 30)
        .offset(y: 1)
        .opacity(cursorVisible ? 1 : 0.12)
        .animation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true), value: cursorVisible)
    }
    .frame(height: 48)
  }

  private func startWelcomeAnimationIfNeeded() {
    guard !didStartAnimation else {
      return
    }

    didStartAnimation = true
    cursorVisible = false

    if accessibilityReduceMotion {
      logoSettled = true
      typedCount = appWelcomeTitle.count
      showSubtitle = true
      return
    }

    withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) {
      cursorVisible = true
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + appWelcomeLogoSettleDelay) {
      withAnimation(.spring(response: 0.7, dampingFraction: 0.82)) {
        logoSettled = true
      }

      withAnimation(.easeInOut(duration: 3.2).repeatForever(autoreverses: true)) {
        logoFloating = true
      }
    }
  }
}
