set shell := ["bash", "-euo", "pipefail", "-c"]

# Show the available recipes.
default:
  @just --list

# Install repo dependencies and hooks.
setup:
  bun install

# Apply repo formatting.
format:
  bun run format

# Run repo lint checks.
lint:
  bun run lint

# Run repo type checks.
typecheck:
  bun run typecheck

# Run repo tests.
test:
  bun run test

# Build the full workspace.
build:
  bun run build

# Run the default repo verification gate.
check:
  bun run qa

# Alias for the default repo verification gate.
qa:
  bun run qa

# Format first, then run the full verification gate.
fix:
  bun run format
  bun run qa

# Start a dev loop. Primary targets: tui, desktop. Support targets: desktop-services, desktop-app, desktop-smoke.
dev target="tui":
  ./scripts/dev {{target}}

# Show the current dev service state.
status:
  ./scripts/dev status

# Stop the owned dev services and listeners.
stop:
  ./scripts/dev stop

# Tail a dev log. Services: bridge, control-plane, desktop-mac, desktop-mac-app.
logs service="bridge":
  ./scripts/dev logs {{service}}

# Start the primary native macOS desktop dev loop.
desktop:
  ./scripts/dev desktop

# Start the primary CLI-owned TUI dev loop.
tui:
  ./scripts/dev tui

# Smoke test the desktop dev loop.
smoke:
  bun run desktop:mac:smoke

# Start the CLI-owned TUI dev loop against the repo-local bridge + control plane.
tui-local:
  ./scripts/dev tui --local

# Regenerate bridge routed/openapi artifacts.
bridge-generate:
  bun --cwd apps/cli run bridge:generate

# Print the canonical Xcode Run environment.
xcode-env:
  bun run desktop:mac:xcode-env
