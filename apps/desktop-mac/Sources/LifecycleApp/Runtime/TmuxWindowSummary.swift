import Foundation

struct TmuxWindowSummary: Identifiable, Hashable {
  let id: String
  let index: Int
  let name: String
  let isActive: Bool
  let paneCount: Int

  var displayTitle: String {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    if !trimmed.isEmpty {
      return trimmed
    }

    return "Tab \(index + 1)"
  }
}
