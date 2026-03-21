# @lifecycle/cmd

Lightweight, filesystem-based CLI framework for Lifecycle tooling. Commands are discovered from a `commands/` directory, inputs are validated with Zod, and help text is generated from the directory tree plus command schema metadata.

## Features

- Zod-first command inputs with typed `run` handlers
- Kebab-case flags derived from schema keys
- Short aliases via `defineFlag` (e.g. `-v` for `--verbose`)
- Boolean negation (`--no-flag`) and array flags
- Built-in `--help` output at both namespace and command levels

## Usage

Create a command module under `commands/`:

```ts
import { z } from "zod";
import { defineCommand, defineFlag } from "@lifecycle/cmd";

const input = z.object({
  verbose: defineFlag(z.boolean().default(false).describe("Enable verbose logging."), {
    aliases: ["v"],
  }),
  args: z.array(z.string()).describe("Files to process."),
});

export default defineCommand({
  description: "Process files.",
  input,
  run: async (options) => {
    if (options.verbose) console.log("Running...");
    for (const file of options.args) {
      console.log(file);
    }
  },
});
```

Wire up the CLI entrypoint:

```ts
import { runCli } from "@lifecycle/cmd";

await runCli({
  name: "mycli",
  baseDir: import.meta.dir,
});
```

Commands resolve by path, so `commands/foo/bar.ts` maps to `mycli foo bar`.
Directories become namespaces automatically, so `commands/workspace/create.ts` and
`commands/workspace/status.ts` make `mycli workspace --help` list `create` and `status`
without any explicit namespace file.

For example:

```text
src/
  index.ts
  commands/
    project/
      create.ts
    workspace/
      create.ts
      status.ts
      service/
        list.ts
        set.ts
```

This yields:

- `mycli --help`
- `mycli project --help`
- `mycli workspace --help`
- `mycli workspace service --help`
- `mycli workspace create --help`

## Flag conventions

- Schema key `dryRun` becomes `--dry-run`
- `defineFlag(..., { aliases: ["d"] })` adds `-d`
- `z.array(...)` accepts multiple values (`--tags a b`)
- `z.boolean()` supports `--no-flag`
- Include `args` in the schema to collect positionals

## Development

From repo root:

```sh
bun --cwd packages/cmd test
bun --cwd packages/cmd run lint
bun --cwd packages/cmd run typecheck
```
