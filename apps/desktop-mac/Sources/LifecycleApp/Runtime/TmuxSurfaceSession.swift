import Foundation

func tmuxSurfaceMirrorSessionName(
  baseSessionName: String,
  surfaceID: String
) -> String {
  "\(sanitizeTmuxSessionComponent(baseSessionName))_surface_\(tmuxSessionHash(surfaceID))"
}

private func sanitizeTmuxSessionComponent(_ value: String) -> String {
  let sanitized = value.map { character -> Character in
    switch character {
    case "a"..."z", "A"..."Z", "0"..."9", "-", "_":
      return character
    default:
      return "-"
    }
  }

  let collapsed = String(sanitized)
    .replacingOccurrences(of: "--+", with: "-", options: .regularExpression)
    .trimmingCharacters(in: CharacterSet(charactersIn: "-"))

  return collapsed.isEmpty ? "workspace" : collapsed
}

private func tmuxSessionHash(_ value: String) -> String {
  var hash: UInt64 = 0xcbf29ce484222325

  for byte in value.utf8 {
    hash ^= UInt64(byte)
    hash &*= 0x100000001b3
  }

  return String(hash, radix: 16, uppercase: false)
}
