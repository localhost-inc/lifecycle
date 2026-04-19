import { describe, expect, test } from "bun:test";

import { shouldDeliverTopicMessage } from "./server";

describe("bridge websocket delivery", () => {
  test("keeps sending topic events to legacy clients during migration", () => {
    expect(
      shouldDeliverTopicMessage({
        subscribed: false,
        usesTopicSubscriptions: false,
      }),
    ).toBe(true);
  });

  test("requires topic subscriptions for topic-aware clients", () => {
    expect(
      shouldDeliverTopicMessage({
        subscribed: true,
        usesTopicSubscriptions: true,
      }),
    ).toBe(true);

    expect(
      shouldDeliverTopicMessage({
        subscribed: false,
        usesTopicSubscriptions: true,
      }),
    ).toBe(false);
  });
});
