import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import type { ITheme } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
  attachTerminalStream,
  detachTerminal,
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
  type ResolvedTerminalRenderer,
  type TerminalRuntimeDiagnostics,
  type TerminalWebglStatus,
} from "../terminal-display";
import { useSettings } from "../../settings/state/app-settings-provider";
import { useTheme } from "../../../theme/theme-provider";

interface TerminalPanelProps {
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

function resolveTerminalTheme(element: HTMLElement): ITheme {
  const styles = getComputedStyle(element);
  const appearance = element.ownerDocument.documentElement.dataset.themeAppearance;
  const isLightAppearance = appearance === "light";
  const readToken = (token: string, fallback: string) => {
    const value = styles.getPropertyValue(token).trim();
    return value || fallback;
  };

  return {
    background: readToken("--background", isLightAppearance ? "#fafaf9" : "#0a0f16"),
    brightBlack: isLightAppearance
      ? readToken("--ring", "#5b5b66")
      : readToken("--muted-foreground", "#8291a7"),
    brightBlue: readToken("--primary", "#59c1ff"),
    brightCyan: readToken("--primary", "#59c1ff"),
    brightGreen: isLightAppearance ? "#166534" : "#85d6a3",
    brightMagenta: isLightAppearance ? "#7c3aed" : "#d7b5ff",
    brightRed: isLightAppearance ? "#b91c1c" : "#ff7f8d",
    brightWhite: readToken("--foreground", isLightAppearance ? "#09090b" : "#f7fbff"),
    brightYellow: isLightAppearance ? "#a16207" : "#f0c674",
    cursor: readToken("--primary", "#59c1ff"),
    cursorAccent: readToken("--background", isLightAppearance ? "#fafaf9" : "#0a0f16"),
    foreground: readToken("--foreground", isLightAppearance ? "#09090b" : "#dbe6f5"),
    selectionBackground: isLightAppearance
      ? "rgba(9, 9, 11, 0.12)"
      : "rgba(89, 193, 255, 0.24)",
  };
}

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
      resolve(
        separatorIndex >= 0 ? reader.result.slice(separatorIndex + 1) : reader.result,
      );
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

class SafeWebglAddon extends WebglAddon {
  override dispose(): void {
    try {
      super.dispose();
    } catch (error) {
      console.warn("Ignoring xterm WebGL teardown error:", error);
    }
  }
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
  const descriptors = new Set<string>([`${fontSize}px ${quoteFontFamily(LIFECYCLE_MONO_FONT_FAMILY)}`]);
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
  clearTextureAtlas: () => void;
  options: {
    theme?: ITheme;
  };
  refresh: (start: number, end: number) => void;
  rows: number;
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
  xterm.clearTextureAtlas();
  if (xterm.rows > 0) {
    xterm.refresh(0, xterm.rows - 1);
  }

  return background;
}

export function TerminalPanel({ terminal }: TerminalPanelProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    reportTerminalDiagnostics,
    terminalFontFamily,
    terminalFontSize,
    terminalLineHeight,
    terminalRenderer,
  } = useSettings();
  const { resolvedAppearance } = useTheme();
  const hasLiveSession = terminalHasLiveSession(terminal.status);

