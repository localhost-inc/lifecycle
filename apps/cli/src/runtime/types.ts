import type { CommandDefinition } from "@localhost-inc/cmd";

export type AnyCommandDefinition = CommandDefinition<any>;

export type CommandLoader = () => Promise<AnyCommandDefinition>;

export type CommandRegistry = Record<string, CommandLoader>;
