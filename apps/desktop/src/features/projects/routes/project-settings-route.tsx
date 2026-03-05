import { useParams } from "react-router-dom";

export function ProjectSettingsRoute() {
  const { projectId } = useParams();

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-xl rounded-md border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Project settings</h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Settings UI is coming soon for project <code className="font-mono">{projectId}</code>.
        </p>
      </div>
    </div>
  );
}
