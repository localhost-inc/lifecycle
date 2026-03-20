import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryProvider } from "@/query/provider";
import { useQuery } from "@/query/use-query";

describe("useQuery", () => {
  test("reports disabled when no descriptor is provided", () => {
    function QueryStatusProbe() {
      const result = useQuery<never>(null);
      return createElement(
        "output",
        {
          "data-loading": String(result.isLoading),
          "data-status": result.status,
        },
        result.data === undefined ? "undefined" : String(result.data),
      );
    }

    const markup = renderToStaticMarkup(
      createElement(QueryProvider, {
        children: createElement(QueryStatusProbe, null),
      }),
    );

    expect(markup).toContain('data-status="disabled"');
    expect(markup).toContain('data-loading="false"');
    expect(markup).toContain(">undefined<");
  });
});
