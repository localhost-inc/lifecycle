import type { LucideIcon } from "lucide-react";
import {
  Binary,
  BookText,
  Braces,
  Cog,
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  Package,
  PenTool,
  Shield,
  TerminalSquare,
} from "lucide-react";
import { workspaceFileBasename } from "@/features/workspaces/lib/workspace-file-paths";

export type FileTreeIconName =
  | "archive"
  | "code"
  | "config"
  | "data"
  | "docs"
  | "env"
  | "generic"
  | "image"
  | "package"
  | "pencil"
  | "shell"
  | "spreadsheet";

interface FileTreeIconDefinition {
  Icon: LucideIcon;
  name: FileTreeIconName;
}

const GENERIC_FILE_ICON: FileTreeIconDefinition = {
  Icon: FileText,
  name: "generic",
};

const PACKAGE_FILE_NAMES = new Set([
  "bun.lock",
  "cargo.lock",
  "cargo.toml",
  "composer.json",
  "gemfile",
  "gemfile.lock",
  "go.mod",
  "go.sum",
  "package-lock.json",
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const CONFIG_FILE_NAMES = new Set([
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  ".npmrc",
  ".oxlintrc.json",
  "biome.json",
  "compose.yaml",
  "compose.yml",
  "docker-compose.yaml",
  "docker-compose.yml",
  "lefthook.yml",
  "tauri.conf.json",
  "turbo.json",
  "tsconfig.json",
]);

const DOC_FILE_NAMES = new Set(["changelog.md", "license", "license.md", "readme.md"]);
const SHELL_FILE_NAMES = new Set(["dockerfile", "justfile", "makefile", "procfile"]);

const DOC_EXTENSIONS = new Set(["md", "mdx", "rst", "txt"]);
const CODE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "go",
  "h",
  "hpp",
  "html",
  "java",
  "js",
  "jsx",
  "kt",
  "less",
  "mjs",
  "php",
  "py",
  "rb",
  "rs",
  "sass",
  "scss",
  "swift",
  "ts",
  "tsx",
  "vue",
  "xml",
]);
const DATA_EXTENSIONS = new Set(["ini", "json", "jsonc", "toml", "yaml", "yml"]);
const IMAGE_EXTENSIONS = new Set(["avif", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"]);
const ARCHIVE_EXTENSIONS = new Set(["7z", "bz2", "gz", "rar", "tar", "tgz", "xz", "zip"]);
const SPREADSHEET_EXTENSIONS = new Set(["csv", "tsv", "xls", "xlsx"]);
const SHELL_EXTENSIONS = new Set(["bash", "fish", "ps1", "sh", "zsh"]);

function iconDefinition(name: FileTreeIconName, Icon: LucideIcon): FileTreeIconDefinition {
  return { Icon, name };
}

export function resolveFileTreeIcon(
  filePath: string,
  extension: string | null,
): FileTreeIconDefinition {
  const basename = workspaceFileBasename(filePath).toLowerCase();
  const normalizedExtension = extension?.toLowerCase() ?? null;

  if (basename === ".env" || basename.startsWith(".env.")) {
    return iconDefinition("env", Shield);
  }

  if (basename === "readme" || DOC_FILE_NAMES.has(basename)) {
    return iconDefinition("docs", BookText);
  }

  if (basename === "pencil" || normalizedExtension === "pen") {
    return iconDefinition("pencil", PenTool);
  }

  if (PACKAGE_FILE_NAMES.has(basename)) {
    return iconDefinition("package", Package);
  }

  if (
    CONFIG_FILE_NAMES.has(basename) ||
    (basename.startsWith(".") && normalizedExtension === null)
  ) {
    return iconDefinition("config", Cog);
  }

  if (SHELL_FILE_NAMES.has(basename)) {
    return iconDefinition("shell", TerminalSquare);
  }

  if (normalizedExtension === null) {
    return GENERIC_FILE_ICON;
  }

  if (DOC_EXTENSIONS.has(normalizedExtension)) {
    return iconDefinition("docs", BookText);
  }

  if (normalizedExtension === "pen") {
    return iconDefinition("pencil", PenTool);
  }

  if (SPREADSHEET_EXTENSIONS.has(normalizedExtension)) {
    return iconDefinition("spreadsheet", FileSpreadsheet);
  }

  if (IMAGE_EXTENSIONS.has(normalizedExtension)) {
    return iconDefinition("image", FileImage);
  }

  if (ARCHIVE_EXTENSIONS.has(normalizedExtension)) {
    return iconDefinition("archive", FileArchive);
  }

  if (SHELL_EXTENSIONS.has(normalizedExtension)) {
    return iconDefinition("shell", TerminalSquare);
  }

  if (CODE_EXTENSIONS.has(normalizedExtension)) {
    return iconDefinition("code", FileCode);
  }

  if (DATA_EXTENSIONS.has(normalizedExtension)) {
    return normalizedExtension === "json" || normalizedExtension === "jsonc"
      ? iconDefinition("data", Braces)
      : iconDefinition("config", Binary);
  }

  return GENERIC_FILE_ICON;
}
