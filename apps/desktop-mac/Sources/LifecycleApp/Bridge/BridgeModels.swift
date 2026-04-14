import Foundation
import LifecyclePresentation

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

struct BridgeWorkspaceStackResponse: Decodable {
  let stack: BridgeWorkspaceStackSummary
}

struct BridgeWorkspaceStackMutationResponse: Decodable {
  let stack: BridgeWorkspaceStackSummary
  let workspaceId: String
  let startedServices: [String]?
  let stoppedServices: [String]?
}

struct BridgeWorkspaceLogsResponse: Decodable, Equatable {
  let cursor: String
  let lines: [BridgeWorkspaceLogLine]
}

struct BridgeWorkspaceLogLine: Decodable, Equatable {
  let service: String
  let stream: String
  let text: String
  let timestamp: String
}

struct BridgeWorkspaceStackSummary: Decodable, Equatable {
  let workspaceID: String
  let state: String
  let errors: [String]
  let nodes: [BridgeStackNode]

  enum CodingKeys: String, CodingKey {
    case workspaceID = "workspace_id"
    case state
    case errors
    case nodes
  }
}

struct BridgeStackNode: Decodable, Equatable, Identifiable {
  let workspaceID: String
  let name: String
  let kind: String
  let dependsOn: [String]
  let status: String?
  let statusReason: String?
  let assignedPort: Int?
  let previewURL: String?
  let createdAt: String?
  let updatedAt: String?
  let runOn: String?
  let command: String?
  let writeFilesCount: Int?

  var id: String {
    "\(workspaceID):\(name)"
  }

  var isManagedNode: Bool {
    kind == "process" || kind == "image"
  }

  enum CodingKeys: String, CodingKey {
    case workspaceID = "workspace_id"
    case name
    case kind
    case dependsOn = "depends_on"
    case status
    case statusReason = "status_reason"
    case assignedPort = "assigned_port"
    case previewURL = "preview_url"
    case createdAt = "created_at"
    case updatedAt = "updated_at"
    case runOn = "run_on"
    case command
    case writeFilesCount = "write_files_count"
  }
}

struct BridgeAgentRecord: Decodable, Equatable, Identifiable {
  let id: String
  let workspaceID: String
  let provider: String
  let providerID: String?
  let title: String
  let status: String
  let lastMessageAt: String?
  let createdAt: String
  let updatedAt: String

  enum CodingKeys: String, CodingKey {
    case id
    case workspaceID = "workspace_id"
    case provider
    case providerID = "provider_id"
    case title
    case status
    case lastMessageAt = "last_message_at"
    case createdAt = "created_at"
    case updatedAt = "updated_at"
  }
}

struct BridgeAgentUsage: Decodable, Equatable {
  let inputTokens: Int
  let outputTokens: Int
  let cacheReadTokens: Int?

  enum CodingKeys: String, CodingKey {
    case inputTokens
    case outputTokens
    case cacheReadTokens
  }
}

enum BridgeJSONValue: Decodable, Equatable {
  case string(String)
  case number(Double)
  case bool(Bool)
  case array([BridgeJSONValue])
  case object([String: BridgeJSONValue])
  case null

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()

    if container.decodeNil() {
      self = .null
      return
    }

    if let bool = try? container.decode(Bool.self) {
      self = .bool(bool)
      return
    }

    if let int = try? container.decode(Int.self) {
      self = .number(Double(int))
      return
    }

    if let double = try? container.decode(Double.self) {
      self = .number(double)
      return
    }

    if let string = try? container.decode(String.self) {
      self = .string(string)
      return
    }

    if let array = try? container.decode([BridgeJSONValue].self) {
      self = .array(array)
      return
    }

    if let object = try? container.decode([String: BridgeJSONValue].self) {
      self = .object(object)
      return
    }

    throw DecodingError.dataCorruptedError(
      in: container,
      debugDescription: "Unsupported JSON value."
    )
  }
}

