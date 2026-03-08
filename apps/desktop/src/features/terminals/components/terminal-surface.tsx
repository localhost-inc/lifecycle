import { EmptyState, useTheme } from "@lifecycle/ui";
import { TerminalSquare } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { FitAddon, Terminal } from "ghostty-web";
import type { ITheme } from "ghostty-web";
import {
  attachTerminalStream,
  detachTerminal,
  getNativeTerminalCapabilities,
  resizeTerminal,
  saveTerminalAttachment,
  terminalHasLiveSession,
  type TerminalRow,
  writeTerminal,
} from "../api";
import {
  LIFECYCLE_MONO_FONT_FAMILY,
  detectPlatformHint,
  getPrimaryTerminalFontFamily,
  getTerminalPlatform,
  resolveTerminalRuntimeOptions,
  type TerminalRuntimeDiagnostics,
} from "../terminal-display";
import { resolveTerminalTheme } from "../terminal-theme";
import { getGhosttyRuntime } from "../ghostty-runtime";
import { useSettings } from "../../settings/state/app-settings-provider";
import { NativeTerminalSurface } from "./native-terminal-surface";

interface TerminalSurfaceProps {
  active: boolean;
  terminal: TerminalRow;
}

const TERMINAL_WRITE_IMMEDIATE_THRESHOLD = 16 * 1024;
const BRACKETED_PASTE_START = "\u001b[200~";
const BRACKETED_PASTE_END = "\u001b[201~";
const IMAGE_ATTACHMENT_EXTENSIONS = new Set([
  "avif",
  "bmp",
  "gif",
  "heic",
  "heif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "svgz",
  "tif",
  "tiff",
  "webp",
]);

