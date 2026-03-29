interface NativeReadFileResult {
  content: string | null;
}

interface FileReader {
  exists(path: string): Promise<boolean>;
  readTextFile(path: string): Promise<string>;
}

function splitAbsoluteFilePath(path: string): { filePath: string; rootPath: string } {
  const normalized = path.trim();
  const slashIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));

  if (slashIndex < 0) {
    throw new Error(`Expected an absolute file path, received "${path}".`);
  }

  const rootPath = slashIndex === 0 ? normalized.slice(0, 1) : normalized.slice(0, slashIndex);
  const filePath = normalized.slice(slashIndex + 1);

  if (!rootPath || !filePath) {
    throw new Error(`Expected an absolute file path, received "${path}".`);
  }

  return { filePath, rootPath };
}

export function createNativeFileReader(
  invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>,
): FileReader {
  return {
    async exists(path: string): Promise<boolean> {
      const { filePath, rootPath } = splitAbsoluteFilePath(path);
      return (await invoke("file_exists", {
        rootPath,
        filePath,
      })) as boolean;
    },
    async readTextFile(path: string): Promise<string> {
      const { filePath, rootPath } = splitAbsoluteFilePath(path);
      const result = (await invoke("read_file", {
        rootPath,
        filePath,
      })) as NativeReadFileResult;

      if (result.content === null) {
        throw new Error(`File "${path}" could not be read as text.`);
      }

      return result.content;
    },
  };
}
