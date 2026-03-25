import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import "streamdown/styles.css";
import "./streamdown.css";

const streamdownPlugins = { code };

export function TextPart({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  return (
    <Streamdown
      className="agent-streamdown min-w-0 text-[13px] leading-6 text-[var(--foreground)]"
      mode={isStreaming ? "streaming" : "static"}
      isAnimating={isStreaming}
      plugins={streamdownPlugins}
      lineNumbers={false}
      linkSafety={{ enabled: false }}
    >
      {text}
    </Streamdown>
  );
}
