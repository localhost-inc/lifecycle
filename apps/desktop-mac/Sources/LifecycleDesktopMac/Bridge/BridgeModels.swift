import Foundation

struct BridgeRepositoriesResponse: Decodable {
  let repositories: [BridgeRepository]
}

struct BridgeRepository: Decodable, Identifiable, Hashable {
  let id: String
  let name: String
  let source: String
  let path: String
  let workspaces: [BridgeWorkspaceSummary]
}

struct BridgeWorkspaceSummary: Decodable, Identifiable, Hashable {
  let id: String
  let name: String
  let host: String
  let status: String
  let ref: String?
  let path: String?
}

struct BridgeWorkspaceActivityResponse: Decodable {
  let workspaces: [BridgeWorkspaceActivity]
}

struct BridgeWorkspaceActivity: Decodable, Identifiable, Hashable {
  let id: String
  let repo: String
  let name: String
  let busy: Bool
  let activityAt: Int?

  enum CodingKeys: String, CodingKey {
    case id
    case repo
    case name
    case busy
    case activityAt = "activity_at"
  }
}

struct BridgeWorkspaceShellEnvelope: Decodable {
  let workspace: BridgeWorkspaceScope
  let shell: BridgeShellRuntime
}

struct BridgeWorkspaceTerminalsEnvelope: Decodable {
  let workspace: BridgeWorkspaceScope
  let runtime: BridgeTerminalRuntime
  let terminals: [BridgeTerminalRecord]
}

struct BridgeWorkspaceTerminalEnvelope: Decodable {
  let workspace: BridgeWorkspaceScope
  let runtime: BridgeTerminalRuntime
  let terminal: BridgeTerminalRecord
}

struct BridgeWorkspaceTerminalConnectionEnvelope: Decodable {
  let workspace: BridgeWorkspaceScope
  let runtime: BridgeTerminalRuntime
  let connection: BridgeTerminalConnection
}

struct BridgeSettingsEnvelope: Decodable {
  let settings: BridgeSettings
  let settingsPath: String

  enum CodingKeys: String, CodingKey {
    case settings
    case settingsPath = "settings_path"
  }
}

struct BridgeSettings: Decodable, Equatable {
  let appearance: BridgeAppearanceSettings
  let terminal: BridgeTerminalSettings
}

struct BridgeAppearanceSettings: Decodable, Equatable {
  let theme: String
}

struct BridgeTerminalSettings: Decodable, Equatable {
  let command: BridgeTerminalCommandSettings
  let persistence: BridgeTerminalPersistenceSettings
}

struct BridgeTerminalCommandSettings: Decodable, Equatable {
  let program: String?
}

struct BridgeTerminalPersistenceSettings: Decodable, Equatable {
  let backend: String
  let mode: String
  let executablePath: String?
}

struct BridgeWorkspaceScope: Decodable, Hashable {
  let binding: String
  let workspaceID: String?
  let workspaceName: String
  let repoName: String?
  let host: String
  let status: String?
  let sourceRef: String?
  let cwd: String?
  let worktreePath: String?
  let resolutionNote: String?
  let resolutionError: String?

  enum CodingKeys: String, CodingKey {
    case binding
    case workspaceID = "workspace_id"
    case workspaceName = "workspace_name"
    case repoName = "repo_name"
    case host
    case status
    case sourceRef = "source_ref"
    case cwd
    case worktreePath = "worktree_path"
    case resolutionNote = "resolution_note"
    case resolutionError = "resolution_error"
  }
}

struct BridgeShellRuntime: Decodable, Hashable {
  let backendLabel: String
  let launchError: String?
  let persistent: Bool
  let sessionName: String?
  let prepare: BridgeShellLaunchSpec?
  let spec: BridgeShellLaunchSpec?

  enum CodingKeys: String, CodingKey {
    case backendLabel = "backend_label"
    case launchError = "launch_error"
    case persistent
    case sessionName = "session_name"
    case prepare
    case spec
  }
}

struct BridgeTerminalRuntime: Decodable, Hashable {
  let backendLabel: String
  let runtimeID: String?
  let launchError: String?
  let persistent: Bool
  let supportsCreate: Bool
  let supportsClose: Bool
  let supportsConnect: Bool
  let supportsRename: Bool

