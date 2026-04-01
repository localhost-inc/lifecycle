// Shim for Cloudflare types referenced transitively by @lifecycle/api's AppType.
// The CLI never uses these at runtime — this satisfies the type checker.
declare interface D1Database {}
declare interface D1Result<T = unknown> {}
