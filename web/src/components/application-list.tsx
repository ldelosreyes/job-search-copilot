import { useState } from "react";
import { ApplicationCard } from "@/components/application-card";
import { useApplications } from "@/hooks/use-applications";

export function ApplicationList() {
  const { data: applications, isLoading, isError } = useApplications();
  const [editingId, setEditingId] = useState<string | null>(null);

  if (isLoading) {
    return <p className="text-muted-foreground text-sm">Loading applications…</p>;
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
