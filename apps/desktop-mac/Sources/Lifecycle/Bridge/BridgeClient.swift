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
    let _ = provider
    return .error("Custom agent integrations are disabled in this build.")
  }

  func loginProvider(
    _ provider: BridgeAgentProvider
  ) async throws -> BridgeProviderAuthStatus {
    let _ = provider
    throw unsupportedCustomAgentError()
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
    let requestURL = baseURL.appending(path: path)
    var request = URLRequest(url: requestURL)
    request.httpMethod = "GET"

    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      let statusCode = (response as? HTTPURLResponse)?.statusCode ?? -1
      guard (200..<300).contains(statusCode) else {
        throw bridgeResponseError(
          statusCode: statusCode,
          bodyData: data,
          method: "GET",
          path: path
        )
      }

      return try decoder.decode(BridgeWorkspaceTerminalsEnvelope.self, from: data)
    } catch {
      let wrappedError = BridgeRequestError(method: "GET", path: path, underlyingError: error)
      AppLog.error(
        .bridge,
        "Bridge terminal request failed",
        error: wrappedError,
        metadata: [
          "method": "GET",
          "path": path,
        ]
      )
      throw wrappedError
    }
  }

  func activity(for workspaceID: String) async throws -> BridgeWorkspaceActivitySummary {
    let path = "workspaces/\(workspaceID)/activity"
    let requestURL = baseURL.appending(path: path)
    var request = URLRequest(url: requestURL)
    request.httpMethod = "GET"

    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
      guard (200..<300).contains(statusCode) else {
        throw bridgeResponseError(
          statusCode: statusCode,
          bodyData: data,
          method: "GET",
          path: path
        )
      }
      return try decoder.decode(BridgeWorkspaceActivitySummary.self, from: data)
    } catch {
      let wrappedError = BridgeRequestError(method: "GET", path: path, underlyingError: error)
      AppLog.error(
        .bridge,
        "Bridge request failed before receiving a response",
        error: wrappedError,
        metadata: [
          "method": "GET",
          "path": path,
        ]
      )
      throw wrappedError
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

  func workspaceLogs(
    for workspaceID: String,
    service: String? = nil,
    cursor: String? = nil,
    tail: Int? = nil
  ) async throws -> BridgeWorkspaceLogsResponse {
    let path = "workspaces/\(workspaceID)/logs"
    var components = URLComponents(
      url: baseURL.appending(path: path),
      resolvingAgainstBaseURL: false
    )
    components?.queryItems = [
      service.map { URLQueryItem(name: "service", value: $0) },
      cursor.map { URLQueryItem(name: "cursor", value: $0) },
      tail.map { URLQueryItem(name: "tail", value: String($0)) },
    ].compactMap { $0 }

    guard let url = components?.url else {
      throw NSError(
        domain: "Lifecycle.Bridge",
        code: 0,
        userInfo: [NSLocalizedDescriptionKey: "Bridge log request URL was invalid."]
      )
    }

    let data: Data
    let response: URLResponse

    do {
      (data, response) = try await URLSession.shared.data(from: url)
    } catch {
      AppLog.error(
        .bridge,
        "Bridge log request failed before receiving a response",
        error: error,
        metadata: [
          "method": "GET",
          "path": path,
        ]
      )
      throw error
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      throw NSError(
        domain: "Lifecycle.Bridge",
        code: 0,
        userInfo: [NSLocalizedDescriptionKey: "Bridge log response was not an HTTP response."]
      )
    }

    guard (200 ..< 300).contains(httpResponse.statusCode) else {
      throw bridgeResponseError(
        statusCode: httpResponse.statusCode,
        bodyData: data,
        method: "GET",
        path: path
      )
    }

    return try decoder.decode(BridgeWorkspaceLogsResponse.self, from: data)
  }

  func agents(for workspaceID: String) async throws -> [BridgeAgentRecord] {
    let _ = workspaceID
    return []
  }

  func agentSnapshot(_ agentID: String) async throws -> BridgeAgentSnapshotEnvelope {
    let _ = agentID
    throw unsupportedCustomAgentError()
  }

  func startAgent(
    for workspaceID: String,
    provider: BridgeAgentProvider
  ) async throws -> BridgeAgentRecord {
    let _ = workspaceID
    let _ = provider
    throw unsupportedCustomAgentError()
  }

  func sendAgentTurn(
    agentID: String,
    turnID: String,
    text: String
  ) async throws {
    let _ = agentID
    let _ = turnID
    let _ = text
    throw unsupportedCustomAgentError()
  }

  func cancelAgentTurn(agentID: String, turnID: String? = nil) async throws {
    let _ = agentID
    let _ = turnID
    throw unsupportedCustomAgentError()
  }

  func resolveAgentApproval(
    agentID: String,
    approvalID: String,
    decision: BridgeAgentApprovalDecision
  ) async throws {
    let _ = agentID
    let _ = approvalID
    let _ = decision
    throw unsupportedCustomAgentError()
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
    kind: BridgeTerminalKind? = nil,
    title: String? = nil
  ) async throws -> BridgeWorkspaceTerminalEnvelope {
    var requestObject: [String: Any] = [:]
    if let kind {
      requestObject["kind"] = kind.rawValue
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
      let wrappedError = BridgeRequestError(method: method, path: path, underlyingError: error)
      AppLog.error(
        .bridge,
        "Bridge request failed before receiving a response",
        error: wrappedError,
        metadata: [
          "method": method,
          "path": path,
        ]
      )
      throw wrappedError
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
        domain: "Lifecycle.Bridge",
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
        domain: "Lifecycle.Bridge",
        code: statusCode,
        userInfo: [NSLocalizedDescriptionKey: errorEnvelope.error.message]
      )
    }

    return NSError(
      domain: "Lifecycle.Bridge",
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

  private func unsupportedCustomAgentError() -> NSError {
    NSError(
      domain: "Lifecycle.Bridge",
      code: 501,
      userInfo: [
        NSLocalizedDescriptionKey: "Custom agent actions are disabled in this build."
      ]
    )
  }
}

func isBridgeConnectivityError(_ error: Error) -> Bool {
  if let bridgeRequestError = error as? BridgeRequestError {
    return isBridgeConnectivityError(bridgeRequestError.underlyingError)
  }

  if let clientError = error as? ClientError {
    return isBridgeConnectivityError(clientError.underlyingError)
  }

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

struct BridgeRequestError: LocalizedError {
  let method: String
  let path: String
  let underlyingError: Error

  var errorDescription: String? {
    "Bridge request failed: \(method) /\(path). \(underlyingErrorDescription)"
  }

  private var underlyingErrorDescription: String {
    if let clientError = underlyingError as? ClientError {
      return clientError.underlyingError.localizedDescription
    }

    return underlyingError.localizedDescription
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
