import { Ghostty } from "ghostty-web";

let ghosttyRuntimePromise: Promise<Ghostty> | null = null;

export function getGhosttyRuntime(): Promise<Ghostty> {
  ghosttyRuntimePromise ??= Ghostty.load();
  return ghosttyRuntimePromise;
}
