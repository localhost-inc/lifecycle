import Foundation
import OpenAPIRuntime
import OpenAPIURLSession

enum BridgeOpenAPIClientFactory {
  static func make(baseURL: URL, timeoutInterval: TimeInterval = 5) -> Client {
    let sessionConfiguration = URLSessionConfiguration.default
    sessionConfiguration.timeoutIntervalForRequest = timeoutInterval
    sessionConfiguration.timeoutIntervalForResource = timeoutInterval

    let transport = URLSessionTransport(
      configuration: .init(session: URLSession(configuration: sessionConfiguration))
    )

    return Client(serverURL: baseURL, transport: transport)
  }
}
