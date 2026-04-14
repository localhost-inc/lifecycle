import Foundation
import LifecyclePresentation

struct CanvasSurface: Identifiable {
  let id: String
  let surfaceKind: SurfaceKind
  let record: CanvasSurfaceRecord
  let content: AnySurfaceContent
  let tabPresentation: SurfaceTabPresentation
  let isClosable: Bool
}
