import { describe, expect, test } from "bun:test";
import { resolveFileTreeIcon } from "@/features/files/lib/file-tree-icons";

describe("resolveFileTreeIcon", () => {
  test("maps common workspace files to richer categories", () => {
    expect(resolveFileTreeIcon("README.md", "md").name).toBe("docs");
    expect(resolveFileTreeIcon("design/mock.pen", "pen").name).toBe("pencil");
    expect(resolveFileTreeIcon("src/app.tsx", "tsx").name).toBe("code");
    expect(resolveFileTreeIcon("package.json", "json").name).toBe("package");
    expect(resolveFileTreeIcon("tsconfig.json", "json").name).toBe("config");
    expect(resolveFileTreeIcon(".env.local", null).name).toBe("env");
    expect(resolveFileTreeIcon("public/logo.svg", "svg").name).toBe("image");
    expect(resolveFileTreeIcon("fixtures/data.csv", "csv").name).toBe("spreadsheet");
    expect(resolveFileTreeIcon("scripts/dev.sh", "sh").name).toBe("shell");
    expect(resolveFileTreeIcon("archive/build.tgz", "tgz").name).toBe("archive");
  });

  test("falls back to a generic icon for unknown extensions", () => {
    expect(resolveFileTreeIcon("notes/custom.foo", "foo").name).toBe("generic");
    expect(resolveFileTreeIcon("LICENSE", null).name).toBe("docs");
  });
});
