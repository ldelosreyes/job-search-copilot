import { Badge } from "@/components/ui/badge";
import type { ApplicationStatus } from "@job-search-copilot/api/src/schemas/application.ts";

const STAGE_CONFIG: Record<
  ApplicationStatus["stage"],
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  applied: { label: "Applied", variant: "secondary" },
  screening: { label: "Screening", variant: "default" },
  interview: { label: "Interview", variant: "default" },
  offer: { label: "Offer", variant: "outline" },
  rejected: { label: "Rejected", variant: "destructive" },
  withdrawn: { label: "Withdrawn", variant: "secondary" },
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const config = STAGE_CONFIG[status.stage];

  // TypeScript narrows `status` inside each branch based on `stage` —
  // status.interviewRound only exists (and only type-checks) inside the
  // "interview" branch, status.offerAmount only inside "offer", etc.
  let detail: string | null = null;
  switch (status.stage) {
    case "interview":
      detail = `Round ${status.interviewRound}`;
      break;
    case "offer":
      detail = status.offerAmount ? `$${status.offerAmount.toLocaleString()}` : null;
      break;
    case "rejected":
      detail = status.reason ?? null;
      break;
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant={config.variant}>{config.label}</Badge>
      {detail && <span className="text-muted-foreground text-xs">{detail}</span>}
    </div>
  );
}
