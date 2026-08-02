import { useState } from "react";
import { ApplicationCard } from "@/components/application-card";
import { ApplicationCardSkeleton } from "@/components/application-card-skeleton";
import { useApplications } from "@/hooks/use-applications";

export function ApplicationList() {
  const { data: applications, isLoading, isError } = useApplications();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="grid gap-3" role="status">
        <span className="sr-only">Loading applications…</span>
        <ApplicationCardSkeleton aria-hidden="true" />
        <ApplicationCardSkeleton aria-hidden="true" />
        <ApplicationCardSkeleton aria-hidden="true" />
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-destructive text-sm">
        Couldn't load applications. Is the API running on :3001?
      </p>
    );
  }

  if (!applications || applications.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No applications yet — add your first one above.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {applications.map((application) => (
        <ApplicationCard
          key={application.id}
          application={application}
          isEditing={editingId === application.id}
          onEdit={() => setEditingId(application.id)}
          onCancel={() => setEditingId(null)}
        />
      ))}
    </div>
  );
}
