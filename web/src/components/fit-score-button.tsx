import { Button } from "@/components/ui/button";
import { useApplicationFitScore } from "@/hooks/use-application-fit-score";

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

  return (
    <div className="grid gap-1">
      <Button
        size="sm"
        variant="outline"
        className="w-fit"
        disabled={!hasJd || fitScore.isPending}
        onClick={() => fitScore.mutate(id)}
      >
        {fitScore.isPending ? "Scoring..." : hasScore ? "Re-score" : "Score fit"}
      </Button>
      {fitScore.isError && (
        <p className="text-destructive text-xs">{(fitScore.error as Error).message}</p>
      )}
    </div>
  );
}
