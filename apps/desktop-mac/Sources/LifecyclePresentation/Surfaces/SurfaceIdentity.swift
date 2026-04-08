import Foundation

public struct SurfaceKind: RawRepresentable, Hashable, Sendable, Codable {
  public let rawValue: String

  public init(rawValue: String) {
    self.rawValue = rawValue
  }

  public static let agent = SurfaceKind(rawValue: "agent")
  public static let terminal = SurfaceKind(rawValue: "terminal")
}

public struct SurfaceBinding: Hashable, Codable {
  public let params: [String: String]

  public init(params: [String: String]) {
    self.params = params
  }

  public func string(for key: String) -> String? {
    params[key]
  }
}