struct BridgeAgentSocketEvent: Decodable, Equatable {
  let type: String
  let kind: String?
  let occurredAt: String?
  let workspaceID: String?
  let agentID: String?
  let turnID: String?
  let messageID: String?
  let partID: String?
  let role: String?
  let status: String?
  let detail: String?
  let error: String?
  let eventType: String?
  let provider: String?
  let authenticated: Bool?
  let mode: String?
  let agent: BridgeAgentRecord?
  let usage: BridgeAgentUsage?
  let costUSD: Double?
  let part: BridgeJSONValue?
  let toolCall: BridgeJSONValue?
  let approval: BridgeJSONValue?
  let resolution: BridgeJSONValue?
  let artifact: BridgeJSONValue?
  let payload: BridgeJSONValue?
  let projectedMessage: BridgeAgentMessage?

  var resolvedWorkspaceID: String? {
    workspaceID ?? agent?.workspaceID
  }

  var resolvedAgentID: String? {
    agentID ?? agent?.id ?? projectedMessage?.agentID
  }

  enum CodingKeys: String, CodingKey {
    case type
    case kind
    case occurredAt
    case workspaceID = "workspaceId"
    case agentID = "agentId"
    case turnID = "turnId"
    case messageID = "messageId"
    case partID = "partId"
    case role
    case status
    case detail
    case error
    case eventType
    case provider
    case authenticated
    case mode
    case agent
    case usage
    case costUSD = "costUsd"
    case part
    case toolCall
    case approval
    case resolution
    case artifact
    case payload
    case projectedMessage
  }
}

struct BridgeAgentsResponse: Decodable {
  let agents: [BridgeAgentRecord]
}

struct BridgeAgentCreateResponse: Decodable {
  let agent: BridgeAgentRecord
}

struct BridgeAgentMutationAcceptedResponse: Decodable {
  let accepted: Bool
  let agentID: String?
  let turnID: String?
  let approvalID: String?

  enum CodingKeys: String, CodingKey {
    case accepted
    case agentID = "agentId"
    case turnID = "turnId"
    case approvalID = "approvalId"
  }
}

enum BridgeAgentProvider: String, CaseIterable, Identifiable, Decodable {
  case claude
  case codex

  var id: String { rawValue }

  var label: String {
    switch self {
    case .claude:
      "Claude"
    case .codex:
      "Codex"
    }
  }

  var iconName: String {
    switch self {
    case .claude:
      "sparkle"
    case .codex:
      "chevron.left.forwardslash.chevron.right"
    }
  }
}

enum BridgeAgentApprovalDecision: String, CaseIterable, Identifiable {
  case approveOnce = "approve_once"
  case approveSession = "approve_session"
  case reject

  var id: String { rawValue }

  var label: String {
    switch self {
    case .approveOnce:
      "Approve Once"
    case .approveSession:
      "Approve Session"
    case .reject:
      "Reject"
    }
  }
}

struct BridgeAgentSnapshotEnvelope: Decodable, Equatable {
  let agent: BridgeAgentRecord
  let messages: [BridgeAgentMessage]
}

struct BridgeAgentMessage: Decodable, Equatable, Identifiable {
  let id: String
  let agentID: String
  let role: String
  let text: String
  let turnID: String?
  let parts: [BridgeAgentMessagePart]
  let createdAt: String

  enum CodingKeys: String, CodingKey {
    case id
    case agentID = "agent_id"
    case role
    case text
    case turnID = "turn_id"
    case parts
    case createdAt = "created_at"
  }
}

struct BridgeAgentMessagePart: Decodable, Equatable, Identifiable {
  let id: String
  let messageID: String
  let agentID: String
  let partIndex: Int
  let partType: String
  let text: String?
  let data: String?
  let createdAt: String

  enum CodingKeys: String, CodingKey {
    case id
    case messageID = "message_id"
    case agentID = "agent_id"
    case partIndex = "part_index"
    case partType = "part_type"
    case text
    case data
    case createdAt = "created_at"
  }

  func decodeData<T: Decodable>(as _: T.Type) -> T? {
    guard let data,
          let jsonData = data.data(using: .utf8)
    else {
      return nil
    }

    return try? JSONDecoder().decode(T.self, from: jsonData)
  }
}

struct BridgeAgentApprovalPartData: Decodable, Equatable {
  let approvalID: String
  let decision: String?
  let kind: String?
  let message: String?
  let status: String?

