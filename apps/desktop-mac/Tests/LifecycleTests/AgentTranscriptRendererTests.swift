import XCTest

@testable import Lifecycle

final class AgentTranscriptRendererTests: XCTestCase {
  func testBuildAgentTranscriptMessagesMergesConsecutiveAssistantMessagesForSameTurn() {
    let messages = [
      makeMessage(
        id: "message-1",
        role: "assistant",
        turnID: "turn-1",
        parts: [
          makeTextPart(id: "part-1", index: 0, text: "Inspecting the workspace."),
        ]
      ),
      makeMessage(
        id: "message-2",
        role: "assistant",
        turnID: "turn-1",
        parts: [
          makeToolCallPart(id: "part-2", index: 0, toolName: "Read"),
        ]
      ),
    ]

    let renderable = buildAgentTranscriptMessages(from: messages)

    XCTAssertEqual(renderable.count, 1)
    XCTAssertEqual(allPartIDs(in: renderable[0]), ["part-1", "part-2"])
    XCTAssertEqual(renderable[0].segments.count, 2)
  }

  func testBuildAgentTranscriptMessagesSummarizesGroupedToolRuns() {
    let messages = [
      makeMessage(
        id: "message-1",
        role: "assistant",
        turnID: "turn-1",
        parts: [
          makeToolCallPart(id: "part-1", index: 0, toolName: "Grep"),
          makeToolCallPart(id: "part-2", index: 1, toolName: "Read"),
          makeToolCallPart(id: "part-3", index: 2, toolName: "command_execution"),
        ]
      ),
    ]

    let renderable = buildAgentTranscriptMessages(from: messages)

    XCTAssertEqual(renderable.count, 1)
    XCTAssertTrue(renderable[0].isToolOnly)

    guard let firstSegment = renderable[0].segments.first,
          case let .toolGroup(group) = firstSegment
    else {
      XCTFail("Expected a tool group segment.")
      return
    }

    XCTAssertEqual(group.summary, "Searched 1 pattern, read 1 file, ran 1 command")
    XCTAssertTrue(group.isCollapsible)
  }

  func testBuildAgentTranscriptMessagesSeparatesDiffProducingTools() {
    let messages = [
      makeMessage(
        id: "message-1",
        role: "assistant",
        turnID: "turn-1",
        parts: [
          makeToolCallPart(id: "part-1", index: 0, toolName: "Read"),
          makeToolCallPart(id: "part-2", index: 1, toolName: "Edit"),
          makeToolCallPart(id: "part-3", index: 2, toolName: "Read"),
        ]
      ),
    ]

    let renderable = buildAgentTranscriptMessages(from: messages)

    XCTAssertEqual(renderable.count, 1)
    XCTAssertEqual(renderable[0].segments.count, 3)
  }

  func testBuildAgentTranscriptMessagesCreatesSyntheticTextPartWhenMessagePartsAreMissing() {
    let messages = [
      makeMessage(
        id: "message-1",
        role: "user",
        text: "Can you fix the renderer?",
        parts: []
      ),
    ]

    let renderable = buildAgentTranscriptMessages(from: messages)

    XCTAssertEqual(renderable.count, 1)

    guard let firstSegment = renderable[0].segments.first,
          case let .contentGroup(group) = firstSegment,
          let firstPart = group.parts.first,
          case let .text(part) = firstPart
    else {
      XCTFail("Expected a synthetic text content group.")
      return
    }

    XCTAssertEqual(part.text, "Can you fix the renderer?")
    XCTAssertEqual(part.id, "message-1:text")
  }

  private func allPartIDs(in message: AgentRenderableMessage) -> [String] {
    message.segments.flatMap { segment in
      switch segment {
      case let .toolGroup(group):
        group.parts.map(\.id)
      case let .contentGroup(group):
        group.parts.map(\.id)
      }
    }
  }

  private func makeMessage(
    id: String,
    role: String,
    turnID: String? = nil,
    text: String = "",
    parts: [BridgeAgentMessagePart]
  ) -> BridgeAgentMessage {
    BridgeAgentMessage(
      id: id,
      agentID: "session-1",
      role: role,
      text: text,
      turnID: turnID,
      parts: parts,
      createdAt: "2026-04-06T18:00:00Z"
    )
  }

  private func makeTextPart(id: String, index: Int, text: String) -> BridgeAgentMessagePart {
    BridgeAgentMessagePart(
      id: id,
      messageID: "message-1",
      agentID: "session-1",
      partIndex: index,
      partType: "text",
      text: text,
      data: nil,
      createdAt: "2026-04-06T18:00:00Z"
    )
  }

  private func makeToolCallPart(
    id: String,
    index: Int,
    toolName: String
  ) -> BridgeAgentMessagePart {
    let data =
      """
      {"tool_call_id":"\(id)-call","tool_name":"\(toolName)","input_json":"{}","output_json":"ok","status":"completed"}
      """

    return BridgeAgentMessagePart(
      id: id,
      messageID: "message-1",
      agentID: "session-1",
      partIndex: index,
      partType: "tool_call",
      text: nil,
      data: data,
      createdAt: "2026-04-06T18:00:00Z"
    )
  }
}
