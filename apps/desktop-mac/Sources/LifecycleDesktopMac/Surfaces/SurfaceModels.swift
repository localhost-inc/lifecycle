import Foundation

// MARK: - Canvas Surface Record (persisted tab data)

struct CanvasSurfaceRecord: Identifiable, Hashable {
  let id: String
  let title: String
  let surfaceKind: SurfaceKind
  let binding: SurfaceBinding
}

// MARK: - Resolved Canvas Surface (ready to render)

struct CanvasSurface: Identifiable {
  let id: String
  let title: String
  let surfaceKind: SurfaceKind
  let record: CanvasSurfaceRecord
  let content: AnySurfaceContent
  let tabPresentation: SurfaceTabPresentation
  let isClosable: Bool
}

// MARK: - ID Helpers

func terminalSurfaceID(for workspaceID: String, terminalID: String) -> String {
  "surface:\(workspaceID):\(terminalID)"
}

func terminalHostID(for surfaceID: String) -> String {
  "terminal:\(surfaceID)"
}
