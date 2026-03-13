import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";
import { buildFileCodeEditorExtensions } from "../lib/file-editor-config";
import type { FileEditorConfig } from "../lib/file-editor-types";

interface FileCodeEditorProps {
  config: FileEditorConfig;
  onChange: (value: string) => void;
  value: string;
}

export function FileCodeEditor({ config, onChange, value }: FileCodeEditorProps) {
  const extensions = useMemo(
    () => buildFileCodeEditorExtensions(config),
    [config.language, config.lineWrapping],
  );

  return (
    <CodeMirror
      basicSetup
      className="h-full min-h-0 [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto"
      extensions={extensions}
      height="100%"
      onChange={onChange}
      value={value}
    />
  );
}
