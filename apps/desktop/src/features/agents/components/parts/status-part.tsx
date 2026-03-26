import { Shimmer } from "@lifecycle/ui";

export function StatusPart({ text }: { text: string }) {
  return (
    <Shimmer as="div" className="text-[11px]" duration={1.5}>
      {text}
    </Shimmer>
  );
}