  enum CodingKeys: String, CodingKey {
    case backendLabel = "backend_label"
    case runtimeID = "runtime_id"
    case launchError = "launch_error"
    case persistent
    case supportsCreate = "supports_create"
    case supportsClose = "supports_close"
    case supportsConnect = "supports_connect"
    case supportsRename = "supports_rename"
  }
}

struct BridgeTerminalRecord: Decodable, Hashable, Identifiable {
  let id: String
  let title: String
  let kind: String
  let busy: Bool
  let closable: Bool
}

struct BridgeTerminalConnection: Decodable, Hashable {
  let connectionID: String
  let terminalID: String
  let launchError: String?
  let transport: BridgeTerminalTransport?

  enum CodingKeys: String, CodingKey {
    case connectionID = "connection_id"
    case terminalID = "terminal_id"
    case launchError = "launch_error"
    case transport
  }
}

enum BridgeTerminalTransport: Decodable, Hashable {
  case spawn(BridgeTerminalSpawnTransport)
  case stream(BridgeTerminalStreamTransport)

  private enum CodingKeys: String, CodingKey {
    case kind
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    switch try container.decode(String.self, forKey: .kind) {
    case "spawn":
      self = .spawn(try BridgeTerminalSpawnTransport(from: decoder))
    case "stream":
      self = .stream(try BridgeTerminalStreamTransport(from: decoder))
    default:
      throw DecodingError.dataCorruptedError(
        forKey: .kind,
        in: container,
        debugDescription: "Unsupported terminal transport."
      )
    }
  }
}

struct BridgeTerminalSpawnTransport: Decodable, Hashable {
  let kind: String
  let prepare: BridgeShellLaunchSpec?
  let spec: BridgeShellLaunchSpec?
}

struct BridgeTerminalStreamTransport: Decodable, Hashable {
  let kind: String
  let streamID: String
  let websocketPath: String
  let token: String
  let protocolName: String

  enum CodingKeys: String, CodingKey {
    case kind
    case streamID = "streamId"
    case websocketPath
    case token
    case protocolName = "protocol"
  }
}

struct BridgeShellLaunchSpec: Decodable, Hashable {
  let program: String
  let args: [String]
  let cwd: String?
  let env: [[String]]

  var envPairs: [(String, String)] {
    env.compactMap { pair in
      guard pair.count == 2 else {
        return nil
      }

      return (pair[0], pair[1])
    }
  }

  var displayCommand: String {
    ([program] + args).map(shellEscape).joined(separator: " ")
  }

  var shellCommand: String {
    let envArgs = envPairs.map { "\($0.0)=\($0.1)" }
    return (["env"] + envArgs + [program] + args).map(shellEscape).joined(separator: " ")
  }
}

func bridgeTerminalCommandText(_ connection: BridgeTerminalConnection) -> String? {
  guard let transport = connection.transport else {
    return nil
  }

  switch transport {
  case let .spawn(spawnTransport):
    return bridgeSpawnShellCommand(spawnTransport)
  case .stream:
    return nil
  }
}

private func bridgeSpawnShellCommand(_ transport: BridgeTerminalSpawnTransport) -> String? {
  let prepareCommand = transport.prepare?.shellCommand
  let execCommand = transport.spec.map { "exec \($0.shellCommand)" }

  let script: String?
  switch (prepareCommand, execCommand) {
  case let (.some(prepare), .some(execCommand)):
    script = "\(prepare) && \(execCommand)"
  case let (.some(prepare), .none):
    script = prepare
  case let (.none, .some(execCommand)):
    script = execCommand
  case (.none, .none):
    script = nil
  }

  guard let script else {
    return nil
  }

  return ["/bin/sh", "-c", script].map(shellEscape).joined(separator: " ")
}

struct BridgeErrorEnvelope: Decodable {
  struct Payload: Decodable {
    let code: String
    let message: String
  }

  let error: Payload
}

func shellEscape(_ value: String) -> String {
  if value.isEmpty {
    return "''"
  }

  return "'" + value.replacingOccurrences(of: "'", with: "'\"'\"'") + "'"
}
