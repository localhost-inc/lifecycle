import Foundation

struct AppWelcomeDependencyRequirement: Equatable, Identifiable, Sendable {
  let id: String
  let title: String
  let summary: String
  let installHint: String
  let program: String
  let args: [String]
  let isRequired: Bool
}

enum AppWelcomeDependencyState: Equatable, Sendable {
  case checking
  case installed(String)
  case missing(String?)
}

struct AppWelcomeDependencyResult: Equatable, Identifiable, Sendable {
  let requirement: AppWelcomeDependencyRequirement
  let state: AppWelcomeDependencyState

  var id: String {
    requirement.id
  }
}

typealias AppWelcomeDependencyRunner = @Sendable (_ program: String, _ args: [String]) async throws -> ProcessOutput

func appWelcomeDependencyRequirements() -> [AppWelcomeDependencyRequirement] {
  [
    AppWelcomeDependencyRequirement(
      id: "git",
      title: "Git",
      summary: "Repository status, branches, and worktrees.",
      installHint: "Install Xcode Command Line Tools or run `brew install git`.",
      program: "git",
      args: ["--version"],
      isRequired: true
    ),
    AppWelcomeDependencyRequirement(
      id: "gh",
      title: "GitHub CLI",
      summary: "GitHub identity, pull requests, and auth-aware workflows.",
      installHint: "Run `brew install gh`.",
      program: "gh",
      args: ["--version"],
      isRequired: true
    ),
    AppWelcomeDependencyRequirement(
      id: "tmux",
      title: "tmux",
      summary: "Persistent shell sessions inside workspaces.",
      installHint: "Run `brew install tmux`.",
      program: "tmux",
      args: ["-V"],
      isRequired: true
    ),
    AppWelcomeDependencyRequirement(
      id: "docker",
      title: "Docker",
      summary: "Image-backed stack services and container workflows.",
      installHint: "Install Docker Desktop if your projects use image services.",
      program: "docker",
      args: ["--version"],
      isRequired: false
    ),
  ]
}

func appWelcomeInitialDependencyResults() -> [AppWelcomeDependencyResult] {
  appWelcomeDependencyRequirements().map { requirement in
    AppWelcomeDependencyResult(requirement: requirement, state: .checking)
  }
}

func appWelcomeRequiredDependenciesReady(
  _ results: [AppWelcomeDependencyResult]
) -> Bool {
  results.allSatisfy { result in
    if !result.requirement.isRequired {
      return true
    }

    if case .installed = result.state {
      return true
    }

    return false
  }
}

func appWelcomeMissingDependencies(
  _ results: [AppWelcomeDependencyResult]
) -> [AppWelcomeDependencyResult] {
  results.filter { result in
    if case .missing = result.state {
      return true
    }

    return false
  }
}

func appWelcomeDependencyVersionSummary(_ output: ProcessOutput) -> String? {
  let rawText = [output.stdout, output.stderr]
    .first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    ?? ""
  let line = rawText
    .split(whereSeparator: \.isNewline)
    .first
    .map(String.init)?
    .trimmingCharacters(in: .whitespacesAndNewlines)

  guard let line, !line.isEmpty else {
    return nil
  }

  return line
}

func resolveAppWelcomeDependencies(
  requirements: [AppWelcomeDependencyRequirement] = appWelcomeDependencyRequirements(),
  runner: @escaping AppWelcomeDependencyRunner = { program, args in
    try await ProcessRunner.run(
      program: program,
      args: args,
      allowNonZeroExit: true
    )
  }
) async -> [AppWelcomeDependencyResult] {
  var resolved = requirements.map { requirement in
    AppWelcomeDependencyResult(requirement: requirement, state: .checking)
  }

  await withTaskGroup(of: (Int, AppWelcomeDependencyResult).self) { group in
    for (index, requirement) in requirements.enumerated() {
      group.addTask {
        do {
          let output = try await runner(requirement.program, requirement.args)
          if output.exitCode == 0 {
            return (
              index,
              AppWelcomeDependencyResult(
                requirement: requirement,
                state: .installed(appWelcomeDependencyVersionSummary(output) ?? "Installed")
              )
            )
          }

          return (
            index,
            AppWelcomeDependencyResult(
              requirement: requirement,
              state: .missing(appWelcomeDependencyVersionSummary(output))
            )
          )
        } catch {
          return (
            index,
            AppWelcomeDependencyResult(
              requirement: requirement,
              state: .missing(error.localizedDescription)
            )
          )
        }
      }
    }

    for await (index, result) in group {
      resolved[index] = result
    }
  }

  return resolved
}
