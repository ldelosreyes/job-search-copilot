import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { StageEditor } from "@/components/stage-editor";
import { useApplications, useDeleteApplication } from "@/hooks/use-applications";

function formatSalary(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) return `$${min.toLocaleString()}–$${max.toLocaleString()}`;
  return `$${(min ?? max)!.toLocaleString()}`;
}

export function ApplicationList() {
  const { data: applications, isLoading, isError } = useApplications();
  const deleteApplication = useDeleteApplication();

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
      {applications.map((app) => {
        const salary = formatSalary(app.salaryMin, app.salaryMax);
        return (
          <Card key={app.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>{app.roleTitle}</CardTitle>
                  <CardDescription>
                    {app.company}
                    {salary ? ` · ${salary}` : ""} · via {app.source.replace("_", " ")}
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteApplication.mutate(app.id)}
                >
                  Delete
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2 pb-6">
              <StatusBadge status={app.status} />
              <StageEditor id={app.id} status={app.status} />
              {app.notes && <p className="text-muted-foreground text-sm">{app.notes}</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
