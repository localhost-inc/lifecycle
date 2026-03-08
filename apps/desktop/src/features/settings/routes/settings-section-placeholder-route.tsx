import { Card, CardContent } from "@lifecycle/ui";

interface SettingsSectionPlaceholderRouteProps {
  title: string;
  description: string;
}

export function SettingsSectionPlaceholderRoute({
  title,
  description,
}: SettingsSectionPlaceholderRouteProps) {
  return (
    <div className="flex flex-1 justify-center overflow-y-auto p-8">
      <div className="w-full max-w-4xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">{title}</h1>
        <Card className="mt-8">
          <CardContent className="p-6">
            <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