  enum CodingKeys: String, CodingKey {
    case approvalID = "approval_id"
    case decision
    case kind
    case message
    case status
  }
}

struct BridgeAgentToolCallPartData: Decodable, Equatable {
  let toolCallID: String
  let toolName: String
  let inputJSON: String?
  let outputJSON: String?
  let status: String?
  let errorText: String?

  enum CodingKeys: String, CodingKey {
    case toolCallID = "tool_call_id"
    case toolName = "tool_name"
    case inputJSON = "input_json"
    case outputJSON = "output_json"
    case status
    case errorText = "error_text"
  }
}

struct BridgeAgentToolResultPartData: Decodable, Equatable {
  let toolCallID: String
  let outputJSON: String?
  let errorText: String?

  enum CodingKeys: String, CodingKey {
    case toolCallID = "tool_call_id"
    case outputJSON = "output_json"
    case errorText = "error_text"
  }
}

struct BridgeAgentAttachmentRefPartData: Decodable, Equatable {
  let attachmentID: String

  enum CodingKeys: String, CodingKey {
    case attachmentID = "attachment_id"
  }
}

struct BridgeAgentArtifactRefPartData: Decodable, Equatable {
  let artifactID: String
  let artifactType: String?
  let title: String?
  let uri: String?

  enum CodingKeys: String, CodingKey {
    case artifactID = "artifact_id"
    case artifactType = "artifact_type"
    case title
    case uri
  }
}

struct BridgeAgentImagePartData: Decodable, Equatable {
  let mediaType: String
  let base64Data: String

  enum CodingKeys: String, CodingKey {
    case mediaType = "media_type"
    case base64Data = "base64_data"
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
  let providers: BridgeProviderSettings
  let terminal: BridgeTerminalSettings
}

struct BridgeAppearanceSettings: Decodable, Equatable {
  let theme: String
}

struct BridgeProviderSettings: Decodable, Equatable {
  let claude: BridgeClaudeProviderSettings
}

struct BridgeClaudeProviderSettings: Decodable, Equatable {
  let loginMethod: String

  enum CodingKeys: String, CodingKey {
    case loginMethod = "loginMethod"
  }
}

struct BridgeTerminalSettings: Decodable, Equatable {
  let command: BridgeTerminalCommandSettings
  let persistence: BridgeTerminalPersistenceSettings
  let defaultProfile: String
  let profiles: [String: BridgeTerminalLaunchProfile]

  enum CodingKeys: String, CodingKey {
    case command
    case persistence
    case defaultProfile = "defaultProfile"
    case profiles
  }
}

struct BridgeTerminalCommandSettings: Decodable, Equatable {
  let program: String?
}

struct BridgeTerminalPersistenceSettings: Decodable, Equatable {
  let backend: String
  let mode: String
  let executablePath: String?
}

struct BridgeTerminalLaunchProfile: Decodable, Equatable {
  let launcher: String
  let label: String?
  let command: BridgeTerminalProfileCommand?
  let settings: BridgeTerminalLaunchProfileSettings?
}

struct BridgeTerminalProfileCommand: Decodable, Equatable {
  let program: String
  let args: [String]
  let env: [String: String]
}

struct BridgeTerminalLaunchProfileSettings: Decodable, Equatable {
  let model: String?
  let permissionMode: String?
  let effort: String?
  let configProfile: String?
  let approvalPolicy: String?
  let sandboxMode: String?
  let reasoningEffort: String?
  let webSearch: String?

  enum CodingKeys: String, CodingKey {
    case model
    case permissionMode = "permissionMode"
    case effort
    case configProfile = "configProfile"
    case approvalPolicy = "approvalPolicy"
    case sandboxMode = "sandboxMode"
    case reasoningEffort = "reasoningEffort"
    case webSearch = "webSearch"
  }
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
  let workspaceRoot: String?
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
    case workspaceRoot = "workspace_root"
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

enum BridgeTerminalKind: String, CaseIterable, Identifiable {
  case shell
  case claude
  case codex
  case custom

  var id: String { rawValue }

  static var creatableCases: [BridgeTerminalKind] {
    [.shell, .claude, .codex]
  }

