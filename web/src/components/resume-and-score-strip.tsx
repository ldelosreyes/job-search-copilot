import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { useResumeStatus, useUploadResume } from "@/hooks/use-resume";
import { useFitScoreAll } from "@/hooks/use-fit-score-all";

/**
 * Resume upload/status plus the one main-screen "Score new applications"
 * action — batches every unscored/stale application in one call (see
 * POST /fit-score-all), skipping ones already scored against the same
 * JD/title/resume to avoid spending LLM budget on an unchanged answer.
 * Per-application re-scoring lives on each card instead (FitScoreButton).
 */
export function ResumeAndScoreStrip() {
  const resumeStatus = useResumeStatus();
  const uploadResume = useUploadResume();
  const fitScoreAll = useFitScoreAll();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasResume = Boolean(resumeStatus.data?.filename);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadResume.mutate(file);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
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
          <p className="text-destructive text-xs">{(uploadResume.error as Error).message}</p>
        )}
        {fitScoreAll.isError && (
          <p className="text-destructive text-xs">{(fitScoreAll.error as Error).message}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploadResume.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadResume.isPending ? "Uploading..." : hasResume ? "Replace resume" : "Upload resume"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          size="sm"
          disabled={!hasResume || fitScoreAll.isPending}
          onClick={() => fitScoreAll.mutate()}
        >
          {fitScoreAll.isPending ? "Scoring..." : "Score new applications"}
        </Button>
      </div>
    </div>
  );
}
