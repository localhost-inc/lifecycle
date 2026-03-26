import { forwardRef } from "react";
import {
  AgentPromptInput,
  type AgentPromptInputHandle,
  type AgentPromptInputProps,
} from "./agent-prompt-input";
import { AgentToolbar, type AgentToolbarProps } from "./agent-toolbar";

export interface AgentComposerProps {
  layout?: AgentPromptInputProps["layout"];
  prompt: Omit<AgentPromptInputProps, "layout">;
  toolbar: AgentToolbarProps;
  toolbarClassName?: string;
}

export const AgentComposer = forwardRef<AgentPromptInputHandle, AgentComposerProps>(
  function AgentComposer({ layout = "docked", prompt, toolbar, toolbarClassName }, ref) {
    const combinedToolbarClassName = [toolbar.className, toolbarClassName]
      .filter((value) => value && value.length > 0)
      .join(" ");

    return (
      <>
        <AgentPromptInput ref={ref} {...prompt} layout={layout} />
        <AgentToolbar
          {...toolbar}
          className={combinedToolbarClassName.length > 0 ? combinedToolbarClassName : undefined}
        />
      </>
    );
  },
);
