import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Mirrors ApplicationCard's layout (title+badge row, subtitle line, edit/delete
// icon buttons, fit-score button) so the loading state doesn't jump around once
// real cards swap in.
export function ApplicationCardSkeleton(props: React.ComponentProps<typeof Card>) {
  return (
    <Card {...props}>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1.5">
            <div className="flex flex-nowrap items-center gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3.5 w-48" />
          </div>
          <div className="flex items-center gap-1">
            <Skeleton className="size-9 rounded-md" />
            <Skeleton className="size-9 rounded-md" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pb-6">
        <Skeleton className="h-8 w-24 rounded-md" />
      </CardContent>
    </Card>
  );
}
