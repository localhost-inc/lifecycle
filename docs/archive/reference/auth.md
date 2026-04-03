# Auth

Lifecycle treats authentication as a separate shared boundary from `db`, `store`, `workspace`, and `agents`.

## Contract

1. `packages/auth` owns the shared auth session contract.
2. Apps consume auth state through `@lifecycle/auth/react`.
3. Apps provide a concrete `AuthClient` implementation that resolves the current session for that platform.
4. Desktop-only transport details must stay behind that client; they do not belong in feature-local `api`, `source`, or provider files.

## Session Model

1. `AuthSession` is the product-level auth shape.
2. `logged_out` and `logged_in` are the only session states.
3. `source` describes where the session came from, not which surface is rendering it.
4. A missing or failed auth check must resolve to a typed logged-out session with an explicit message when possible.

## Platform Rules

1. Local workflows must still function with no authenticated session.
2. Signing in unlocks cloud capabilities; it does not change local workspace authority.
3. Desktop currently resolves auth through a platform auth client, but the UI only knows about the shared `AuthClient` contract.
4. Future web and native clients should implement the same `AuthClient` surface instead of introducing app-specific auth state seams.