function inferImageAttachmentExtension(mediaType: string | null | undefined): string {
  switch (mediaType?.trim().toLowerCase()) {
    case "image/avif":
      return "avif";
    case "image/bmp":
      return "bmp";
    case "image/gif":
      return "gif";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/svg+xml":
      return "svg";
    case "image/tiff":
      return "tiff";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

export function isImageAttachmentFile(file: Pick<File, "name" | "type">): boolean {
  if (file.type.toLowerCase().startsWith("image/")) {
    return true;
  }

  const extension = file.name.split(".").pop()?.toLowerCase();
  return extension !== undefined && IMAGE_ATTACHMENT_EXTENSIONS.has(extension);
}

function collectImageAttachmentFiles(
  transfer: Pick<DataTransfer, "files" | "items"> | null | undefined,
): File[] {
  if (!transfer) {
    return [];
  }

  const directFiles = Array.from(transfer.files ?? []).filter(isImageAttachmentFile);
  if (directFiles.length > 0) {
    return directFiles;
  }

  return Array.from(transfer.items ?? [])
    .filter((item) => item.kind === "file" && item.type.toLowerCase().startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
    .filter(isImageAttachmentFile);
}

function createImageAttachmentFileName(file: Pick<File, "name" | "type">, index: number): string {
  const trimmed = file.name.trim();
  if (trimmed.length > 0) {
    return trimmed;
  }

  return `pasted-image-${index + 1}.${inferImageAttachmentExtension(file.type)}`;
}

function readFileAsBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read image attachment."));
    };
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Image attachment payload was not readable."));
        return;
      }

      const separatorIndex = reader.result.indexOf(",");
      resolve(separatorIndex >= 0 ? reader.result.slice(separatorIndex + 1) : reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function formatTerminalAttachmentInsertion(paths: readonly string[]): string {
  return paths.map((path) => JSON.stringify(path)).join(" ");
}

export function buildTerminalAttachmentWritePayloads(
  harnessProvider: string | null,
  paths: readonly string[],
): string[] {
  if (paths.length === 0) {
    return [];
  }

  if (harnessProvider === "codex") {
    return paths.map((path) => {
      const quotedPath = JSON.stringify(path);
      return `${BRACKETED_PASTE_START}${quotedPath}${BRACKETED_PASTE_END}`;
    });
  }

  return [`${formatTerminalAttachmentInsertion(paths)} `];
}

export function isBenignTerminalIoError(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return (
    message.includes("terminal session is unavailable") ||
    message.includes("no such process") ||
    message.includes("broken pipe") ||
    message.includes("bad file descriptor")
  );
}

function createTerminalWriteScheduler(xterm: Terminal) {
  let disposed = false;
  let frameId: number | null = null;
  let pendingBytes = 0;
  let writing = false;
  const queue: string[] = [];

  const flush = () => {
    frameId = null;
    if (disposed || writing || queue.length === 0) {
      return;
    }

    writing = true;
    const payload = queue.join("");
    queue.length = 0;
    pendingBytes = 0;
    xterm.write(payload, () => {
      writing = false;
      if (!disposed && queue.length > 0) {
        schedule();
      }
    });
  };

  const schedule = () => {
    if (disposed || writing || frameId !== null) {
      return;
    }

    frameId = window.requestAnimationFrame(flush);
  };

  return {
    dispose() {
      disposed = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
      queue.length = 0;
      pendingBytes = 0;
    },
    push(data: string) {
      if (disposed || data.length === 0) {
        return;
      }

      queue.push(data);
      pendingBytes += data.length;
      if (pendingBytes >= TERMINAL_WRITE_IMMEDIATE_THRESHOLD) {
        if (frameId !== null) {
          window.cancelAnimationFrame(frameId);
          frameId = null;
        }
        flush();
        return;
      }

      schedule();
    },
  };
}

const GENERIC_FONT_FAMILIES = new Set([
  "cursive",
  "emoji",
  "fangsong",
  "fantasy",
  "math",
  "monospace",
  "sans-serif",
  "serif",
  "system-ui",
  "ui-monospace",
  "ui-rounded",
  "ui-sans-serif",
  "ui-serif",
]);

function quoteFontFamily(family: string): string {
  const trimmed = family.trim().replace(/^['"]|['"]$/g, "");
  return trimmed.includes(" ") ? `"${trimmed.replaceAll('"', '\\"')}"` : trimmed;
}

function createFontLoadDescriptors(fontFamily: string, fontSize: number): string[] {
  const descriptors = new Set<string>([
    `${fontSize}px ${quoteFontFamily(LIFECYCLE_MONO_FONT_FAMILY)}`,
  ]);
  const primaryFontFamily = getPrimaryTerminalFontFamily(fontFamily);
  if (primaryFontFamily && !GENERIC_FONT_FAMILIES.has(primaryFontFamily.toLowerCase())) {
    descriptors.add(`${fontSize}px ${quoteFontFamily(primaryFontFamily)}`);
  }

  return [...descriptors];
}

async function waitForTerminalFonts(fontFamily: string, fontSize: number): Promise<boolean> {
  if (typeof document === "undefined" || !("fonts" in document)) {
    return false;
  }

  const descriptors = createFontLoadDescriptors(fontFamily, fontSize);
  try {
    await Promise.all(descriptors.map((descriptor) => document.fonts.load(descriptor, "MmWw")));
    await document.fonts.ready;
  } catch (error) {
    console.warn("Failed while waiting for terminal fonts:", error);
  }

  return document.fonts.check(`${fontSize}px ${quoteFontFamily(LIFECYCLE_MONO_FONT_FAMILY)}`);
}

export function buildTerminalRuntimeDiagnostics(
  input: Omit<TerminalRuntimeDiagnostics, "platform"> & { platformHint?: string },
): TerminalRuntimeDiagnostics {
  const { platformHint, ...diagnostics } = input;
  return {
    ...diagnostics,
    platform: getTerminalPlatform(platformHint),
  };
}

interface TerminalAppearanceHost {
  dataset: Record<string, string | undefined>;
  style: {
    backgroundColor: string;
    setProperty: (name: string, value: string) => void;
  };
}

interface TerminalAppearanceTarget {
  options: {
    theme?: ITheme;
  };
}

export function applyTerminalAppearance({
  host,
  theme,
  xterm,
}: {
  host: TerminalAppearanceHost;
  theme: ITheme;
  xterm?: TerminalAppearanceTarget | null;
}): string {
  const background = theme.background ?? "#0a0f16";
  host.style.backgroundColor = background;
  host.style.setProperty("--terminal-surface-background", background);

  if (!xterm) {
    return background;
  }

  xterm.options.theme = { ...theme };
  return background;
}

function BrowserTerminalSurface({ active, terminal }: TerminalSurfaceProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const disposeStreamRef = useRef<(() => void) | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const replayCursorRef = useRef<string | null>(null);
  const resizeFrameIdRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const terminalSizeRef = useRef({ cols: 0, rows: 0 });
  const writeSchedulerRef = useRef<ReturnType<typeof createTerminalWriteScheduler> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { reportTerminalDiagnostics, terminalFontFamily, terminalFontSize, terminalRenderer } =
    useSettings();
  const { resolvedTheme } = useTheme();
  const hasLiveSession = terminalHasLiveSession(terminal.status);

  const handleTerminalError = (nextError: unknown) => {
    if (isBenignTerminalIoError(nextError)) {
      return;
    }

    setError(String(nextError));
  };

  const syncTerminalSize = () => {
    resizeFrameIdRef.current = null;
    const host = hostRef.current;
    const xterm = xtermRef.current;
    if (!host || !xterm) {
      return;
    }

    // Skip resize when hidden (display: none) to avoid reflowing
    // content into tiny dimensions and losing scrollback.
    if (!host.offsetWidth && !host.offsetHeight) {
      return;
    }

    fitAddonRef.current?.fit();
    if (xterm.cols <= 0 || xterm.rows <= 0) {
      return;
    }

    if (
      xterm.cols === terminalSizeRef.current.cols &&
      xterm.rows === terminalSizeRef.current.rows
    ) {
      return;
    }

    terminalSizeRef.current = {
      cols: xterm.cols,
      rows: xterm.rows,
    };
    void resizeTerminal(terminal.id, xterm.cols, xterm.rows).catch(handleTerminalError);
  };

  const scheduleTerminalResize = () => {
    if (resizeFrameIdRef.current !== null) {
      return;
    }

    resizeFrameIdRef.current = window.requestAnimationFrame(syncTerminalSize);
  };

  const detachCurrentStream = () => {
    disposeStreamRef.current?.();
    disposeStreamRef.current = null;
    void detachTerminal(terminal.id);
  };

  const connect = async () => {
    const xterm = xtermRef.current;
    if (!xterm) {
      return;
    }

    try {
      scheduleTerminalResize();
      disposeStreamRef.current?.();
      disposeStreamRef.current = await attachTerminalStream(
        terminal.id,
        Math.max(xterm.cols, 1),
        Math.max(xterm.rows, 1),
        replayCursorRef.current,
        (chunk) => {
          replayCursorRef.current = chunk.cursor;
          writeSchedulerRef.current?.push(chunk.data);
        },
      );
    } catch (attachError) {
      handleTerminalError(attachError);
    }
  };

  useEffect(() => {
    if (!hostRef.current || !hasLiveSession) {
      return;
    }

    const host = hostRef.current;
    let disposed = false;
    let disposeData: { dispose(): void } | null = null;
    let xterm: Terminal | null = null;
    const platformHint = detectPlatformHint();
    let diagnostics = buildTerminalRuntimeDiagnostics({
      activeRenderer: "dom",
      allowTransparency: false,
      bundledFontReady: false,
      configuredFontFamily: terminalFontFamily,
      devicePixelRatio: window.devicePixelRatio,
      platformHint,
      requestedRenderer: terminalRenderer,
      resolvedRenderer: "canvas",
      webglStatus: "not-requested",
    });

    const reportDiagnostics = (
      next: Partial<
        Pick<TerminalRuntimeDiagnostics, "activeRenderer" | "bundledFontReady" | "webglStatus">
      >,
    ) => {
      diagnostics = {
        ...diagnostics,
        ...next,
      };
      host.dataset.terminalRenderer = diagnostics.activeRenderer;
      reportTerminalDiagnostics(diagnostics);
    };

    const attachImagesToTerminal = async (files: readonly File[]) => {
      try {
        const savedAttachments = await Promise.all(
          files.map(async (file, index) =>
            saveTerminalAttachment({
              base64Data: await readFileAsBase64(file),
              fileName: createImageAttachmentFileName(file, index),
              mediaType: file.type,
              workspaceId: terminal.workspace_id,
            }),
          ),
        );
        if (disposed || savedAttachments.length === 0) {
          return;
        }

        const payloads = buildTerminalAttachmentWritePayloads(
          terminal.harness_provider,
          savedAttachments.map((attachment) => attachment.absolutePath),
        );
        for (const payload of payloads) {
          await writeTerminal(terminal.id, payload);
        }
        setError(null);
      } catch (attachmentError) {
        handleTerminalError(attachmentError);
      }
    };

    const initializeTerminal = async () => {
      const bundledFontReady = await waitForTerminalFonts(terminalFontFamily, terminalFontSize);
      if (disposed) {
        return;
      }

      const terminalTheme = resolveTerminalTheme(host, resolvedTheme).webTheme;
      const terminalBackground = applyTerminalAppearance({
        host,
        theme: terminalTheme,
      });
      const runtimeOptions = resolveTerminalRuntimeOptions({
        backgroundColor: terminalBackground,
        platformHint,
        renderer: terminalRenderer,
      });
      host.dataset.terminalRenderer = runtimeOptions.resolvedRenderer;
      diagnostics = buildTerminalRuntimeDiagnostics({
        activeRenderer: "canvas",
        allowTransparency: runtimeOptions.allowTransparency,
        bundledFontReady: false,
        configuredFontFamily: terminalFontFamily,
        devicePixelRatio: window.devicePixelRatio,
        platformHint,
        requestedRenderer: runtimeOptions.requestedRenderer,
        resolvedRenderer: "canvas",
        webglStatus: "not-requested",
      });

      const ghostty = await getGhosttyRuntime();
      xterm = new Terminal({
        allowTransparency: runtimeOptions.allowTransparency,
        cursorBlink: true,
        fontFamily: terminalFontFamily,
        fontSize: terminalFontSize,
        ghostty,
        scrollback: 5000,
        theme: terminalTheme,
      });
      fitAddonRef.current = new FitAddon();
      writeSchedulerRef.current = createTerminalWriteScheduler(xterm);
      xterm.loadAddon(fitAddonRef.current);
      xterm.open(host);
      xtermRef.current = xterm;

      reportDiagnostics({
        activeRenderer: "canvas",
        bundledFontReady,
        webglStatus: "not-requested",
      });

      if (active) {
        xterm.focus();
        void connect();
      }

      disposeData = xterm.onData((data) => {
        void writeTerminal(terminal.id, data).catch(handleTerminalError);
      });

      resizeObserverRef.current = new ResizeObserver(() => {
        scheduleTerminalResize();
      });
      resizeObserverRef.current.observe(host);
      host.addEventListener("paste", handleTerminalPaste);
      host.addEventListener("dragover", handleTerminalDragOver);
      host.addEventListener("drop", handleTerminalDrop);
      host.addEventListener("mousedown", focusTerminal);
    };

    const focusTerminal = () => {
      xterm?.focus();
    };
    const handleTerminalPaste = (event: ClipboardEvent) => {
      const imageFiles = collectImageAttachmentFiles(event.clipboardData);
      if (imageFiles.length === 0) {
        return;
      }

      event.preventDefault();
      void attachImagesToTerminal(imageFiles);
    };
    const handleTerminalDragOver = (event: DragEvent) => {
      const imageFiles = collectImageAttachmentFiles(event.dataTransfer);
      if (imageFiles.length === 0) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    };
    const handleTerminalDrop = (event: DragEvent) => {
      const imageFiles = collectImageAttachmentFiles(event.dataTransfer);
      if (imageFiles.length === 0) {
        return;
      }

      event.preventDefault();
      void attachImagesToTerminal(imageFiles);
    };
    setError(null);
    replayCursorRef.current = null;
    void initializeTerminal();

    return () => {
      disposed = true;
      if (resizeFrameIdRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameIdRef.current);
        resizeFrameIdRef.current = null;
      }
      host.style.removeProperty("--terminal-surface-background");
      host.style.removeProperty("background-color");
      delete host.dataset.terminalRenderer;
      xtermRef.current = null;
      fitAddonRef.current = null;
      host.removeEventListener("paste", handleTerminalPaste);
      host.removeEventListener("dragover", handleTerminalDragOver);
      host.removeEventListener("drop", handleTerminalDrop);
      host.removeEventListener("mousedown", focusTerminal);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      disposeData?.dispose();
      detachCurrentStream();
      writeSchedulerRef.current?.dispose();
      writeSchedulerRef.current = null;
      xterm?.dispose();
    };
  }, [
    hasLiveSession,
    reportTerminalDiagnostics,
    terminal.id,
    terminal.workspace_id,
    terminalFontFamily,
    terminalFontSize,
    terminalRenderer,
  ]);

  useEffect(() => {
    if (!hasLiveSession || !xtermRef.current) {
      return;
    }

    if (!active) {
      detachCurrentStream();
      xtermRef.current.blur();
      return;
    }

    xtermRef.current.focus();
    void connect();

    return () => {
      detachCurrentStream();
    };
  }, [active, hasLiveSession, terminal.id]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !hasLiveSession) {
      return;
    }

    applyTerminalAppearance({
      host,
      theme: resolveTerminalTheme(host, resolvedTheme).webTheme,
      xterm: xtermRef.current,
    });
  }, [hasLiveSession, resolvedTheme]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--terminal-surface-background)]">
      {error && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {hasLiveSession ? (
          <div ref={hostRef} className="terminal-host h-full w-full" />
        ) : (
          <EmptyState
            className="h-full"
            description="This terminal session is no longer attachable. Start a new session to continue."
            icon={<TerminalSquare />}
            title="Session unavailable"
          />
        )}
      </div>
    </div>
  );
}

export function TerminalSurface(props: TerminalSurfaceProps) {
  const [nativeTerminalAvailable, setNativeTerminalAvailable] = useState<boolean | null>(() =>
    isTauri() ? null : false,
  );

  useEffect(() => {
    let cancelled = false;
    void getNativeTerminalCapabilities()
      .then(({ available }) => {
        if (!cancelled) {
          setNativeTerminalAvailable(available);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNativeTerminalAvailable(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (nativeTerminalAvailable === null) {
    return <div className="flex min-h-0 flex-1 flex-col bg-[var(--terminal-surface-background)]" />;
  }

  return nativeTerminalAvailable ? (
    <NativeTerminalSurface {...props} />
  ) : (
    <BrowserTerminalSurface {...props} />
  );
}
