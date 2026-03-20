import { describe, expect, test } from "bun:test";
import { type ReactNode, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hasAnsiCodes, renderAnsiLine, renderAnsiText, stripAnsi } from "@/lib/ansi";

function markup(node: ReactNode): string {
  return renderToStaticMarkup(createElement("span", null, node));
}

describe("hasAnsiCodes", () => {
  test("detects escape sequences", () => {
    expect(hasAnsiCodes("\x1b[31mhello\x1b[0m")).toBe(true);
  });

  test("returns false for plain text", () => {
    expect(hasAnsiCodes("hello world")).toBe(false);
  });
});

describe("stripAnsi", () => {
  test("removes all escape sequences", () => {
    expect(stripAnsi("\x1b[1m\x1b[31mERROR\x1b[0m: something failed")).toBe(
      "ERROR: something failed",
    );
  });

  test("returns plain text unchanged", () => {
    expect(stripAnsi("no escapes here")).toBe("no escapes here");
  });
});

describe("renderAnsiLine", () => {
  test("returns plain string for text without escapes", () => {
    expect(renderAnsiLine("hello", "k")).toBe("hello");
  });

  test("renders foreground color", () => {
    const result = markup(renderAnsiLine("\x1b[31mred text\x1b[0m", "k"));
    expect(result).toContain("color:var(--terminal-ansi-red)");
    expect(result).toContain("red text");
  });

  test("renders bright foreground color", () => {
    const result = markup(renderAnsiLine("\x1b[92mbright green\x1b[0m", "k"));
    expect(result).toContain("color:var(--terminal-ansi-bright-green)");
    expect(result).toContain("bright green");
  });

  test("renders background color", () => {
    const result = markup(renderAnsiLine("\x1b[44mblue bg\x1b[0m", "k"));
    expect(result).toContain("background-color:var(--terminal-ansi-blue)");
  });

  test("renders bold", () => {
    const result = markup(renderAnsiLine("\x1b[1mbold\x1b[0m", "k"));
    expect(result).toContain("font-weight:bold");
  });

  test("renders dim", () => {
    const result = markup(renderAnsiLine("\x1b[2mdim\x1b[0m", "k"));
    expect(result).toContain("opacity:0.7");
  });

  test("renders italic", () => {
    const result = markup(renderAnsiLine("\x1b[3mitalic\x1b[0m", "k"));
    expect(result).toContain("font-style:italic");
  });

  test("renders underline", () => {
    const result = markup(renderAnsiLine("\x1b[4munderlined\x1b[0m", "k"));
    expect(result).toContain("text-decoration:underline");
  });

  test("combines bold and color", () => {
    const result = markup(renderAnsiLine("\x1b[1;33myellow bold\x1b[0m", "k"));
    expect(result).toContain("font-weight:bold");
    expect(result).toContain("color:var(--terminal-ansi-yellow)");
  });

  test("resets style mid-line", () => {
    const result = markup(renderAnsiLine("\x1b[31mred\x1b[0m plain", "k"));
    expect(result).toContain("red");
    expect(result).toContain(" plain");
    // "plain" should not be wrapped in a styled span
    expect(result).toBe(
      '<span><span style="color:var(--terminal-ansi-red)">red</span> plain</span>',
    );
  });

  test("handles 256-color foreground", () => {
    const result = markup(renderAnsiLine("\x1b[38;5;9mcolor\x1b[0m", "k"));
    expect(result).toContain("color:var(--terminal-ansi-bright-red)");
  });

  test("handles 256-color cube", () => {
    const result = markup(renderAnsiLine("\x1b[38;5;196mcolor\x1b[0m", "k"));
    expect(result).toContain("color:rgb(");
  });

  test("handles 256-color grayscale", () => {
    const result = markup(renderAnsiLine("\x1b[38;5;240mgray\x1b[0m", "k"));
    expect(result).toContain("color:rgb(");
  });

  test("handles true-color foreground", () => {
    const result = markup(renderAnsiLine("\x1b[38;2;255;128;0mcolor\x1b[0m", "k"));
    expect(result).toContain("color:rgb(255,128,0)");
  });

  test("handles true-color background", () => {
    const result = markup(renderAnsiLine("\x1b[48;2;0;100;200mbg\x1b[0m", "k"));
    expect(result).toContain("background-color:rgb(0,100,200)");
  });

  test("handles text before first escape", () => {
    const result = markup(renderAnsiLine("prefix \x1b[31mred\x1b[0m", "k"));
    expect(result).toContain("prefix ");
    expect(result).toContain("red");
  });
});

describe("renderAnsiText", () => {
  test("splits lines and renders each", () => {
    const nodes = renderAnsiText("\x1b[31mline1\x1b[0m\nline2");
    expect(nodes.length).toBe(3); // line1, "\n", line2
  });

  test("returns plain strings for plain text", () => {
    const nodes = renderAnsiText("a\nb");
    expect(nodes).toEqual(["a", "\n", "b"]);
  });
});