  var displayTitle: String {
    switch self {
    case .shell:
      return "Shell"
    case .claude:
      return "Claude"
    case .codex:
      return "Codex"
    case .custom:
      return "Custom"
    }
  }

  var systemImage: String {
    switch self {
    case .shell:
      return "terminal"
    case .claude:
      return "sparkles"
    case .codex:
      return "chevron.left.forwardslash.chevron.right"
    case .custom:
      return "slider.horizontal.3"
    }
  }
}

struct BridgeTerminalRecord: Decodable, Hashable, Identifiable {
  let id: String
  let title: String
  let kind: String
  let busy: Bool

  init(
    id: String,
    title: String,
    kind: String,
    busy: Bool
  ) {
    self.id = canonicalTmuxTerminalID(id)
    self.title = title
    self.kind = kind
    self.busy = busy
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.init(
      id: try container.decode(String.self, forKey: .id),
      title: try container.decode(String.self, forKey: .title),
      kind: try container.decode(String.self, forKey: .kind),
      busy: try container.decode(Bool.self, forKey: .busy)
    )
  }

  enum CodingKeys: String, CodingKey {
    case id
    case title
    case kind
    case busy
  }
}

struct BridgeTerminalConnection: Decodable, Hashable {
  let connectionID: String
  let terminalID: String
  let launchError: String?
  let transport: BridgeTerminalTransport?

  init(
    connectionID: String,
    terminalID: String,
    launchError: String?,
    transport: BridgeTerminalTransport?
  ) {
    self.connectionID = connectionID
    self.terminalID = canonicalTmuxTerminalID(terminalID)
    self.launchError = launchError
    self.transport = transport
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.init(
      connectionID: try container.decode(String.self, forKey: .connectionID),
      terminalID: try container.decode(String.self, forKey: .terminalID),
      launchError: try container.decodeIfPresent(String.self, forKey: .launchError),
      transport: try container.decodeIfPresent(BridgeTerminalTransport.self, forKey: .transport)
    )
  }

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

// MARK: - Auth

struct BridgeAuthState: Decodable {
  let authenticated: Bool
  let userId: String?
  let email: String?
  let displayName: String?
  let activeOrgId: String?
  let activeOrgSlug: String?
  let gitProfile: BridgeGitProfile?
}

struct BridgeGitProfile: Decodable {
  let name: String?
  let email: String?
  let login: String?
  let avatarUrl: String?
}

struct BridgeOrganization: Decodable, Identifiable, Hashable {
  let id: String
  let name: String
  let slug: String
  let role: String?
}

struct BridgeOrganizationsResponse: Decodable {
  let organizations: [BridgeOrganization]
}

struct BridgeErrorEnvelope: Decodable {
  struct Payload: Decodable {
    let code: String
    let message: String
  }

  let error: Payload
}

enum BridgeProviderAuthState: String, Decodable {
  case notChecked = "not_checked"
  case checking
  case authenticating
  case authenticated
  case unauthenticated
  case error
}

struct BridgeProviderAuthStatus: Decodable, Equatable {
  let state: BridgeProviderAuthState
  let email: String?
  let organization: String?
  let output: [String]?
  let message: String?

  init(
    state: BridgeProviderAuthState,
    email: String? = nil,
    organization: String? = nil,
    output: [String]? = nil,
    message: String? = nil
  ) {
    self.state = state
    self.email = email
    self.organization = organization
    self.output = output
    self.message = message
  }

  static let notChecked = BridgeProviderAuthStatus(state: .notChecked)
  static let checking = BridgeProviderAuthStatus(state: .checking)

  static func authenticating(output: [String] = []) -> BridgeProviderAuthStatus {
    BridgeProviderAuthStatus(state: .authenticating, output: output)
  }

  static func error(_ message: String) -> BridgeProviderAuthStatus {
    BridgeProviderAuthStatus(state: .error, message: message)
  }
}

struct BridgeProviderAuthEnvelope: Decodable, Equatable {
  let provider: BridgeAgentProvider
  let status: BridgeProviderAuthStatus
}

func shellEscape(_ value: String) -> String {
  if value.isEmpty {
    return "''"
  }

  return "'" + value.replacingOccurrences(of: "'", with: "'\"'\"'") + "'"
}
