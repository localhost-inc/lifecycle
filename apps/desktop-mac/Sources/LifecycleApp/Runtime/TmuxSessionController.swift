import Foundation

struct TmuxSessionContext {
  enum Transport {
    case local(program: String)
    case ssh(program: String, baseArgs: [String])
  }

  let workspaceID: String
  let sessionName: String
  let workingDirectory: String
  let transport: Transport
}

enum TmuxSessionController {
  private static let listWindowFormat =
    "#{window_id}\t#{window_index}\t#{window_name}\t#{window_active}\t#{window_panes}"

  enum Error: LocalizedError {
    case invalidCreateWindowOutput

    var errorDescription: String? {
      switch self {
      case .invalidCreateWindowOutput:
        return "tmux did not return the new window metadata"
      }
    }
  }

  static func ensureSession(in context: TmuxSessionContext) async throws {
    let result = try await runTmux(
      in: context,
      args: ["has-session", "-t", context.sessionName],
      allowNonZeroExit: true
    )

    guard result.exitCode != 0 else {
      return
    }

    _ = try await runTmux(
      in: context,
      args: [
        "new-session",
        "-d",
        "-s",
        context.sessionName,
        "-c",
        context.workingDirectory,
        "-n",
        "shell",
      ]
    )
  }

  static func listWindows(in context: TmuxSessionContext) async throws -> [TmuxWindowSummary] {
    try await ensureSession(in: context)

    let result = try await runTmux(
      in: context,
      args: ["list-windows", "-t", context.sessionName, "-F", listWindowFormat]
    )

    return parseWindows(result.stdout)
  }

  static func createWindow(
    named name: String?,
    in context: TmuxSessionContext
  ) async throws -> TmuxWindowSummary {
    try await ensureSession(in: context)

    var args = [
      "new-window",
      "-P",
      "-F",
      listWindowFormat,
      "-t",
      context.sessionName,
      "-c",
      context.workingDirectory,
    ]
    if let name, !name.isEmpty {
      args.append(contentsOf: ["-n", name])
    }

    let result = try await runTmux(in: context, args: args)
    guard let window = parseWindows(result.stdout).first else {
      throw Error.invalidCreateWindowOutput
    }

    return window
  }

  static func selectWindow(_ window: TmuxWindowSummary, in context: TmuxSessionContext) async throws {
    _ = try await runTmux(in: context, args: ["select-window", "-t", window.id])
  }

  static func closeWindow(_ window: TmuxWindowSummary, in context: TmuxSessionContext) async throws {
    try await closeWindow(id: window.id, in: context)
  }

  static func closeWindow(id windowID: String, in context: TmuxSessionContext) async throws {
    _ = try await runTmux(in: context, args: ["kill-window", "-t", windowID])
  }

  static func closeSession(named sessionName: String, in context: TmuxSessionContext) async throws {
    _ = try await runTmux(
      in: context,
      args: ["kill-session", "-t", sessionName],
      allowNonZeroExit: true
    )
  }

  static func swapWindows(
    _ source: TmuxWindowSummary,
    with target: TmuxWindowSummary,
    in context: TmuxSessionContext
  ) async throws {
    guard source.id != target.id else {
      return
    }

    _ = try await runTmux(
      in: context,
      args: ["swap-window", "-s", source.id, "-t", target.id]
    )
  }

  private static func runTmux(
    in context: TmuxSessionContext,
    args: [String],
    allowNonZeroExit: Bool = false
  ) async throws -> ProcessOutput {
    switch context.transport {
    case let .local(program):
      return try await ProcessRunner.run(
        program: program,
        args: args,
        allowNonZeroExit: allowNonZeroExit
      )
    case let .ssh(program, baseArgs):
      return try await ProcessRunner.run(
        program: program,
        args: baseArgs + [remoteCommandText(cwd: context.workingDirectory, tmuxArgs: args)],
        allowNonZeroExit: allowNonZeroExit
      )
    }
  }

  private static func remoteCommandText(cwd: String, tmuxArgs: [String]) -> String {
    let tmuxCommand = (["tmux"] + tmuxArgs)
      .map(shellEscape)
      .joined(separator: " ")
    let entryCommand = "cd \(shellEscape(cwd)) && \(tmuxCommand)"
    return "exec \"${SHELL:-/bin/bash}\" -lic \(shellEscape(entryCommand))"
  }

  private static func parseWindows(_ stdout: String) -> [TmuxWindowSummary] {
    stdout
      .split(whereSeparator: \.isNewline)
      .compactMap { line -> TmuxWindowSummary? in
        let parts = line.split(separator: "\t", omittingEmptySubsequences: false)
        guard parts.count >= 5,
              let index = Int(parts[1]),
              let paneCount = Int(parts[4])
        else {
          return nil
        }

        return TmuxWindowSummary(
          id: String(parts[0]),
          index: index,
          name: String(parts[2]),
          isActive: parts[3] == "1",
          paneCount: paneCount
        )
      }
      .sorted { lhs, rhs in
        lhs.index < rhs.index
      }
  }
}
