import Foundation

struct ProcessOutput: Sendable {
  let stdout: String
  let stderr: String
  let exitCode: Int32
}

enum ProcessRunnerError: LocalizedError {
  case launchFailed(String)
  case commandFailed(command: String, exitCode: Int32, details: String)

  var errorDescription: String? {
    switch self {
    case let .launchFailed(message):
      return "Failed to launch process: \(message)"
    case let .commandFailed(command, exitCode, details):
      let detailText = details.trimmingCharacters(in: .whitespacesAndNewlines)
      if detailText.isEmpty {
        return "Command failed with exit code \(exitCode): \(command)"
      }

      return "Command failed with exit code \(exitCode): \(command)\n\(detailText)"
    }
  }
}

enum ProcessRunner {
  static func run(
    program: String,
    args: [String],
    cwd: String? = nil,
    env: [String: String] = [:],
    allowNonZeroExit: Bool = false
  ) async throws -> ProcessOutput {
    let output = try await Task.detached(priority: .userInitiated) { () throws -> ProcessOutput in
      let process = Process()
      let stdoutPipe = Pipe()
      let stderrPipe = Pipe()

      process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
      process.arguments = [program] + args
      process.standardOutput = stdoutPipe
      process.standardError = stderrPipe

      if let cwd {
        process.currentDirectoryURL = URL(fileURLWithPath: cwd, isDirectory: true)
      }

      if !env.isEmpty {
        var mergedEnvironment = ProcessInfo.processInfo.environment
        mergedEnvironment.merge(env) { _, new in new }
        process.environment = mergedEnvironment
      }

      do {
        try process.run()
      } catch {
        throw ProcessRunnerError.launchFailed(error.localizedDescription)
      }

      process.waitUntilExit()

      let stdout = String(
        decoding: stdoutPipe.fileHandleForReading.readDataToEndOfFile(),
        as: UTF8.self
      )
      let stderr = String(
        decoding: stderrPipe.fileHandleForReading.readDataToEndOfFile(),
        as: UTF8.self
      )

      return ProcessOutput(
        stdout: stdout,
        stderr: stderr,
        exitCode: process.terminationStatus
      )
    }.value

    guard allowNonZeroExit || output.exitCode == 0 else {
      let details = output.stderr.isEmpty ? output.stdout : output.stderr
      throw ProcessRunnerError.commandFailed(
        command: ([program] + args).map(shellEscape).joined(separator: " "),
        exitCode: output.exitCode,
        details: details
      )
    }

    return output
  }

  static func run(
    spec: BridgeShellLaunchSpec,
    allowNonZeroExit: Bool = false
  ) async throws -> ProcessOutput {
    try await run(
      program: spec.program,
      args: spec.args,
      cwd: spec.cwd,
      env: Dictionary(uniqueKeysWithValues: spec.envPairs),
      allowNonZeroExit: allowNonZeroExit
    )
  }
}
