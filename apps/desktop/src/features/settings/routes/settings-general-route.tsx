export function SettingsGeneralRoute() {
  return (
    <div className="flex flex-1 justify-center overflow-y-auto p-8">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">General</h1>

        <section className="mt-8 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-[var(--border)] px-4 py-4">
            <div>
              <h2 className="text-base font-medium text-[var(--foreground)]">
                Default open destination
              </h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                Where files and folders open by default.
              </p>
            </div>
            <span className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-sm text-[var(--foreground)]">
              VS Code
            </span>
          </div>

          <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-[var(--border)] px-4 py-4">
            <div>
              <h2 className="text-base font-medium text-[var(--foreground)]">Language</h2>
              <p className="text-sm text-[var(--muted-foreground)]">Language for the app UI.</p>
            </div>
            <span className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-sm text-[var(--foreground)]">
              Auto Detect
            </span>
          </div>

          <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-4">
            <div>
              <h2 className="text-base font-medium text-[var(--foreground)]">Thread detail</h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                Choose how much command output to show in threads.
              </p>
            </div>
            <span className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-sm text-[var(--foreground)]">
              Steps with code commands
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
