import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUpdateApplication } from "@/hooks/use-applications";
import type { ApplicationStatus } from "@job-search-copilot/api/src/schemas/application.ts";

const STAGES: ApplicationStatus["stage"][] = [
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
];

/**
 * Builds a *valid* default status object for a given stage. This is the
 * function that has to change every time a new stage is added to the
 * union in api/src/schemas/application.ts — and TypeScript will error
 * here (not silently at runtime) if a stage's required fields aren't
 * populated, because the return type is ApplicationStatus, not `any`.
 */
function defaultStatusFor(stage: ApplicationStatus["stage"]): ApplicationStatus {
  const now = new Date().toISOString();
  switch (stage) {
    case "applied":
      return { stage: "applied", appliedAt: now };
    case "screening":
      return { stage: "screening" };
    case "interview":
      return { stage: "interview", interviewRound: 1 };
    case "offer":
      return { stage: "offer" };
    case "rejected":
      return { stage: "rejected", rejectedAt: now };
    case "withdrawn":
      return { stage: "withdrawn" };
  }
}

export function StageEditor({
  id,
  status,
}: {
  id: string;
  status: ApplicationStatus;
}) {
  const [draft, setDraft] = useState<ApplicationStatus>(status);
  const updateApplication = useUpdateApplication();

  function handleStageChange(stage: ApplicationStatus["stage"]) {
    setDraft(defaultStatusFor(stage));
  }

  function handleSave() {
    updateApplication.mutate({ id, input: { status: draft } });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="border-input h-8 rounded-md border bg-transparent px-2 text-xs shadow-sm"
        value={draft.stage}
        onChange={(e) => handleStageChange(e.target.value as ApplicationStatus["stage"])}
      >
        {STAGES.map((stage) => (
          <option key={stage} value={stage}>
            {stage}
          </option>
        ))}
      </select>

      {/* Each branch below only exists for its matching stage — this is
          the discriminated union expressed as conditional UI, not just
          a data-modeling exercise. */}
      {draft.stage === "interview" && (
        <Input
          type="number"
          className="h-8 w-20 text-xs"
          placeholder="Round"
          value={draft.interviewRound}
          onChange={(e) =>
            setDraft({ ...draft, interviewRound: Number(e.target.value) || 1 })
          }
        />
      )}

      {draft.stage === "offer" && (
        <Input
          type="number"
          className="h-8 w-28 text-xs"
          placeholder="Offer amount"
          value={draft.offerAmount ?? ""}
          onChange={(e) =>
            setDraft({
              ...draft,
              offerAmount: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      )}

      {draft.stage === "rejected" && (
        <Input
          className="h-8 w-40 text-xs"
          placeholder="Reason (optional)"
          value={draft.reason ?? ""}
          onChange={(e) => setDraft({ ...draft, reason: e.target.value || undefined })}
        />
      )}

      <Button
        size="sm"
        variant="outline"
        onClick={handleSave}
        disabled={updateApplication.isPending}
      >
        {updateApplication.isPending ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
