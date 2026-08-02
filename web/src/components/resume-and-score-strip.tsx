import { useEffect, useRef, useState } from "react";
import { Check, FileUp, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useDeleteResume,
  useResumeStatus,
  useUploadResume,
} from "@/hooks/use-resume";
import { useFitScoreAll, useFitScoreAllStatus } from "@/hooks/use-fit-score-all";

function RemoveResumeDialog({
  filename,
  onClose,
}: {
  filename: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const deleteResume = useDeleteResume();
  const titleId = "remove-resume-title";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/50"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="grid gap-5 p-5 sm:p-6">
        <div className="grid gap-2">
          <h2 id={titleId} className="text-lg font-semibold">
            Remove resume
          </h2>
          <p className="text-muted-foreground text-sm">
            Remove <strong className="text-foreground font-medium">{filename}</strong>?
            This will also clear all saved fit scores. You can upload another resume
            later.
          </p>
          {deleteResume.isError && (
            <p className="text-destructive text-sm">
              {(deleteResume.error as Error).message}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" autoFocus onClick={onClose}>
            Cancel
          </Button>
          <Button
            data-confirm-remove-resume
            type="button"
            variant="destructive"
            disabled={deleteResume.isPending}
            onClick={() => deleteResume.mutate(undefined, { onSuccess: onClose })}
          >
            {deleteResume.isPending ? "Removing..." : "Remove"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * Resume upload/status plus the one main-screen "Score applications"
 * action — batches every unscored/stale application in one call (see
 * POST /fit-score-all), skipping ones already scored against the same
 * JD/title/resume to avoid spending LLM budget on an unchanged answer.
 * Per-application re-scoring lives on each card instead (FitScoreButton).
 */
export function ResumeAndScoreStrip() {
  const resumeStatus = useResumeStatus();
  const uploadResume = useUploadResume();
  const fitScoreAll = useFitScoreAll();
  const fitScoreStatus = useFitScoreAllStatus();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);

  const hasResume = Boolean(resumeStatus.data?.filename);
  const scoreStatus = fitScoreStatus.data;
  const scoresUpToDate =
    hasResume &&
    !fitScoreStatus.isLoading &&
    !fitScoreStatus.isError &&
    (scoreStatus?.eligibleCount ?? 0) > 0 &&
    scoreStatus?.scoreableCount === 0;
  const scoreDisabledReason = !hasResume
    ? "Upload a resume before scoring applications."
    : fitScoreStatus.isLoading
      ? "Checking which applications need scoring."
      : fitScoreStatus.isError || !scoreStatus
        ? "Scoring status could not be checked."
        : scoreStatus.eligibleCount === 0
          ? "Add a job description to at least one application before scoring."
          : scoresUpToDate
            ? "All applications are scored for the current resume and job descriptions."
            : null;
  const scoreTooltipId = "score-applications-disabled";

  function closeRemoveDialog() {
    setIsConfirmingRemove(false);
    requestAnimationFrame(() => {
      stripRef.current
        ?.querySelector<HTMLButtonElement>("[data-remove-resume]")
        ?.focus({ preventScroll: true });
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadResume.mutate(file);
  }

  return (
    <>
      <div
        ref={stripRef}
        className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm"
      >
        <div className="grid gap-1">
          <p>
            {resumeStatus.isLoading
              ? "Loading resume status…"
              : hasResume
                ? `Current resume: ${resumeStatus.data!.filename} · updated ${new Date(
                    resumeStatus.data!.updatedAt!,
                  ).toLocaleString()}`
                : "No resume uploaded yet — upload one to score fit."}
          </p>
          {uploadResume.isError && (
            <p className="text-destructive text-xs">
              {(uploadResume.error as Error).message}
            </p>
          )}
          {fitScoreAll.isError && (
            <p className="text-destructive text-xs">
              {(fitScoreAll.error as Error).message}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasResume ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Replace resume"
                title="Replace resume"
                disabled={uploadResume.isPending}
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="size-4" aria-hidden="true" />
              </Button>
              <Button
                data-remove-resume
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                aria-label="Remove resume"
                title="Remove resume"
                disabled={uploadResume.isPending}
                onClick={() => setIsConfirmingRemove(true)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadResume.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadResume.isPending ? "Uploading..." : "Upload resume"}
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx"
            className="hidden"
            onChange={handleFileChange}
          />
          <div
            className="group relative rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            tabIndex={scoreDisabledReason ? 0 : undefined}
            aria-describedby={scoreDisabledReason ? scoreTooltipId : undefined}
          >
            <Button
              type="button"
              size="sm"
              disabled={Boolean(scoreDisabledReason) || fitScoreAll.isPending}
              onClick={() => fitScoreAll.mutate()}
            >
              {fitScoreAll.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Scoring...
                </>
              ) : scoresUpToDate ? (
                <>
                  Scores up to date
                  <Check className="size-4" aria-hidden="true" />
                </>
              ) : (
                "Score applications"
              )}
            </Button>
            {scoreDisabledReason && (
              <span
                id={scoreTooltipId}
                role="tooltip"
                className="pointer-events-none absolute right-0 bottom-full z-10 mb-2 w-max max-w-64 rounded-md bg-foreground px-2 py-1 text-left text-xs text-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus:opacity-100"
              >
                {scoreDisabledReason}
              </span>
            )}
          </div>
        </div>
      </div>
      {isConfirmingRemove && resumeStatus.data?.filename && (
        <RemoveResumeDialog
          filename={resumeStatus.data.filename}
          onClose={closeRemoveDialog}
        />
      )}
    </>
  );
}
