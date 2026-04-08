import AppKit
import SwiftUI

enum AppThemePreference: String, CaseIterable, Codable, Hashable, Identifiable, Sendable {
  case system
  case light
  case dark
  case githubLight = "github-light"
  case githubDark = "github-dark"
  case nord
  case monokai
  case catppuccin
  case dracula
  case rosePine = "rose-pine"

  var id: String { rawValue }

  var label: String {
    switch self {
    case .system:
      "System"
    case .light:
      "Lifecycle Light"
    case .dark:
      "Lifecycle Dark"
    case .githubLight:
      "GitHub Light"
    case .githubDark:
      "GitHub Dark"
    case .nord:
      "Nord"
    case .monokai:
      "Monokai"
    case .catppuccin:
      "Catppuccin"
    case .dracula:
      "Dracula"
    case .rosePine:
      "Rose Pine"
    }
  }
}

enum AppThemeAppearance: String, Codable, Hashable, Sendable {
  case light
  case dark

  var colorScheme: ColorScheme {
    switch self {
    case .light:
      .light
    case .dark:
      .dark
    }
  }

  var isDark: Bool { self == .dark }
}

struct AppThemePreset: Equatable, Sendable {
  let id: AppThemePreference
  let appearance: AppThemeAppearance
  let tokens: AppThemeTokens
}

struct AppThemeTokens: Equatable, Sendable {
  let background: String
  let foreground: String
  let card: String
  let surface: String
  let sidebarBackground: String
  let sidebarForeground: String
  let sidebarMutedForeground: String
  let sidebarHover: String
  let sidebarSelected: String
  let terminalSurfaceBackground: String
  let terminalForeground: String
  let muted: String
  let mutedForeground: String
  let border: String
  let primary: String
  let primaryForeground: String
  let accent: String
  let accentForeground: String
  let destructive: String
  let destructiveForeground: String
  let ring: String
  let surfaceHover: String
  let surfaceSelected: String
  let glass: String
  let glassHover: String
  let terminalCursorColor: String
  let terminalAnsiBlack: String
  let terminalAnsiRed: String
  let terminalAnsiGreen: String
  let terminalAnsiYellow: String
  let terminalAnsiBlue: String
  let terminalAnsiMagenta: String
  let terminalAnsiCyan: String
  let terminalAnsiWhite: String
  let terminalAnsiBrightBlack: String
  let terminalAnsiBrightRed: String
  let terminalAnsiBrightGreen: String
  let terminalAnsiBrightYellow: String
  let terminalAnsiBrightBlue: String
  let terminalAnsiBrightMagenta: String
  let terminalAnsiBrightCyan: String
  let terminalAnsiBrightWhite: String
  let statusNeutral: String
  let statusInfo: String
  let statusSuccess: String
  let statusWarning: String
  let statusDanger: String
  let gitStatusAdded: String
  let gitStatusModified: String
  let gitStatusDeleted: String
  let gitStatusRenamed: String

  var shellBackground: Color { color(background) }
  var sidebarBackgroundColor: Color { color(sidebarBackground) }
  var sidebarForegroundColor: Color { color(sidebarForeground) }
  var sidebarMutedForegroundColor: Color { color(sidebarMutedForeground) }
  var sidebarHoverColor: Color { color(sidebarHover) }
  var sidebarSelectedColor: Color { color(sidebarSelected) }
  var panelBackground: Color { color(card) }
  var chromeBackground: Color { color(glass) }
  var surfaceBackground: Color { color(surface) }
  var surfaceRaised: Color { color(surfaceHover) }
  var primaryTextColor: Color { color(foreground) }
  var mutedColor: Color { color(mutedForeground) }
  var highlightColor: Color { color(sidebarSelected) }
  var borderColor: Color { color(border) }
  var accentColor: Color { color(accent) }
  var successColor: Color { color(statusSuccess) }
  var warningColor: Color { color(statusWarning) }
  var errorColor: Color { color(statusDanger) }
  var dropTargetColor: Color { color(accent) }
  var cardShadowColor: Color {
    Color.black.opacity(appearance.isDark ? 0.22 : 0.08)
  }

