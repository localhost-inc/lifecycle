import { EmptyState } from "@lifecycle/ui";
import { ScrollText } from "lucide-react";

export function LogsTab() {
  return (
    <EmptyState
      description="Log streaming lands in the next environment-panel slice. Service state and failure reasons remain available in Environment for now."
      icon={<ScrollText />}
      size="sm"
      title="Logs coming next"
    />
  );
}
