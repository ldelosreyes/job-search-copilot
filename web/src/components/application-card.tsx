import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FitScoreButton } from "@/components/fit-score-button";
import { StatusBadge } from "@/components/status-badge";
import { useDeleteApplication, useUpdateApplication } from "@/hooks/use-applications";
import type {
  Application,
  ApplicationSource,
  ApplicationStatus,
} from "@job-search-copilot/api/src/schemas/application.ts";

const SOURCES: { value: ApplicationSource; label: string }[] = [
  { value: "recruiter", label: "Recruiter" },
  { value: "direct", label: "Direct" },
  { value: "referral", label: "Referral" },
  { value: "job_board", label: "Job board" },
  { value: "other", label: "Other" },
];

const STAGES: ApplicationStatus["stage"][] = [
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
];

function formatSalary(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `$${min.toLocaleString()}–$${max.toLocaleString()}`;
  return `$${(min ?? max)!.toLocaleString()}`;
}

function scoreBand(score: number): { label: string; text: string } {
  if (score >= 75) return { label: "Strong match", text: "text-green-700" };
  if (score >= 50) return { label: "Possible match", text: "text-amber-700" };
  return { label: "Weak match", text: "text-red-700" };
}

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

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`grid gap-1 text-xs font-medium ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function ApplicationCardEditor({
  application,
  onCancel,
}: {
  application: Application;
  onCancel: () => void;
}) {
  const [company, setCompany] = useState(application.company);
  const [roleTitle, setRoleTitle] = useState(application.roleTitle);
  const [source, setSource] = useState(application.source);
  const [salaryMin, setSalaryMin] = useState(
    application.salaryMin == null ? "" : String(application.salaryMin),
  );
  const [salaryMax, setSalaryMax] = useState(
    application.salaryMax == null ? "" : String(application.salaryMax),
  );
  const [status, setStatus] = useState<ApplicationStatus>(application.status);
  const [jdText, setJdText] = useState(application.jdText ?? "");
  const [notes, setNotes] = useState(application.notes ?? "");
  const updateApplication = useUpdateApplication();
  const numericError =
    [salaryMin, salaryMax].some((value) => value !== "" && Number(value) < 0)
      ? "Salaries cannot be negative."
      : status.stage === "offer" &&
          status.offerAmount !== undefined &&
          status.offerAmount <= 0
        ? "Offer amount must be greater than zero."
        : null;

  function handleSave() {
    updateApplication.mutate(
      {
        id: application.id,
        input: {
          company: company.trim(),
          roleTitle: roleTitle.trim(),
          source,
          salaryMin: salaryMin ? Number(salaryMin) : null,
          salaryMax: salaryMax ? Number(salaryMax) : null,
          status,
          jdText: jdText.trim() || null,
          notes: notes.trim() || null,
        },
      },
      { onSuccess: onCancel },
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company">
          <Input
            autoFocus
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </Field>
        <Field label="Role title">
          <Input value={roleTitle} onChange={(event) => setRoleTitle(event.target.value)} />
        </Field>
        <Field label="Source">
          <select
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-sm"
            value={source}
            onChange={(event) => setSource(event.target.value as ApplicationSource)}
          >
            {SOURCES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Salary minimum">
            <Input
              type="number"
              min={0}
              value={salaryMin}
              onChange={(event) => setSalaryMin(event.target.value)}
            />
          </Field>
          <Field label="Salary maximum">
            <Input
              type="number"
              min={0}
              value={salaryMax}
              onChange={(event) => setSalaryMax(event.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Stage">
          <select
            className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-sm"
            value={status.stage}
            onChange={(event) =>
              setStatus(defaultStatusFor(event.target.value as ApplicationStatus["stage"]))
            }
          >
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {stage.charAt(0).toUpperCase()}
                {stage.slice(1)}
              </option>
            ))}
          </select>
        </Field>

        {status.stage === "interview" && (
          <Field label="Interview round">
            <Input
              type="number"
              min={1}
              value={status.interviewRound}
              onChange={(event) =>
                setStatus({
                  ...status,
                  interviewRound: Number(event.target.value) || 1,
                })
              }
            />
          </Field>
        )}
        {status.stage === "offer" && (
          <Field label="Offer amount">
            <Input
              type="number"
              min={1}
              value={status.offerAmount ?? ""}
              onChange={(event) =>
                setStatus({
                  ...status,
                  offerAmount: event.target.value ? Number(event.target.value) : undefined,
                })
              }
            />
          </Field>
        )}
      </div>

      <Field label="Job description">
        <textarea
          className="border-input min-h-28 rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm"
          value={jdText}
          onChange={(event) => setJdText(event.target.value)}
        />
      </Field>
      <Field label="Notes">
        <textarea
          className="border-input min-h-20 rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>

      {numericError && (
        <p role="alert" className="text-destructive text-sm">
          {numericError}
        </p>
      )}
      {updateApplication.isError && (
        <p role="alert" className="text-destructive text-sm">
          {(updateApplication.error as Error).message}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          type="button"
          disabled={
            !company.trim() ||
            !roleTitle.trim() ||
            Boolean(numericError) ||
            updateApplication.isPending
          }
          onClick={handleSave}
        >
          {updateApplication.isPending ? "Saving..." : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ApplicationEditDialog({
  application,
  onClose,
}: {
  application: Application;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = `edit-application-${application.id}`;

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
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/50"
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
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <h2 id={titleId} className="text-lg font-semibold">
              Edit application
            </h2>
            <p className="text-muted-foreground text-sm">
              {application.roleTitle} at {application.company}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close edit dialog"
            onClick={onClose}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <ApplicationCardEditor application={application} onCancel={onClose} />
      </div>
    </dialog>
  );
}

function DeleteApplicationDialog({
  application,
  onClose,
}: {
  application: Application;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const deleteApplication = useDeleteApplication();
  const titleId = `delete-application-${application.id}`;

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
            Delete application
          </h2>
          <p className="text-muted-foreground text-sm">
            Are you sure you want to delete{" "}
            <strong className="text-foreground font-medium">
              {application.roleTitle} at {application.company}
            </strong>
            ? This action cannot be undone.
          </p>
          {deleteApplication.isError && (
            <p role="alert" className="text-destructive text-sm">
              {(deleteApplication.error as Error).message}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" autoFocus onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteApplication.isPending}
            onClick={() =>
              deleteApplication.mutate(application.id, { onSuccess: onClose })
            }
          >
            {deleteApplication.isPending ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

export function ApplicationCard({
  application,
  isEditing,
  onEdit,
  onCancel,
}: {
  application: Application;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const salary = formatSalary(application.salaryMin, application.salaryMax);
  const sourceLabel =
    SOURCES.find((source) => source.value === application.source)?.label ??
    application.source;
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  function closeEditor() {
    onCancel();
    requestAnimationFrame(() => {
      cardRef.current
        ?.querySelector<HTMLButtonElement>("[data-edit-application]")
        ?.focus({ preventScroll: true });
    });
  }

  function closeDeleteDialog() {
    setIsConfirmingDelete(false);
    requestAnimationFrame(() => {
      cardRef.current
        ?.querySelector<HTMLButtonElement>("[data-delete-application]")
        ?.focus({ preventScroll: true });
    });
  }

  return (
    <Card ref={cardRef}>
      <CardHeader>
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:gap-4">
          <div className="grid gap-1.5">
            <div className="flex flex-nowrap items-start gap-2">
              <CardTitle className="min-w-0">{application.roleTitle}</CardTitle>
              <StatusBadge status={application.status} />
            </div>
            <CardDescription>
              {application.company}
              {salary ? ` · ${salary}` : ""} · via {sourceLabel}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button
              data-edit-application
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Edit application"
              title="Edit application"
              onClick={onEdit}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
            <Button
              data-delete-application
              type="button"
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              aria-label="Delete application"
              title="Delete application"
              onClick={() => setIsConfirmingDelete(true)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pb-6">
        {application.notes && (
          <p className="text-muted-foreground text-sm">{application.notes}</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <FitScoreButton
            id={application.id}
            hasJd={Boolean(application.jdText)}
            hasScore={application.fitScore !== null}
          />
          {application.fitScore !== null && (
            <p className="text-sm">
              Fit: <strong>{application.fitScore}</strong>{" "}
              <span className={scoreBand(application.fitScore).text}>
                — {scoreBand(application.fitScore).label}
              </span>
              {application.fitRationale && (
                <span className="text-muted-foreground">
                  {" "}
                  · {application.fitRationale}
                </span>
              )}
            </p>
          )}
        </div>
      </CardContent>
      {isEditing && (
        <ApplicationEditDialog application={application} onClose={closeEditor} />
      )}
      {isConfirmingDelete && (
        <DeleteApplicationDialog
          application={application}
          onClose={closeDeleteDialog}
        />
      )}
    </Card>
  );
}
