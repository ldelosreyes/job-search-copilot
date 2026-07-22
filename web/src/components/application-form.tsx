import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCreateApplication } from "@/hooks/use-applications";
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

export function ApplicationForm() {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const createApplication = useCreateApplication();

  function update<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
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
      <CardContent>
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
