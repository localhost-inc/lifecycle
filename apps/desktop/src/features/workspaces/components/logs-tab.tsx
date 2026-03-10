import { EmptyState } from "@lifecycle/ui";
import { ScrollText } from "lucide-react";

export function LogsTab() {
  return (
    <EmptyState
      description="Runtime log streaming lands in the next environment-panel slice. Service state and failure reasons remain available in Services for now."
      icon={<ScrollText />}
      size="sm"
      title="Logs coming next"
    />
  );
}
