import { describe, expect, test } from "bun:test";
import { resolveExplorerTreeIcon } from "@/features/explorer/lib/explorer-tree-icons";

describe("resolveExplorerTreeIcon", () => {
  test("maps common workspace files to richer categories", () => {
    expect(resolveExplorerTreeIcon("README.md", "md").name).toBe("docs");
    expect(resolveExplorerTreeIcon("design/mock.pen", "pen").name).toBe("pencil");
    expect(resolveExplorerTreeIcon("src/app.tsx", "tsx").name).toBe("code");
    expect(resolveExplorerTreeIcon("package.json", "json").name).toBe("package");
    expect(resolveExplorerTreeIcon("tsconfig.json", "json").name).toBe("config");
    expect(resolveExplorerTreeIcon(".env.local", null).name).toBe("env");
    expect(resolveExplorerTreeIcon("public/logo.svg", "svg").name).toBe("image");
    expect(resolveExplorerTreeIcon("fixtures/data.csv", "csv").name).toBe("spreadsheet");
    expect(resolveExplorerTreeIcon("scripts/dev.sh", "sh").name).toBe("shell");
    expect(resolveExplorerTreeIcon("archive/build.tgz", "tgz").name).toBe("archive");
  });

  test("falls back to a generic icon for unknown extensions", () => {
    expect(resolveExplorerTreeIcon("notes/custom.foo", "foo").name).toBe("generic");
    expect(resolveExplorerTreeIcon("LICENSE", null).name).toBe("docs");
  });
});