  var activityIdleColor: Color { color(border) }
  var activityBusyColor: Color { color(statusSuccess) }

  var terminalBackgroundHexColor: String { terminalSurfaceBackground }
  var terminalPalette: [(Int, String)] {
    [
      (0, terminalAnsiBlack),
      (1, terminalAnsiRed),
      (2, terminalAnsiGreen),
      (3, terminalAnsiYellow),
      (4, terminalAnsiBlue),
      (5, terminalAnsiMagenta),
      (6, terminalAnsiCyan),
      (7, terminalAnsiWhite),
      (8, terminalAnsiBrightBlack),
      (9, terminalAnsiBrightRed),
      (10, terminalAnsiBrightGreen),
      (11, terminalAnsiBrightYellow),
      (12, terminalAnsiBrightBlue),
      (13, terminalAnsiBrightMagenta),
      (14, terminalAnsiBrightCyan),
      (15, terminalAnsiBrightWhite),
    ]
  }

  fileprivate var appearance: AppThemeAppearance = .dark

  func withAppearance(_ appearance: AppThemeAppearance) -> Self {
    var copy = self
    copy.appearance = appearance
    return copy
  }

  private func color(_ hex: String) -> Color {
    Color(nsColor: NSColor(themeHex: hex))
  }
}

enum AppThemeCatalog {
  static let defaultPreset = resolve(preference: .dark, systemAppearance: .dark)

