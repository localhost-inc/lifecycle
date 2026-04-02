import { useParams } from "react-router-dom";

export function RepositorySettingsRoute() {
  const { repositoryId } = useParams();

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-xl rounded-md border border-[var(--border)] bg-[var(--card)] p-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Repository settings</h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Settings UI is coming soon for repository{" "}
          <code className="font-mono">{repositoryId}</code>.
        </p>
      </div>
    </div>
  );
}
