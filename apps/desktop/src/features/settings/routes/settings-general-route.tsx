import { Badge, Card, CardContent, CardHeader, CardTitle } from "@lifecycle/ui";

export function SettingsGeneralRoute() {
  return (
    <div className="flex flex-1 justify-center overflow-y-auto p-8">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">General</h1>

        <Card className="mt-8 overflow-hidden">
          <CardHeader>
            <CardTitle>Defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0 p-0">
            <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-[var(--border)] px-4 py-4">
              <div>
                <h2 className="text-base font-medium text-[var(--foreground)]">
                  Default open destination
                </h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Where files and folders open by default.
                </p>
              </div>
              <Badge variant="outline">VS Code</Badge>
            </div>

            <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-[var(--border)] px-4 py-4">
              <div>
                <h2 className="text-base font-medium text-[var(--foreground)]">Language</h2>
                <p className="text-sm text-[var(--muted-foreground)]">Language for the app UI.</p>
              </div>
              <Badge variant="outline">Auto Detect</Badge>
            </div>

            <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-4">
              <div>
                <h2 className="text-base font-medium text-[var(--foreground)]">Thread detail</h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Choose how much command output to show in threads.
                </p>
              </div>
              <Badge variant="outline">Steps with code commands</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
