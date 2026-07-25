import { Fragment, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useResumeStatus, useUploadResume } from "@/hooks/use-resume";
import { useFitScoreAll } from "@/hooks/use-fit-score-all";
import { useApplications } from "@/hooks/use-applications";
import type { FitScoreAllItem } from "@job-search-copilot/api/src/schemas/fit-score-all.ts";
import type { Application } from "@job-search-copilot/api/src/schemas/application.ts";

function scoreBand(score: number): { label: string; dot: string; text: string } {
  if (score >= 75) return { label: "Strong match", dot: "bg-green-500", text: "text-green-700" };
  if (score >= 50) return { label: "Possible match", dot: "bg-amber-500", text: "text-amber-700" };
  return { label: "Weak match", dot: "bg-red-500", text: "text-red-700" };
}

export function ResumeFitView() {
  const resumeStatus = useResumeStatus();
  const uploadResume = useUploadResume();
  const fitScoreAll = useFitScoreAll();
  const applications = useApplications();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const hasResume = Boolean(resumeStatus.data?.filename);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) uploadResume.mutate(file);
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Resume Fit</CardTitle>
          <CardDescription>
            Score how well your resume fits every tracked application with a JD, in one action.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 pb-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">
              {resumeStatus.isLoading
                ? "Loading resume status…"
                : hasResume
                  ? `Current resume: ${resumeStatus.data!.filename} · updated ${new Date(
                      resumeStatus.data!.updatedAt!,
                    ).toLocaleString()}`
                  : "No resume uploaded yet — upload one to check fit."}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadResume.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadResume.isPending ? "Uploading..." : hasResume ? "Replace" : "Upload resume"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          {uploadResume.isError && (
            <p className="text-destructive text-sm">{(uploadResume.error as Error).message}</p>
          )}

          <Button
            type="button"
            disabled={!hasResume || fitScoreAll.isPending}
            onClick={() => fitScoreAll.mutate()}
          >
            {fitScoreAll.isPending ? "Scoring applications…" : "Score all applications"}
          </Button>
          {fitScoreAll.isError && (
            <p className="text-destructive text-sm">{(fitScoreAll.error as Error).message}</p>
          )}
        </CardContent>
      </Card>

      {fitScoreAll.data && (
        <ResumeFitResults
          results={fitScoreAll.data.results}
          consideredCount={fitScoreAll.data.consideredCount}
          skippedCount={fitScoreAll.data.skippedCount}
          applications={applications.data ?? []}
          expandedId={expandedId}
          onToggle={(id) => setExpandedId((prev) => (prev === id ? null : id))}
        />
      )}
    </div>
  );
}

function ResumeFitResults({
  results,
  consideredCount,
  skippedCount,
  applications,
  expandedId,
  onToggle,
}: {
  results: FitScoreAllItem[];
  consideredCount: number;
  skippedCount: number;
  applications: Application[];
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  if (consideredCount === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        None of your tracked applications have a JD yet — add one from the applications list to
        see a fit score here.
      </p>
    );
  }

  const byId = new Map(applications.map((app) => [app.id, app]));

  return (
    <Card>
      <CardContent className="grid gap-3 pt-6">
        {skippedCount > 0 && (
          <p className="text-muted-foreground text-xs">
            Showing your {consideredCount} most recent applications with a JD · {skippedCount}{" "}
            others skipped.
          </p>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs">
              <th className="pb-2 font-medium">Company</th>
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 font-medium">Fit</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => {
              const app = byId.get(result.applicationId);
              const band = scoreBand(result.score);
              const expanded = expandedId === result.applicationId;
              return (
                <Fragment key={result.applicationId}>
                  <tr
                    className="hover:bg-muted/50 cursor-pointer border-b last:border-0"
                    onClick={() => onToggle(result.applicationId)}
                  >
                    <td className="py-2">{app?.company ?? "Unknown"}</td>
                    <td className="py-2">{app?.roleTitle ?? "Unknown"}</td>
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${band.dot}`} />
                        <span className={band.text}>
                          {result.score} — {band.label}
                        </span>
                      </span>
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={3} className="text-muted-foreground pb-3 text-xs">
                        {result.rationale}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
