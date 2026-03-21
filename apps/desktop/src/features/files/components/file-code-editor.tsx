import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";
import { buildFileCodeEditorExtensions } from "@/features/files/lib/file-editor-config";
import type { FileEditorConfig } from "@/features/files/lib/file-editor-types";

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
      basicSetup={{ lineNumbers: false, foldGutter: false }}
      className="h-full min-h-0 [&_.cm-editor]:h-full [&_.cm-scroller]:overflow-auto [&_.cm-content]:px-4 [&_.cm-gutters]:pl-4"
      extensions={extensions}
      height="100%"
      onChange={onChange}
      value={value}
    />
  );
}
