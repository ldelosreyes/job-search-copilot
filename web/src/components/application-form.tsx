import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateApplication } from "@/hooks/use-applications";
import { useAnalyzeWithAi } from "@/hooks/use-analyze-with-ai";
import type { ApplicationSource } from "@job-search-copilot/api/src/schemas/application.ts";

const SOURCE_OPTIONS: { value: ApplicationSource; label: string }[] = [
  { value: "recruiter", label: "Recruiter" },
  { value: "direct", label: "Direct" },
  { value: "referral", label: "Referral" },
  { value: "job_board", label: "Job board" },
  { value: "other", label: "Other" },
];

const emptyForm = {
  company: "",
  roleTitle: "",
  source: "direct" as ApplicationSource,
  salaryMin: "",
  salaryMax: "",
  jdText: "",
  notes: "",
};

// Mirrors api/src/lib/ai-limits.ts's JD_TEXT_MAX_CHARS default. The web app
// can't import the live, env-overridable value without pulling server-only
// code into the browser bundle, so this is kept in sync by hand.
const JD_TEXT_MAX_CHARS = 8_000;

// Fields "Analyze with AI" can autofill from the JD. Once the user edits one
// of these directly, autofill stops touching it — no matter what the AI
// returns for it on a later analysis — so it can only ever help fill in a
// blank field, never overwrite something the user has already set.
type AutofillableField = "company" | "roleTitle" | "source" | "salaryMin" | "salaryMax";

export function ApplicationForm() {
  const [form, setForm] = useState(emptyForm);
  const [touched, setTouched] = useState<Set<AutofillableField>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const createApplication = useCreateApplication();
  const analyze = useAnalyzeWithAi();

  function update<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setTouched((prev) => {
      const field = key as AutofillableField;
      return prev.has(field) ? prev : new Set(prev).add(field);
    });
  }

  const jdTextOverLimit = form.jdText.length > JD_TEXT_MAX_CHARS;

  function handleAnalyze() {
    const jdText = form.jdText.trim();
    if (!jdText || jdTextOverLimit) return;
    analyze.mutate(jdText, {
      onSuccess: (result) => {
        if (!result.jdParse.ok) return;
        const parsed = result.jdParse.data;
        setForm((prev) => ({
          ...prev,
          company: touched.has("company") ? prev.company : parsed.company.trim(),
          roleTitle: touched.has("roleTitle") ? prev.roleTitle : parsed.roleTitle.trim(),
          source: touched.has("source") ? prev.source : parsed.source,
          salaryMin: touched.has("salaryMin")
            ? prev.salaryMin
            : parsed.salaryMin != null
              ? String(parsed.salaryMin)
              : "",
          salaryMax: touched.has("salaryMax")
            ? prev.salaryMax
            : parsed.salaryMax != null
              ? String(parsed.salaryMax)
              : "",
        }));
      },
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.company.trim() || !form.roleTitle.trim()) {
      setError("Company and role title are required.");
      return;
    }

    try {
      await createApplication.mutateAsync({
        company: form.company.trim(),
        roleTitle: form.roleTitle.trim(),
        source: form.source,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
        salaryMax: form.salaryMax ? Number(form.salaryMax) : null,
        jdText: form.jdText.trim() || null,
        notes: form.notes.trim() || null,
        status: { stage: "applied", appliedAt: new Date().toISOString() },
      });
      setForm(emptyForm);
      setTouched(new Set());
    } catch {
      setError("Something went wrong saving the application. Try again.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New application</CardTitle>
        <CardDescription>Log a role you've applied to.</CardDescription>
      </CardHeader>
      <CardContent className="pb-6">
        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              placeholder="Company"
              value={form.company}
              onChange={(e) => update("company", e.target.value)}
            />
            <Input
              placeholder="Role title"
              value={form.roleTitle}
              onChange={(e) => update("roleTitle", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <select
              className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-sm"
              value={form.source}
              onChange={(e) => update("source", e.target.value as ApplicationSource)}
            >
              {SOURCE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <Input
              type="number"
              placeholder="Salary min"
              value={form.salaryMin}
              onChange={(e) => update("salaryMin", e.target.value)}
            />
            <Input
              type="number"
              placeholder="Salary max"
              value={form.salaryMax}
              onChange={(e) => update("salaryMax", e.target.value)}
            />
          </div>

          <textarea
            className="border-input min-h-20 rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm"
            placeholder="Paste the JD (optional)"
            value={form.jdText}
            onChange={(e) => update("jdText", e.target.value)}
          />
          <p className={`text-xs ${jdTextOverLimit ? "text-destructive" : "text-muted-foreground"}`}>
            {form.jdText.length.toLocaleString()} / {JD_TEXT_MAX_CHARS.toLocaleString()} characters
            {jdTextOverLimit && " — trim the JD before analyzing"}
          </p>

          <div className="flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={!form.jdText.trim() || jdTextOverLimit || analyze.isPending}
              onClick={handleAnalyze}
            >
              {analyze.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Analyzing...
                </>
              ) : (
                <>
                  Analyze with AI
                  <Sparkles className="size-4" aria-hidden="true" />
                </>
              )}
            </Button>
            {analyze.data && !analyze.data.jdParse.ok && (
              <p className="text-destructive text-sm">{analyze.data.jdParse.error}</p>
            )}
          </div>

          {analyze.isPending ? (
            <Skeleton className="h-4 w-64" role="status" aria-label="Analyzing job description…" />
          ) : (
            <>
              {analyze.data?.fitScore.ok && (
                <p className="text-sm">
                  Fit score: <strong>{analyze.data.fitScore.data.score}</strong> —{" "}
                  {analyze.data.fitScore.data.rationale}
                </p>
              )}
              {analyze.data && !analyze.data.fitScore.ok && (
                <p className="text-muted-foreground text-sm">{analyze.data.fitScore.error}</p>
              )}
            </>
          )}

          <Input
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
          />

          {error && <p className="text-destructive text-sm">{error}</p>}

          <Button type="submit" disabled={createApplication.isPending}>
            {createApplication.isPending ? "Saving..." : "Add application"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
