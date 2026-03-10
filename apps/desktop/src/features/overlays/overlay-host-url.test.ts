import { describe, expect, test } from "bun:test";
import {
  buildOverlayHostUrl,
  readOverlayHostOwnerWindowLabel,
} from "./overlay-host-url";

describe("overlay host url", () => {
  test("encodes the owner window label into the host route", () => {
    expect(buildOverlayHostUrl("workspace/main")).toBe(
      "/overlay-host?ownerWindowLabel=workspace%2Fmain",
    );
    expect(buildOverlayHostUrl("workspace/main", "http://localhost:1420")).toBe(
      "http://localhost:1420/overlay-host?ownerWindowLabel=workspace%2Fmain",
    );
  });

  test("reads the owner window label back from the host route search params", () => {
    expect(readOverlayHostOwnerWindowLabel("?ownerWindowLabel=workspace%2Fmain")).toBe(
      "workspace/main",
    );
    expect(readOverlayHostOwnerWindowLabel("")).toBeNull();
    expect(readOverlayHostOwnerWindowLabel("?ownerWindowLabel=")).toBeNull();
  });
});
