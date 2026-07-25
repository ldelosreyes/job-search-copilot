import { Button } from "@/components/ui/button";
import { useApplicationFitScore } from "@/hooks/use-application-fit-score";
import { useResumeStatus } from "@/hooks/use-resume";

// Its own component (not inlined in a .map()) so each card gets its own
// isPending/error state — a shared hook instance at the list level would
// make every card show "Scoring..." while only one was actually in flight.
export function FitScoreButton({
  id,
  hasJd,
  hasScore,
}: {
  id: string;
  hasJd: boolean;
  hasScore: boolean;
}) {
  const fitScore = useApplicationFitScore();
  const resumeStatus = useResumeStatus();
  const tooltipId = `fit-score-disabled-${id}`;
  const disabledReason = !hasJd
    ? "Add a job description before scoring fit."
    : resumeStatus.isLoading
      ? "Checking for an uploaded resume."
      : resumeStatus.isError
        ? "Resume availability could not be checked."
        : !resumeStatus.data?.filename
          ? "Upload a resume before scoring fit."
          : null;

  return (
    <div className="grid gap-1">
      <div
        className="group relative w-fit rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        tabIndex={disabledReason ? 0 : undefined}
        aria-describedby={disabledReason ? tooltipId : undefined}
      >
        <Button
          size="sm"
          variant="outline"
          className="w-fit"
          disabled={Boolean(disabledReason) || fitScore.isPending}
          onClick={() => fitScore.mutate(id)}
        >
          {fitScore.isPending ? "Scoring..." : hasScore ? "Re-score" : "Score fit"}
        </Button>
        {disabledReason && (
          <span
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-max max-w-64 rounded-md bg-foreground px-2 py-1 text-left text-xs text-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus:opacity-100"
          >
            {disabledReason}
          </span>
        )}
      </div>
      {fitScore.isError && (
        <p className="text-destructive text-xs">{(fitScore.error as Error).message}</p>
      )}
    </div>
  );
}