  static let presets: [AppThemePreference: AppThemePreset] = [
    .light: AppThemePreset(
      id: .light,
      appearance: .light,
      tokens: AppThemeTokens(
        background: "#f5f5f3",
        foreground: "#111111",
        card: "#ededea",
        surface: "#ffffff",
        sidebarBackground: "#f5f5f3",
        sidebarForeground: "#1a1a18",
        sidebarMutedForeground: "#696964",
        sidebarHover: "#efefeb",
        sidebarSelected: "#eaeae6",
        terminalSurfaceBackground: "#ffffff",
        terminalForeground: "#111111",
        muted: "#ecece9",
        mutedForeground: "#73736d",
        border: "#e4e4e0",
        primary: "#111111",
        primaryForeground: "#fcfcfb",
        accent: "#b38600",
        accentForeground: "#ffffff",
        destructive: "#ef4444",
        destructiveForeground: "#fef2f2",
        ring: "#111111",
        surfaceHover: "#efefeb",
        surfaceSelected: "#eaeae6",
        glass: "#dddcd8",
        glassHover: "#d0cfcb",
        terminalCursorColor: "#2563eb",
        terminalAnsiBlack: "#e4e4e7",
        terminalAnsiRed: "#dc2626",
        terminalAnsiGreen: "#15803d",
        terminalAnsiYellow: "#a16207",
        terminalAnsiBlue: "#2563eb",
        terminalAnsiMagenta: "#7c3aed",
        terminalAnsiCyan: "#0f766e",
        terminalAnsiWhite: "#52525b",
        terminalAnsiBrightBlack: "#a1a1aa",
        terminalAnsiBrightRed: "#ef4444",
        terminalAnsiBrightGreen: "#16a34a",
        terminalAnsiBrightYellow: "#ca8a04",
        terminalAnsiBrightBlue: "#3b82f6",
        terminalAnsiBrightMagenta: "#8b5cf6",
        terminalAnsiBrightCyan: "#14b8a6",
        terminalAnsiBrightWhite: "#09090b",
        statusNeutral: "#a8a29e",
        statusInfo: "#3b82f6",
        statusSuccess: "#16a34a",
        statusWarning: "#ca8a04",
        statusDanger: "#dc2626",
        gitStatusAdded: "#16a34a",
        gitStatusModified: "#ca8a04",
        gitStatusDeleted: "#dc2626",
        gitStatusRenamed: "#2563eb"
      ).withAppearance(.light)
    ),
    .dark: AppThemePreset(
      id: .dark,
      appearance: .dark,
      tokens: AppThemeTokens(
        background: "#171411",
        foreground: "#fafaf9",
        card: "#221e1a",
        surface: "#131110",
        sidebarBackground: "#171411",
        sidebarForeground: "#faf8f5",
        sidebarMutedForeground: "#a39d93",
        sidebarHover: "#221d19",
        sidebarSelected: "#2c2620",
        terminalSurfaceBackground: "#131110",
        terminalForeground: "#fafaf9",
        muted: "#29241f",
        mutedForeground: "#847d73",
        border: "#2d2823",
        primary: "#fafaf9",
        primaryForeground: "#171411",
        accent: "#d4a41c",
        accentForeground: "#171411",
        destructive: "#ef4444",
        destructiveForeground: "#450a0a",
        ring: "#fafaf9",
        surfaceHover: "#1c1916",
        surfaceSelected: "#23201c",
        glass: "#3a352f",
        glassHover: "#454038",
        terminalCursorColor: "#87b2cf",
        terminalAnsiBlack: "#322d28",
        terminalAnsiRed: "#de7474",
        terminalAnsiGreen: "#83b86f",
        terminalAnsiYellow: "#c9aa5f",
        terminalAnsiBlue: "#6f9dbc",
        terminalAnsiMagenta: "#b393d8",
        terminalAnsiCyan: "#7caec8",
        terminalAnsiWhite: "#ddd6cf",
        terminalAnsiBrightBlack: "#8f867c",
        terminalAnsiBrightRed: "#eb8a84",
        terminalAnsiBrightGreen: "#9ccc85",
        terminalAnsiBrightYellow: "#d9bd76",
        terminalAnsiBrightBlue: "#87b2cf",
        terminalAnsiBrightMagenta: "#c6a8e4",
        terminalAnsiBrightCyan: "#95c2dd",
        terminalAnsiBrightWhite: "#fafaf9",
        statusNeutral: "#57534e",
        statusInfo: "#60a5fa",
        statusSuccess: "#4ade80",
        statusWarning: "#f59e0b",
        statusDanger: "#ef4444",
        gitStatusAdded: "#4ade80",
        gitStatusModified: "#fbbf24",
        gitStatusDeleted: "#f87171",
        gitStatusRenamed: "#60a5fa"
      ).withAppearance(.dark)
    ),
    .githubLight: AppThemePreset(
      id: .githubLight,
      appearance: .light,
      tokens: AppThemeTokens(
        background: "#f6f8fa",
        foreground: "#1f2328",
        card: "#ebecf0",
        surface: "#ffffff",
        sidebarBackground: "#f6f8fa",
        sidebarForeground: "#1f2328",
        sidebarMutedForeground: "#656d76",
        sidebarHover: "#eaeef2",
        sidebarSelected: "#ddf4ff",
        terminalSurfaceBackground: "#ffffff",
        terminalForeground: "#1f2328",
        muted: "#ebecf0",
        mutedForeground: "#656d76",
        border: "#d0d7de",
        primary: "#1f883d",
        primaryForeground: "#ffffff",
        accent: "#0969da",
        accentForeground: "#ffffff",
        destructive: "#cf222e",
        destructiveForeground: "#ffffff",
        ring: "#0969da",
        surfaceHover: "#eaeef2",
        surfaceSelected: "#ddf4ff",
        glass: "#d8dce0",
        glassHover: "#ccd1d6",
        terminalCursorColor: "#0969da",
        terminalAnsiBlack: "#24292f",
        terminalAnsiRed: "#cf222e",
        terminalAnsiGreen: "#116329",
        terminalAnsiYellow: "#4d2d00",
        terminalAnsiBlue: "#0969da",
        terminalAnsiMagenta: "#8250df",
        terminalAnsiCyan: "#1b7c83",
        terminalAnsiWhite: "#6e7781",
        terminalAnsiBrightBlack: "#57606a",
        terminalAnsiBrightRed: "#a40e26",
        terminalAnsiBrightGreen: "#1a7f37",
        terminalAnsiBrightYellow: "#633c01",
        terminalAnsiBrightBlue: "#218bff",
        terminalAnsiBrightMagenta: "#a475f9",
        terminalAnsiBrightCyan: "#3192aa",
        terminalAnsiBrightWhite: "#8c959f",
        statusNeutral: "#656d76",
        statusInfo: "#0969da",
        statusSuccess: "#1a7f37",
        statusWarning: "#9a6700",
        statusDanger: "#cf222e",
        gitStatusAdded: "#1a7f37",
        gitStatusModified: "#9a6700",
        gitStatusDeleted: "#cf222e",
        gitStatusRenamed: "#0969da"
      ).withAppearance(.light)
    ),
    .githubDark: AppThemePreset(
      id: .githubDark,
      appearance: .dark,
      tokens: AppThemeTokens(
        background: "#0d1117",
        foreground: "#e6edf3",
        card: "#161b22",
        surface: "#010409",
        sidebarBackground: "#010409",
        sidebarForeground: "#e6edf3",
        sidebarMutedForeground: "#7d8590",
        sidebarHover: "#282e33",
        sidebarSelected: "#30363d",
        terminalSurfaceBackground: "#010409",
        terminalForeground: "#e6edf3",
        muted: "#282e33",
        mutedForeground: "#7d8590",
        border: "#30363d",
        primary: "#238636",
        primaryForeground: "#ffffff",
        accent: "#1f6feb",
        accentForeground: "#ffffff",
        destructive: "#f85149",
        destructiveForeground: "#ffffff",
        ring: "#1f6feb",
        surfaceHover: "#282e33",
        surfaceSelected: "#30363d",
        glass: "#30363d",
        glassHover: "#3a414a",
        terminalCursorColor: "#2f81f7",
        terminalAnsiBlack: "#484f58",
        terminalAnsiRed: "#ff7b72",
        terminalAnsiGreen: "#3fb950",
        terminalAnsiYellow: "#d29922",
        terminalAnsiBlue: "#58a6ff",
        terminalAnsiMagenta: "#bc8cff",
        terminalAnsiCyan: "#39c5cf",
        terminalAnsiWhite: "#b1bac4",
        terminalAnsiBrightBlack: "#6e7681",
        terminalAnsiBrightRed: "#ffa198",
        terminalAnsiBrightGreen: "#56d364",
        terminalAnsiBrightYellow: "#e3b341",
        terminalAnsiBrightBlue: "#79c0ff",
        terminalAnsiBrightMagenta: "#d2a8ff",
        terminalAnsiBrightCyan: "#56d4dd",
        terminalAnsiBrightWhite: "#ffffff",
        statusNeutral: "#7d8590",
        statusInfo: "#1f6feb",
        statusSuccess: "#3fb950",
        statusWarning: "#d29922",
        statusDanger: "#f85149",
        gitStatusAdded: "#3fb950",
        gitStatusModified: "#d29922",
        gitStatusDeleted: "#f85149",
        gitStatusRenamed: "#58a6ff"
      ).withAppearance(.dark)
    ),
    .nord: AppThemePreset(
      id: .nord,
      appearance: .dark,
      tokens: AppThemeTokens(
        background: "#3b4252",
        foreground: "#eceff4",
        card: "#434c5e",
        surface: "#2e3440",
        sidebarBackground: "#3b4252",
        sidebarForeground: "#eff4fb",
        sidebarMutedForeground: "#d9e2ef",
        sidebarHover: "#434c5e",
        sidebarSelected: "#4c566a",
        terminalSurfaceBackground: "#2e3440",
        terminalForeground: "#eceff4",
        muted: "#434c5e",
        mutedForeground: "#d8dee9",
        border: "#4c566a",
        primary: "#eceff4",
        primaryForeground: "#2e3440",
        accent: "#88c0d0",
        accentForeground: "#2e3440",
        destructive: "#bf616a",
        destructiveForeground: "#2e3440",
        ring: "#81a1c1",
        surfaceHover: "#434c5e",
        surfaceSelected: "#4c566a",
        glass: "#4c566a",
        glassHover: "#576279",
        terminalCursorColor: "#88c0d0",
        terminalAnsiBlack: "#3b4252",
        terminalAnsiRed: "#bf616a",
        terminalAnsiGreen: "#a3be8c",
        terminalAnsiYellow: "#ebcb8b",
        terminalAnsiBlue: "#81a1c1",
        terminalAnsiMagenta: "#b48ead",
        terminalAnsiCyan: "#8fbcbb",
        terminalAnsiWhite: "#e5e9f0",
        terminalAnsiBrightBlack: "#4c566a",
        terminalAnsiBrightRed: "#d08770",
        terminalAnsiBrightGreen: "#b5d7a7",
        terminalAnsiBrightYellow: "#f0d399",
        terminalAnsiBrightBlue: "#94b7da",
        terminalAnsiBrightMagenta: "#c895bf",
        terminalAnsiBrightCyan: "#a2d3d0",
        terminalAnsiBrightWhite: "#eceff4",
        statusNeutral: "#616e88",
        statusInfo: "#81a1c1",
        statusSuccess: "#a3be8c",
        statusWarning: "#ebcb8b",
        statusDanger: "#bf616a",
        gitStatusAdded: "#a3be8c",
        gitStatusModified: "#ebcb8b",
        gitStatusDeleted: "#bf616a",
        gitStatusRenamed: "#81a1c1"
      ).withAppearance(.dark)
    ),
    .monokai: AppThemePreset(
      id: .monokai,
      appearance: .dark,
      tokens: AppThemeTokens(
        background: "#2f3028",
        foreground: "#f8f8f2",
        card: "#34352d",
        surface: "#272822",
        sidebarBackground: "#2f3028",
        sidebarForeground: "#fbfbf6",
        sidebarMutedForeground: "#d5d3ca",
        sidebarHover: "#3a3b31",
        sidebarSelected: "#4a4c41",
        terminalSurfaceBackground: "#272822",
        terminalForeground: "#f8f8f2",
        muted: "#34352d",
        mutedForeground: "#b7b7ae",
        border: "#49483e",
        primary: "#f8f8f2",
        primaryForeground: "#272822",
        accent: "#66d9ef",
        accentForeground: "#0e3138",
        destructive: "#f92672",
        destructiveForeground: "#3f0d20",
        ring: "#a6e22e",
        surfaceHover: "#3a3b31",
        surfaceSelected: "#4a4c41",
        glass: "#4a4b3e",
        glassHover: "#555649",
        terminalCursorColor: "#66d9ef",
        terminalAnsiBlack: "#403e41",
        terminalAnsiRed: "#f92672",
        terminalAnsiGreen: "#a6e22e",
        terminalAnsiYellow: "#e6db74",
        terminalAnsiBlue: "#66d9ef",
        terminalAnsiMagenta: "#ae81ff",
        terminalAnsiCyan: "#a1efe4",
        terminalAnsiWhite: "#ccccc6",
        terminalAnsiBrightBlack: "#75715e",
        terminalAnsiBrightRed: "#ff6188",
        terminalAnsiBrightGreen: "#bef264",
        terminalAnsiBrightYellow: "#ffd866",
        terminalAnsiBrightBlue: "#78dce8",
        terminalAnsiBrightMagenta: "#c4a7ff",
        terminalAnsiBrightCyan: "#b8f2e6",
        terminalAnsiBrightWhite: "#f8f8f2",
        statusNeutral: "#75715e",
        statusInfo: "#66d9ef",
        statusSuccess: "#a6e22e",
        statusWarning: "#e6db74",
        statusDanger: "#f92672",
        gitStatusAdded: "#a6e22e",
        gitStatusModified: "#e6db74",
        gitStatusDeleted: "#f92672",
        gitStatusRenamed: "#66d9ef"
      ).withAppearance(.dark)
    ),
    .catppuccin: AppThemePreset(
      id: .catppuccin,
      appearance: .dark,
      tokens: AppThemeTokens(
        background: "#1e1e2e",
        foreground: "#cdd6f4",
        card: "#313244",
        surface: "#181825",
        sidebarBackground: "#1e1e2e",
        sidebarForeground: "#cdd6f4",
        sidebarMutedForeground: "#a6adc8",
        sidebarHover: "#45475a",
        sidebarSelected: "#585b70",
        terminalSurfaceBackground: "#181825",
        terminalForeground: "#cdd6f4",
        muted: "#313244",
        mutedForeground: "#a6adc8",
        border: "#45475a",
        primary: "#cdd6f4",
        primaryForeground: "#1e1e2e",
        accent: "#89b4fa",
        accentForeground: "#1e1e2e",
        destructive: "#f38ba8",
        destructiveForeground: "#1e1e2e",
        ring: "#89b4fa",
        surfaceHover: "#45475a",
        surfaceSelected: "#585b70",
        glass: "#45475a",
        glassHover: "#505268",
        terminalCursorColor: "#f5e0dc",
        terminalAnsiBlack: "#45475a",
        terminalAnsiRed: "#f38ba8",
        terminalAnsiGreen: "#a6e3a1",
        terminalAnsiYellow: "#f9e2af",
        terminalAnsiBlue: "#89b4fa",
        terminalAnsiMagenta: "#cba6f7",
        terminalAnsiCyan: "#94e2d5",
        terminalAnsiWhite: "#bac2de",
        terminalAnsiBrightBlack: "#585b70",
        terminalAnsiBrightRed: "#f38ba8",
        terminalAnsiBrightGreen: "#a6e3a1",
        terminalAnsiBrightYellow: "#f9e2af",
        terminalAnsiBrightBlue: "#89b4fa",
        terminalAnsiBrightMagenta: "#f5c2e7",
        terminalAnsiBrightCyan: "#94e2d5",
        terminalAnsiBrightWhite: "#a6adc8",
        statusNeutral: "#6c7086",
        statusInfo: "#89b4fa",
        statusSuccess: "#a6e3a1",
        statusWarning: "#f9e2af",
        statusDanger: "#f38ba8",
        gitStatusAdded: "#a6e3a1",
        gitStatusModified: "#f9e2af",
        gitStatusDeleted: "#f38ba8",
        gitStatusRenamed: "#89b4fa"
      ).withAppearance(.dark)
    ),
    .dracula: AppThemePreset(
      id: .dracula,
      appearance: .dark,
      tokens: AppThemeTokens(
        background: "#282a36",
        foreground: "#f8f8f2",
        card: "#2d2f3d",
        surface: "#21222c",
        sidebarBackground: "#282a36",
        sidebarForeground: "#f8f8f2",
        sidebarMutedForeground: "#9da5c4",
        sidebarHover: "#353849",
        sidebarSelected: "#44475a",
        terminalSurfaceBackground: "#21222c",
        terminalForeground: "#f8f8f2",
        muted: "#353849",
        mutedForeground: "#9da5c4",
        border: "#3a3d50",
        primary: "#f8f8f2",
        primaryForeground: "#282a36",
        accent: "#bd93f9",
        accentForeground: "#282a36",
        destructive: "#ff5555",
        destructiveForeground: "#282a36",
        ring: "#bd93f9",
        surfaceHover: "#2d2f3d",
        surfaceSelected: "#353849",
        glass: "#414458",
        glassHover: "#4a4d63",
        terminalCursorColor: "#f8f8f2",
        terminalAnsiBlack: "#21222c",
        terminalAnsiRed: "#ff5555",
        terminalAnsiGreen: "#50fa7b",
        terminalAnsiYellow: "#f1fa8c",
        terminalAnsiBlue: "#bd93f9",
        terminalAnsiMagenta: "#ff79c6",
        terminalAnsiCyan: "#8be9fd",
        terminalAnsiWhite: "#f8f8f2",
        terminalAnsiBrightBlack: "#6272a4",
        terminalAnsiBrightRed: "#ff6e6e",
        terminalAnsiBrightGreen: "#69ff94",
        terminalAnsiBrightYellow: "#ffffa5",
        terminalAnsiBrightBlue: "#d6acff",
        terminalAnsiBrightMagenta: "#ff92df",
        terminalAnsiBrightCyan: "#a4ffff",
        terminalAnsiBrightWhite: "#ffffff",
        statusNeutral: "#6272a4",
        statusInfo: "#8be9fd",
        statusSuccess: "#50fa7b",
        statusWarning: "#f1fa8c",
        statusDanger: "#ff5555",
        gitStatusAdded: "#50fa7b",
        gitStatusModified: "#f1fa8c",
        gitStatusDeleted: "#ff5555",
        gitStatusRenamed: "#8be9fd"
      ).withAppearance(.dark)
    ),
    .rosePine: AppThemePreset(
      id: .rosePine,
      appearance: .dark,
      tokens: AppThemeTokens(
        background: "#211f32",
        foreground: "#e0def4",
        card: "#26233a",
        surface: "#191724",
        sidebarBackground: "#211f32",
        sidebarForeground: "#e0def4",
        sidebarMutedForeground: "#908caa",
        sidebarHover: "#2a273f",
        sidebarSelected: "#403d52",
        terminalSurfaceBackground: "#191724",
        terminalForeground: "#e0def4",
        muted: "#2a273f",
        mutedForeground: "#6e6a86",
        border: "#403d52",
        primary: "#e0def4",
        primaryForeground: "#191724",
        accent: "#c4a7e7",
        accentForeground: "#191724",
        destructive: "#eb6f92",
        destructiveForeground: "#191724",
        ring: "#c4a7e7",
        surfaceHover: "#2a273f",
        surfaceSelected: "#312e49",
        glass: "#403d52",
        glassHover: "#4a475e",
        terminalCursorColor: "#ebbcba",
        terminalAnsiBlack: "#26233a",
        terminalAnsiRed: "#eb6f92",
        terminalAnsiGreen: "#8db29b",
        terminalAnsiYellow: "#f6c177",
        terminalAnsiBlue: "#31748f",
        terminalAnsiMagenta: "#c4a7e7",
        terminalAnsiCyan: "#9ccfd8",
        terminalAnsiWhite: "#e0def4",
        terminalAnsiBrightBlack: "#6e6a86",
        terminalAnsiBrightRed: "#f08fb0",
        terminalAnsiBrightGreen: "#a7c6b4",
        terminalAnsiBrightYellow: "#ffd29a",
        terminalAnsiBrightBlue: "#5b8fa8",
        terminalAnsiBrightMagenta: "#c4a7e7",
        terminalAnsiBrightCyan: "#b8e3ea",
        terminalAnsiBrightWhite: "#f4f1ff",
        statusNeutral: "#6e6a86",
        statusInfo: "#c4a7e7",
        statusSuccess: "#8db29b",
        statusWarning: "#f6c177",
        statusDanger: "#eb6f92",
        gitStatusAdded: "#8db29b",
        gitStatusModified: "#f6c177",
        gitStatusDeleted: "#eb6f92",
        gitStatusRenamed: "#31748f"
      ).withAppearance(.dark)
    ),
  ]

  static func resolve(
    preference: AppThemePreference,
    systemAppearance: AppThemeAppearance
  ) -> AppThemePreset {
    switch preference {
    case .system:
      presets[systemAppearance == .dark ? .dark : .light] ?? defaultPreset
    default:
      presets[preference] ?? defaultPreset
    }
  }
}

private struct AppThemeTokensKey: EnvironmentKey {
  static let defaultValue = AppThemeCatalog.defaultPreset.tokens
}

extension EnvironmentValues {
  var appTheme: AppThemeTokens {
    get { self[AppThemeTokensKey.self] }
    set { self[AppThemeTokensKey.self] = newValue }
  }
}

extension NSColor {
  convenience init(themeHex hex: String, alpha: CGFloat = 1) {
    let sanitized = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
    let value = UInt32(sanitized, radix: 16) ?? 0
    let red = CGFloat((value >> 16) & 0xFF) / 255
    let green = CGFloat((value >> 8) & 0xFF) / 255
    let blue = CGFloat(value & 0xFF) / 255

    self.init(red: red, green: green, blue: blue, alpha: alpha)
  }
}