  useEffect(() => {
    if (!hostRef.current || !hasLiveSession) {
      return;
    }

    const host = hostRef.current;
    let disposed = false;
    let disposeData: { dispose(): void } | null = null;
    let disposeStream: (() => void) | null = null;
    let resizeFrameId: number | null = null;
    let lastCols = 0;
    let lastRows = 0;
    let resizeObserver: ResizeObserver | null = null;
    let writeScheduler: ReturnType<typeof createTerminalWriteScheduler> | null = null;
    let webglAddon: SafeWebglAddon | null = null;
    let xterm: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    const platformHint = detectPlatformHint();
    let diagnostics = buildTerminalRuntimeDiagnostics({
      activeRenderer: "dom",
      allowTransparency: false,
      bundledFontReady: false,
      configuredFontFamily: terminalFontFamily,
      devicePixelRatio: window.devicePixelRatio,
      platformHint,
      requestedRenderer: terminalRenderer,
      resolvedRenderer: "dom",
      webglStatus: "not-requested",
    });

    const reportDiagnostics = (
      next: Partial<Pick<TerminalRuntimeDiagnostics, "activeRenderer" | "bundledFontReady" | "webglStatus">>,
    ) => {
      diagnostics = {
        ...diagnostics,
        ...next,
      };
      host.dataset.terminalRenderer = diagnostics.activeRenderer;
      reportTerminalDiagnostics(diagnostics);
    };

    const handleTerminalError = (nextError: unknown) => {
      if (disposed || isBenignTerminalIoError(nextError)) {
        return;
      }

      setError(String(nextError));
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

    const syncTerminalSize = () => {
      resizeFrameId = null;
      if (disposed || !xterm) {
        return;
      }

      // Skip resize when hidden (display: none) to avoid reflowing
      // content into tiny dimensions and losing scrollback.
      if (!host.offsetWidth && !host.offsetHeight) {
        return;
      }

      fitAddon?.fit();
      if (xterm.cols <= 0 || xterm.rows <= 0) {
        return;
      }

      if (xterm.cols === lastCols && xterm.rows === lastRows) {
        return;
      }

      lastCols = xterm.cols;
      lastRows = xterm.rows;
      void resizeTerminal(terminal.id, xterm.cols, xterm.rows).catch(handleTerminalError);
    };

    const scheduleTerminalResize = () => {
      if (disposed || resizeFrameId !== null) {
        return;
      }

      resizeFrameId = window.requestAnimationFrame(syncTerminalSize);
    };

    const connect = async () => {
      try {
        scheduleTerminalResize();
        if (!xterm) {
          return;
        }
        disposeStream = await attachTerminalStream(
          terminal.id,
          Math.max(xterm.cols, 1),
          Math.max(xterm.rows, 1),
          (chunk) => {
            writeScheduler?.push(chunk.data);
          },
        );
      } catch (attachError) {
        handleTerminalError(attachError);
      }
    };

    const initializeTerminal = async () => {
      const bundledFontReady = await waitForTerminalFonts(terminalFontFamily, terminalFontSize);
      if (disposed) {
        return;
      }

      const terminalTheme = resolveTerminalTheme(host);
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
        activeRenderer: "dom",
        allowTransparency: runtimeOptions.allowTransparency,
        bundledFontReady: false,
        configuredFontFamily: terminalFontFamily,
        devicePixelRatio: window.devicePixelRatio,
        platformHint,
        requestedRenderer: runtimeOptions.requestedRenderer,
        resolvedRenderer: runtimeOptions.resolvedRenderer,
        webglStatus: "not-requested",
      });

      xterm = new Terminal({
        // Official xterm addons like unicode11/webgl still use this gate.
        allowProposedApi: true,
        allowTransparency: runtimeOptions.allowTransparency,
        customGlyphs: true,
        cursorBlink: true,
        fontFamily: terminalFontFamily,
        fontSize: terminalFontSize,
        letterSpacing: 0,
        lineHeight: terminalLineHeight,
        rescaleOverlappingGlyphs: true,
        scrollback: 5000,
        theme: terminalTheme,
      });
      fitAddon = new FitAddon();
      const unicode11Addon = new Unicode11Addon();
      const webLinksAddon = new WebLinksAddon();
      writeScheduler = createTerminalWriteScheduler(xterm);
      xterm.loadAddon(fitAddon);
      xterm.loadAddon(webLinksAddon);
      xterm.open(host);
      xtermRef.current = xterm;
      try {
        xterm.loadAddon(unicode11Addon);
        xterm.unicode.activeVersion = "11";
      } catch (unicodeError) {
        console.warn("Failed to enable Unicode 11 terminal support:", unicodeError);
      }

      let activeRenderer: ResolvedTerminalRenderer = "dom";
      let webglStatus: TerminalWebglStatus = "not-requested";
      if (runtimeOptions.resolvedRenderer === "webgl") {
        try {
          webglAddon = new SafeWebglAddon();
          webglAddon.onContextLoss(() => {
            webglAddon?.dispose();
            webglAddon = null;
            reportDiagnostics({
              activeRenderer: "dom",
              webglStatus: "context-lost",
            });
            console.warn("WebGL terminal renderer lost context; falling back to DOM.");
          });
          xterm.loadAddon(webglAddon);
          activeRenderer = "webgl";
          webglStatus = "active";
        } catch (webglError) {
          webglAddon = null;
          webglStatus = "failed";
          console.warn("Failed to enable WebGL terminal renderer; falling back to DOM:", webglError);
        }
      }

      reportDiagnostics({
        activeRenderer,
        bundledFontReady,
        webglStatus,
      });

      xterm.focus();
      void connect();

      disposeData = xterm.onData((data) => {
        void writeTerminal(terminal.id, data).catch(handleTerminalError);
      });

      resizeObserver = new ResizeObserver(() => {
        scheduleTerminalResize();
      });
      resizeObserver.observe(host);
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
    void initializeTerminal();

    return () => {
      disposed = true;
      if (resizeFrameId !== null) {
        window.cancelAnimationFrame(resizeFrameId);
      }
      host.style.removeProperty("--terminal-surface-background");
      host.style.removeProperty("background-color");
      delete host.dataset.terminalRenderer;
      xtermRef.current = null;
      host.removeEventListener("paste", handleTerminalPaste);
      host.removeEventListener("dragover", handleTerminalDragOver);
      host.removeEventListener("drop", handleTerminalDrop);
      host.removeEventListener("mousedown", focusTerminal);
      resizeObserver?.disconnect();
      disposeData?.dispose();
      disposeStream?.();
      writeScheduler?.dispose();
      void detachTerminal(terminal.id);
      webglAddon?.dispose();
      xterm?.dispose();
    };
  }, [
    hasLiveSession,
    reportTerminalDiagnostics,
    terminal.id,
    terminal.workspace_id,
    terminalFontFamily,
    terminalFontSize,
    terminalLineHeight,
    terminalRenderer,
  ]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !hasLiveSession) {
      return;
    }

    applyTerminalAppearance({
      host,
      theme: resolveTerminalTheme(host),
      xterm: xtermRef.current,
    });
  }, [hasLiveSession, resolvedAppearance]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--background)]">
      {error && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        {hasLiveSession ? (
          <div className="h-full w-full p-3">
            <div ref={hostRef} className="terminal-host h-full w-full" />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center">
            <div>
              <h3 className="text-lg font-semibold text-[var(--foreground)]">
                Session unavailable
              </h3>
              <p className="mt-2 max-w-md text-sm text-[var(--muted-foreground)]">
                This terminal session is no longer attachable. Start a new shell or harness session
                to continue.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
