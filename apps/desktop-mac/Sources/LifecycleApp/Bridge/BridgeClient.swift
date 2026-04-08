import Foundation

@MainActor
struct BridgeClient {
  let baseURL: URL
  private let decoder = JSONDecoder()

  func authState() async throws -> BridgeAuthState {
    try await request(path: "auth/me")
  }

  func providerAuthStatus(
    for provider: BridgeAgentProvider
  ) async throws -> BridgeProviderAuthStatus {
    let response: BridgeProviderAuthEnvelope = try await request(
      path: "auth/providers/\(provider.rawValue)"
    )
    return response.status
  }

  func loginProvider(
    _ provider: BridgeAgentProvider
  ) async throws -> BridgeProviderAuthStatus {
    let response: BridgeProviderAuthEnvelope = try await request(
      path: "auth/providers/\(provider.rawValue)/login",
      method: "POST",
      timeoutInterval: 600
    )
    return response.status
  }

  func organizations() async throws -> [BridgeOrganization] {
    let response: BridgeOrganizationsResponse = try await request(path: "organizations")
    return response.organizations
  }

  func repositories() async throws -> [BridgeRepository] {
    let response: BridgeRepositoriesResponse = try await request(path: "repos")
    return response.repositories
  }

  func settings() async throws -> BridgeSettingsEnvelope {
    try await request(path: "settings")
  }

  func updateSettings(_ jsonBody: [String: Any]) async throws -> BridgeSettingsEnvelope {
    try await request(path: "settings", method: "PUT", jsonBody: jsonBody)
  }

  func shell(for workspaceID: String) async throws -> BridgeWorkspaceShellEnvelope {
    try await request(path: "workspaces/\(workspaceID)/shell", method: "POST")
  }

  func terminals(for workspaceID: String) async throws -> BridgeWorkspaceTerminalsEnvelope {
    try await request(path: "workspaces/\(workspaceID)/terminals")
  }

  func stack(for workspaceID: String) async throws -> BridgeWorkspaceStackSummary {
    let response: BridgeWorkspaceStackResponse = try await request(path: "workspaces/\(workspaceID)/stack")
    return response.stack
  }

  func agents(for workspaceID: String) async throws -> [BridgeAgentRecord] {
    let response: BridgeAgentsResponse = try await request(path: "workspaces/\(workspaceID)/agents")
    return response.agents
  }

  func agentSnapshot(_ agentID: String) async throws -> BridgeAgentSnapshotEnvelope {
    try await request(path: "agents/\(agentID)")
  }

  func startAgent(
    for workspaceID: String,
    provider: BridgeAgentProvider
  ) async throws -> BridgeAgentRecord {
    let response: BridgeAgentCreateResponse = try await request(
      path: "agents",
      method: "POST",
      jsonBody: [
        "provider": provider.rawValue,
        "workspaceId": workspaceID,
      ]
    )
    return response.agent
  }

  func sendAgentTurn(
    agentID: String,
    turnID: String,
    text: String
  ) async throws {
    let _: BridgeAgentMutationAcceptedResponse = try await request(
      path: "agents/\(agentID)/turns",
      method: "POST",
      jsonBody: [
        "turnId": turnID,
        "input": [
          [
            "type": "text",
            "text": text,
          ],
        ],
      ]
    )
  }

  func cancelAgentTurn(agentID: String, turnID: String? = nil) async throws {
    var body: [String: Any] = [:]
    if let turnID {
      body["turnId"] = turnID
    }

    let _: BridgeAgentMutationAcceptedResponse = try await request(
      path: "agents/\(agentID)/cancel",
      method: "POST",
      jsonBody: body
    )
  }

  func resolveAgentApproval(
    agentID: String,
    approvalID: String,
    decision: BridgeAgentApprovalDecision
  ) async throws {
    let _: BridgeAgentMutationAcceptedResponse = try await request(
      path: "agents/\(agentID)/approval",
      method: "POST",
      jsonBody: [
        "approvalId": approvalID,
        "decision": decision.rawValue,
      ]
    )
  }

  func terminal(for workspaceID: String, terminalID: String) async throws -> BridgeWorkspaceTerminalEnvelope {
    try await request(path: "workspaces/\(workspaceID)/terminals/\(terminalID)")
  }

  func createTerminal(
    for workspaceID: String,
    kind: String? = nil,
    title: String? = nil
  ) async throws -> BridgeWorkspaceTerminalEnvelope {
    var requestBody: [String: String] = [:]
    if let kind, !kind.isEmpty {
      requestBody["kind"] = kind
    }
    if let title, !title.isEmpty {
      requestBody["title"] = title
    }

    return try await request(
      path: "workspaces/\(workspaceID)/terminals",
      method: "POST",
      jsonBody: requestBody.isEmpty ? nil : requestBody
    )
  }

  func closeTerminal(for workspaceID: String, terminalID: String) async throws {
    let _: EmptyBridgeResponse = try await request(
      path: "workspaces/\(workspaceID)/terminals/\(terminalID)",
      method: "DELETE"
    )
  }

  func connectTerminal(
    for workspaceID: String,
    terminalID: String,
    clientID: String,
    access: String = "interactive",
    preferredTransport: String = "spawn"
  ) async throws -> BridgeWorkspaceTerminalConnectionEnvelope {
    try await request(
      path: "workspaces/\(workspaceID)/terminals/\(terminalID)/connections",
      method: "POST",
      jsonBody: [
        "clientId": clientID,
        "access": access,
        "preferredTransport": preferredTransport,
      ]
    )
  }

  func disconnectTerminal(
    for workspaceID: String,
    terminalID: String,
    connectionID: String
  ) async throws {
    let _: EmptyBridgeResponse = try await request(
      path: "workspaces/\(workspaceID)/terminals/\(terminalID)/connections/\(connectionID)",
      method: "DELETE"
    )
  }

  private func request<Response: Decodable>(
    path: String,
    method: String = "GET",
    jsonBody: Any? = nil,
    timeoutInterval: TimeInterval = 5
  ) async throws -> Response {
    let url = baseURL.appending(path: path)
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = timeoutInterval
    if let jsonBody {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONSerialization.data(withJSONObject: jsonBody)
    }

    let data: Data
    let response: URLResponse

    do {
      (data, response) = try await URLSession.shared.data(for: request)
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

    let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 500

    guard (200..<300).contains(statusCode) else {
      AppLog.error(
        .bridge,
        "Bridge request returned a non-success status",
        metadata: [
          "method": method,
          "path": path,
          "statusCode": String(statusCode),
        ]
      )
      if let errorEnvelope = try? decoder.decode(BridgeErrorEnvelope.self, from: data) {
        throw NSError(
          domain: "LifecycleApp.Bridge",
          code: statusCode,
          userInfo: [NSLocalizedDescriptionKey: errorEnvelope.error.message]
        )
      }

      let message = String(data: data, encoding: .utf8) ?? "Bridge request failed."
      throw NSError(
        domain: "LifecycleApp.Bridge",
        code: statusCode,
        userInfo: [NSLocalizedDescriptionKey: message]
      )
    }

    return try decoder.decode(Response.self, from: data)
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

private struct EmptyBridgeResponse: Decodable {}
