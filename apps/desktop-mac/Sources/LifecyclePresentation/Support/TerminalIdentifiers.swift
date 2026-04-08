import Foundation

public func canonicalTmuxTerminalID(_ value: String) -> String {
  let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !trimmed.isEmpty else {
    return trimmed
  }

  if let prefixedRange = trimmed.range(of: "^@?\\d+", options: .regularExpression) {
    let numericID = String(trimmed[prefixedRange]).replacingOccurrences(of: "@", with: "")
    let stripped = numericID.drop(while: { $0 == "0" })
    return "@\(stripped.isEmpty ? "0" : String(stripped))"
  }

  return trimmed
}

public func isTmuxTerminalID(_ value: String) -> Bool {
  value.trimmingCharacters(in: .whitespacesAndNewlines)
    .range(of: "^@\\d+$", options: .regularExpression) != nil
}
