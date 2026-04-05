import Foundation

@MainActor
struct BridgeClient {
  let baseURL: URL
  private let decoder = JSONDecoder()

  func repositories() async throws -> [BridgeRepository] {
    let response: BridgeRepositoriesResponse = try await request(path: "repos")
    return response.repositories
  }

  func activity() async throws -> [BridgeWorkspaceActivity] {
    let response: BridgeWorkspaceActivityResponse = try await request(path: "workspaces/activity")
    return response.workspaces
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
    jsonBody: Any? = nil
  ) async throws -> Response {
    let url = baseURL.appending(path: path)
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = 5
    if let jsonBody {
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try JSONSerialization.data(withJSONObject: jsonBody)
    }

    let (data, response) = try await URLSession.shared.data(for: request)
    let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 500

    guard (200..<300).contains(statusCode) else {
      if let errorEnvelope = try? decoder.decode(BridgeErrorEnvelope.self, from: data) {
        throw NSError(
          domain: "LifecycleDesktopMac.Bridge",
          code: statusCode,
          userInfo: [NSLocalizedDescriptionKey: errorEnvelope.error.message]
        )
      }

      let message = String(data: data, encoding: .utf8) ?? "Bridge request failed."
      throw NSError(
        domain: "LifecycleDesktopMac.Bridge",
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
