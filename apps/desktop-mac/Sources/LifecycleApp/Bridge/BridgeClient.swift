import Foundation
import OpenAPIRuntime

@MainActor
struct BridgeClient {
  let baseURL: URL
  private let decoder = JSONDecoder()
  private let encoder = JSONEncoder()
  private let client: Client
  private let longRunningClient: Client

  init(baseURL: URL) {
    self.baseURL = baseURL
    self.client = BridgeOpenAPIClientFactory.make(baseURL: baseURL)
    self.longRunningClient = BridgeOpenAPIClientFactory.make(
      baseURL: baseURL,
      timeoutInterval: 600
    )
  }

  func authState() async throws -> BridgeAuthState {
    let output = try await perform(method: "GET", path: "auth/me") {
      try await client.getAuthMe()
    }

    switch output {
    case let .ok(ok):
      return try decodePayload(try ok.body.json, as: BridgeAuthState.self)
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "GET",
        path: "auth/me"
      )
    }
  }

  func providerAuthStatus(
    for provider: BridgeAgentProvider
  ) async throws -> BridgeProviderAuthStatus {
    let output = try await perform(method: "GET", path: "auth/providers/\(provider.rawValue)") {
      try await client.getAuthProvidersByProvider(
        path: .init(provider: openAPIProvider(for: provider))
      )
    }

    switch output {
    case let .ok(ok):
      let envelope = try decodePayload(try ok.body.json, as: BridgeProviderAuthEnvelope.self)
      return envelope.status
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "GET",
        path: "auth/providers/\(provider.rawValue)"
      )
    }
  }

  func loginProvider(
    _ provider: BridgeAgentProvider
  ) async throws -> BridgeProviderAuthStatus {
    let requestBody = try decodeJSONObject(
      [:],
      as: Operations.PostAuthProvidersByProviderLogin.Input.Body.JsonPayload.self
    )
    let path = "auth/providers/\(provider.rawValue)/login"
    let output = try await perform(method: "POST", path: path) {
      try await longRunningClient.postAuthProvidersByProviderLogin(
        path: .init(provider: openAPIProvider(for: provider)),
        body: .json(requestBody)
      )
    }

    switch output {
    case let .ok(ok):
      let envelope = try decodePayload(try ok.body.json, as: BridgeProviderAuthEnvelope.self)
      return envelope.status
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "POST",
        path: path
      )
    }
  }

  func organizations() async throws -> [BridgeOrganization] {
    let output = try await perform(method: "GET", path: "organizations") {
      try await client.getOrganizations()
    }

    switch output {
    case let .ok(ok):
      let response = try decodePayload(try ok.body.json, as: BridgeOrganizationsResponse.self)
      return response.organizations
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "GET",
        path: "organizations"
      )
    }
  }

  func repositories() async throws -> [BridgeRepository] {
    let output = try await perform(method: "GET", path: "repos") {
      try await client.getRepos()
    }

    switch output {
    case let .ok(ok):
      let response = try decodePayload(try ok.body.json, as: BridgeRepositoriesResponse.self)
      return response.repositories
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "GET",
        path: "repos"
      )
    }
  }

  func createRepository(
    path: String,
    name: String,
    rootWorkspaceName: String,
    sourceRef: String
  ) async throws -> BridgeRepositoryCreateResponse {
    let requestBody = Operations.PostRepos.Input.Body.JsonPayload(
      path: path,
      name: name,
      rootWorkspace: .init(
        name: rootWorkspaceName,
        sourceRef: sourceRef,
        workspaceRoot: path
      )
    )
    let output = try await perform(method: "POST", path: "repos") {
      try await client.postRepos(body: .json(requestBody))
    }

    switch output {
    case let .ok(ok):
      return try decodePayload(try ok.body.json, as: BridgeRepositoryCreateResponse.self)
    case let .created(created):
      return try decodePayload(try created.body.json, as: BridgeRepositoryCreateResponse.self)
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "POST",
        path: "repos"
      )
    }
  }

  func createWorkspace(
    repoPath: String,
    name: String,
    sourceRef: String,
    host: String = "local"
  ) async throws -> BridgeWorkspaceCreateResponse {
    let requestBody = try decodeJSONObject(
      [
        "repoPath": repoPath,
        "name": name,
        "sourceRef": sourceRef,
        "host": host,
      ],
      as: Operations.PostWorkspaces.Input.Body.JsonPayload.self
    )
    let output = try await perform(method: "POST", path: "workspaces") {
      try await client.postWorkspaces(body: .json(requestBody))
    }

    switch output {
    case let .created(created):
      return try decodePayload(try created.body.json, as: BridgeWorkspaceCreateResponse.self)
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "POST",
        path: "workspaces"
      )
    }
  }

  func archiveWorkspace(
    _ workspaceID: String,
    repoPath: String
  ) async throws -> WorkspaceArchiveResponse {
    let output = try await perform(method: "DELETE", path: "workspaces/\(workspaceID)") {
      try await client.deleteWorkspacesById(
        path: .init(id: workspaceID),
        query: .init(repoPath: repoPath)
      )
    }

    switch output {
    case let .ok(ok):
      return try decodePayload(try ok.body.json, as: WorkspaceArchiveResponse.self)
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "DELETE",
        path: "workspaces/\(workspaceID)"
      )
    }
  }

  func deleteRepository(_ repositoryID: String) async throws {
    let output = try await perform(method: "DELETE", path: "repos/\(repositoryID)") {
      try await client.deleteReposByRepoId(path: .init(repoId: repositoryID))
    }

    switch output {
    case .ok:
      return
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "DELETE",
        path: "repos/\(repositoryID)"
      )
    }
  }

  func settings() async throws -> BridgeSettingsEnvelope {
    let output = try await perform(method: "GET", path: "settings") {
      try await client.getSettings()
    }

    switch output {
    case let .ok(ok):
      return try decodePayload(try ok.body.json, as: BridgeSettingsEnvelope.self)
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "GET",
        path: "settings"
      )
    }
  }

  func updateSettings(_ jsonBody: [String: Any]) async throws -> BridgeSettingsEnvelope {
    let requestBody = try decodeJSONObject(
      jsonBody,
      as: Components.Schemas.LifecycleSettingsUpdate.self
    )
    let output = try await perform(method: "PUT", path: "settings") {
      try await client.putSettings(body: .json(requestBody))
    }

    switch output {
    case let .ok(ok):
      return try decodePayload(try ok.body.json, as: BridgeSettingsEnvelope.self)
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "PUT",
        path: "settings"
      )
    }
  }

  func shell(for workspaceID: String) async throws -> BridgeWorkspaceShellEnvelope {
    let path = "workspaces/\(workspaceID)/shell"
    let output = try await perform(method: "POST", path: path) {
      try await client.postWorkspacesByIdShell(path: .init(id: workspaceID))
    }

    switch output {
    case let .ok(ok):
      return try decodePayload(try ok.body.json, as: BridgeWorkspaceShellEnvelope.self)
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "POST",
        path: path
      )
    }
  }

  func terminals(for workspaceID: String) async throws -> BridgeWorkspaceTerminalsEnvelope {
    let path = "workspaces/\(workspaceID)/terminals"
    let output = try await perform(method: "GET", path: path) {
      try await client.getWorkspacesByIdTerminals(path: .init(id: workspaceID))
    }

    switch output {
    case let .ok(ok):
      return try decodePayload(try ok.body.json, as: BridgeWorkspaceTerminalsEnvelope.self)
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "GET",
        path: path
      )
    }
  }

  func stack(for workspaceID: String) async throws -> BridgeWorkspaceStackSummary {
    let path = "workspaces/\(workspaceID)/stack"
    let output = try await perform(method: "GET", path: path) {
      try await client.getWorkspacesByIdStack(path: .init(id: workspaceID))
    }

    switch output {
    case let .ok(ok):
      let response = try decodePayload(try ok.body.json, as: BridgeWorkspaceStackResponse.self)
      return response.stack
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "GET",
        path: path
      )
    }
  }

  func startStack(for workspaceID: String) async throws -> BridgeWorkspaceStackMutationResponse {
    let requestBody = try decodeJSONObject(
      [:],
      as: Operations.PostWorkspacesByIdStackStart.Input.Body.JsonPayload.self
    )
    let path = "workspaces/\(workspaceID)/stack/start"
    let output = try await perform(method: "POST", path: path) {
      try await client.postWorkspacesByIdStackStart(
        path: .init(id: workspaceID),
        body: .json(requestBody)
      )
    }

    switch output {
    case let .ok(ok):
      return try decodePayload(try ok.body.json, as: BridgeWorkspaceStackMutationResponse.self)
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "POST",
        path: path
      )
    }
  }

  func stopStack(for workspaceID: String) async throws -> BridgeWorkspaceStackMutationResponse {
    let requestBody = try decodeJSONObject(
      [:],
      as: Operations.PostWorkspacesByIdStackStop.Input.Body.JsonPayload.self
    )
    let path = "workspaces/\(workspaceID)/stack/stop"
    let output = try await perform(method: "POST", path: path) {
      try await client.postWorkspacesByIdStackStop(
        path: .init(id: workspaceID),
        body: .json(requestBody)
      )
    }

    switch output {
    case let .ok(ok):
      return try decodePayload(try ok.body.json, as: BridgeWorkspaceStackMutationResponse.self)
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "POST",
        path: path
      )
    }
  }

  func agents(for workspaceID: String) async throws -> [BridgeAgentRecord] {
    let path = "workspaces/\(workspaceID)/agents"
    let output = try await perform(method: "GET", path: path) {
      try await client.getWorkspacesByIdAgents(path: .init(id: workspaceID))
    }

    switch output {
    case let .ok(ok):
      let response = try decodePayload(try ok.body.json, as: BridgeAgentsResponse.self)
      return response.agents
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "GET",
        path: path
      )
    }
  }

  func agentSnapshot(_ agentID: String) async throws -> BridgeAgentSnapshotEnvelope {
    let path = "agents/\(agentID)"
    let output = try await perform(method: "GET", path: path) {
      try await client.getAgentsByAgentId(path: .init(agentId: agentID))
    }

    switch output {
    case let .ok(ok):
      return try decodePayload(try ok.body.json, as: BridgeAgentSnapshotEnvelope.self)
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "GET",
        path: path
      )
    }
  }

  func startAgent(
    for workspaceID: String,
    provider: BridgeAgentProvider
  ) async throws -> BridgeAgentRecord {
    let requestBody = try decodeJSONObject(
      [
        "provider": provider.rawValue,
        "workspaceId": workspaceID,
      ],
      as: Operations.PostAgents.Input.Body.JsonPayload.self
    )
    let output = try await perform(method: "POST", path: "agents") {
      try await client.postAgents(body: .json(requestBody))
    }

    switch output {
    case let .created(created):
      let response = try decodePayload(try created.body.json, as: BridgeAgentCreateResponse.self)
      return response.agent
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "POST",
        path: "agents"
      )
    }
  }

  func sendAgentTurn(
    agentID: String,
    turnID: String,
    text: String
  ) async throws {
    let path = "agents/\(agentID)/turns"
    let requestBody = try decodeJSONObject(
      [
        "turnId": turnID,
        "input": [
          [
            "type": "text",
            "text": text,
          ],
        ],
      ],
      as: Operations.PostAgentsByAgentIdTurns.Input.Body.JsonPayload.self
    )
    let output = try await perform(method: "POST", path: path) {
      try await client.postAgentsByAgentIdTurns(
        path: .init(agentId: agentID),
        body: .json(requestBody)
      )
    }

    switch output {
    case .accepted:
      return
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "POST",
        path: path
      )
    }
  }

  func cancelAgentTurn(agentID: String, turnID: String? = nil) async throws {
    var requestObject: [String: Any] = [:]
    if let turnID {
      requestObject["turnId"] = turnID
    }

    let path = "agents/\(agentID)/cancel"
    let requestBody = try decodeJSONObject(
      requestObject,
      as: Operations.PostAgentsByAgentIdCancel.Input.Body.JsonPayload.self
    )
    let output = try await perform(method: "POST", path: path) {
      try await client.postAgentsByAgentIdCancel(
        path: .init(agentId: agentID),
        body: .json(requestBody)
      )
    }

    switch output {
    case .accepted:
      return
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "POST",
        path: path
      )
    }
  }

  func resolveAgentApproval(
    agentID: String,
    approvalID: String,
    decision: BridgeAgentApprovalDecision
  ) async throws {
    let path = "agents/\(agentID)/approval"
    let requestBody = try decodeJSONObject(
      [
        "approvalId": approvalID,
        "decision": decision.rawValue,
      ],
      as: Operations.PostAgentsByAgentIdApproval.Input.Body.JsonPayload.self
    )
    let output = try await perform(method: "POST", path: path) {
      try await client.postAgentsByAgentIdApproval(
        path: .init(agentId: agentID),
        body: .json(requestBody)
      )
    }

    switch output {
    case .accepted:
      return
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "POST",
        path: path
      )
    }
  }

  func terminal(for workspaceID: String, terminalID: String) async throws -> BridgeWorkspaceTerminalEnvelope {
    let path = "workspaces/\(workspaceID)/terminals/\(terminalID)"
    let output = try await perform(method: "GET", path: path) {
      try await client.getWorkspacesByIdTerminalsByTerminalId(
        path: .init(id: workspaceID, terminalId: terminalID)
      )
    }

    switch output {
    case let .ok(ok):
      return try decodePayload(try ok.body.json, as: BridgeWorkspaceTerminalEnvelope.self)
    case let .notFound(notFound):
      let bodyData = try encoder.encode(try notFound.body.json)
      throw bridgeResponseError(
        statusCode: 404,
        bodyData: bodyData,
        method: "GET",
        path: path
      )
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "GET",
        path: path
      )
    }
  }

  func createTerminal(
    for workspaceID: String,
    kind: String? = nil,
    title: String? = nil
  ) async throws -> BridgeWorkspaceTerminalEnvelope {
    var requestObject: [String: Any] = [:]
    if let kind, !kind.isEmpty {
      requestObject["kind"] = kind
    }
    if let title, !title.isEmpty {
      requestObject["title"] = title
    }

    let path = "workspaces/\(workspaceID)/terminals"
    let requestBody = try decodeJSONObject(
      requestObject,
      as: Operations.PostWorkspacesByIdTerminals.Input.Body.JsonPayload.self
    )
    let output = try await perform(method: "POST", path: path) {
      try await client.postWorkspacesByIdTerminals(
        path: .init(id: workspaceID),
        body: .json(requestBody)
      )
    }

    switch output {
    case let .created(created):
      return try decodePayload(try created.body.json, as: BridgeWorkspaceTerminalEnvelope.self)
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "POST",
        path: path
      )
    }
  }

  func closeTerminal(for workspaceID: String, terminalID: String) async throws {
    let path = "workspaces/\(workspaceID)/terminals/\(terminalID)"
    let output = try await perform(method: "DELETE", path: path) {
      try await client.deleteWorkspacesByIdTerminalsByTerminalId(
        path: .init(id: workspaceID, terminalId: terminalID)
      )
    }

    switch output {
    case .ok:
      return
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "DELETE",
        path: path
      )
    }
  }

  func connectTerminal(
    for workspaceID: String,
    terminalID: String,
    clientID: String,
    access: String = "interactive",
    preferredTransport: String = "spawn"
  ) async throws -> BridgeWorkspaceTerminalConnectionEnvelope {
    let path = "workspaces/\(workspaceID)/terminals/\(terminalID)/connections"
    let requestBody = try decodeJSONObject(
      [
        "clientId": clientID,
        "access": access,
        "preferredTransport": preferredTransport,
      ],
      as: Operations.PostWorkspacesByIdTerminalsByTerminalIdConnections.Input.Body.JsonPayload.self
    )
    let output = try await perform(method: "POST", path: path) {
      try await client.postWorkspacesByIdTerminalsByTerminalIdConnections(
        path: .init(id: workspaceID, terminalId: terminalID),
        body: .json(requestBody)
      )
    }

    switch output {
    case let .ok(ok):
      return try decodePayload(try ok.body.json, as: BridgeWorkspaceTerminalConnectionEnvelope.self)
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "POST",
        path: path
      )
    }
  }

  func disconnectTerminal(
    for workspaceID: String,
    terminalID: String,
    connectionID: String
  ) async throws {
    let path = "workspaces/\(workspaceID)/terminals/\(terminalID)/connections/\(connectionID)"
    let output = try await perform(method: "DELETE", path: path) {
      try await client.deleteWorkspacesByIdTerminalsByTerminalIdConnectionsByConnectionId(
        path: .init(id: workspaceID, terminalId: terminalID, connectionId: connectionID)
      )
    }

    switch output {
    case .ok:
      return
    case let .undocumented(statusCode, payload):
      throw try await bridgeResponseError(
        statusCode: statusCode,
        payload: payload,
        method: "DELETE",
        path: path
      )
    }
  }

  private func perform<Response>(
    method: String,
    path: String,
    _ operation: () async throws -> Response
  ) async throws -> Response {
    do {
      return try await operation()
    } catch {
      AppLog.error(
        .bridge,
        "Bridge request failed before receiving a response",
        error: error,
        metadata: [
          "method": method,
          "path": path,
        ]
      )
      throw error
    }
  }

  private func decodePayload<Response: Decodable, Payload: Encodable>(
    _ payload: Payload,
    as _: Response.Type
  ) throws -> Response {
    let data = try encoder.encode(payload)
    return try decoder.decode(Response.self, from: data)
  }

  private func decodeJSONObject<Payload: Decodable>(
    _ jsonObject: Any,
    as _: Payload.Type
  ) throws -> Payload {
    guard JSONSerialization.isValidJSONObject(jsonObject) else {
      throw NSError(
        domain: "LifecycleApp.Bridge",
        code: 0,
        userInfo: [NSLocalizedDescriptionKey: "Bridge request body was not valid JSON."]
      )
    }

    let data = try JSONSerialization.data(withJSONObject: jsonObject)
    return try decoder.decode(Payload.self, from: data)
  }

  private func bridgeResponseError(
    statusCode: Int,
    payload: UndocumentedPayload,
    method: String,
    path: String
  ) async throws -> NSError {
    let bodyData = try await undocumentedBodyData(payload.body)
    return bridgeResponseError(
      statusCode: statusCode,
      bodyData: bodyData,
      method: method,
      path: path
    )
  }

  private func bridgeResponseError(
    statusCode: Int,
    bodyData: Data?,
    method: String,
    path: String
  ) -> NSError {
    let fallbackMessage = bodyData.flatMap { String(data: $0, encoding: .utf8) } ?? "Bridge request failed."

    AppLog.error(
      .bridge,
      "Bridge request returned a non-success status",
      metadata: [
        "method": method,
        "path": path,
        "statusCode": String(statusCode),
      ]
    )

    if let bodyData,
       let errorEnvelope = try? decoder.decode(BridgeErrorEnvelope.self, from: bodyData)
    {
      return NSError(
        domain: "LifecycleApp.Bridge",
        code: statusCode,
        userInfo: [NSLocalizedDescriptionKey: errorEnvelope.error.message]
      )
    }

    return NSError(
      domain: "LifecycleApp.Bridge",
      code: statusCode,
      userInfo: [NSLocalizedDescriptionKey: fallbackMessage]
    )
  }

  private func undocumentedBodyData(_ body: HTTPBody?) async throws -> Data? {
    guard let body else {
      return nil
    }

    return try await Data(collecting: body, upTo: .max)
  }

  private func openAPIProvider(
    for provider: BridgeAgentProvider
  ) -> Components.Schemas.BridgeAgentProvider {
    switch provider {
    case .claude:
      .claude
    case .codex:
      .codex
    }
  }
}

func isBridgeConnectivityError(_ error: Error) -> Bool {
  let nsError = error as NSError
  guard nsError.domain == NSURLErrorDomain else {
    return false
  }

  let code = (error as? URLError)?.code ?? URLError.Code(rawValue: nsError.code)

  switch code {
  case .cannotFindHost,
       .cannotConnectToHost,
       .dnsLookupFailed,
       .networkConnectionLost,
       .notConnectedToInternet,
       .timedOut,
       .resourceUnavailable:
    return true
  default:
    return false
  }
}

struct BridgeRepositoryCreateResponse: Decodable {
  let id: String
  let created: Bool
}

struct BridgeWorkspaceCreateResponse: Decodable {
  let id: String
  let repositoryId: String
  let host: String
  let name: String
  let sourceRef: String
  let workspaceRoot: String?
}

struct WorkspaceArchiveResponse: Decodable {
  let archived: Bool
  let name: String
}
