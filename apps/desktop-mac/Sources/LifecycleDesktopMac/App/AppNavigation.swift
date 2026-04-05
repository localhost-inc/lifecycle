import Foundation

enum AppTopLevelDestination: Hashable {
  case settings
}

enum AppRoute: Hashable {
  case workspace(id: String)
  case settings

  init?(url: URL) {
    let components = url.pathComponents.filter { $0 != "/" }

    if components == ["settings"] {
      self = .settings
      return
    }

    if components.count == 2,
      components[0] == "workspaces",
      !components[1].isEmpty
    {
      let workspaceID = components[1]
      self = .workspace(id: workspaceID)
      return
    }

    return nil
  }

  var path: String {
    switch self {
    case let .workspace(id):
      return "/workspaces/\(id)"
    case .settings:
      return "/settings"
    }
  }
}
