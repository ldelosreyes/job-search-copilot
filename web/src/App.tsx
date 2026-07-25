import { useState } from "react";
import { ApplicationForm } from "@/components/application-form";
import { ApplicationList } from "@/components/application-list";
import { ResumeFitView } from "@/components/resume-fit-view";

// A tab toggle in local state, not a router — PLANNING.md deliberately
// defers TanStack Router until this becomes a multi-page app with real
// navigation needs; two views switched in place doesn't need one yet.
type View = "applications" | "resume-fit";

function App() {
  const [view, setView] = useState<View>("applications");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Job Search Copilot</h1>
        <p className="text-muted-foreground text-sm">
          Tracking applications for the Senior Full Stack / Software Engineer search.
        </p>
        <nav className="mt-4 flex gap-4 border-b text-sm">
          <button
            type="button"
            className={
              view === "applications"
                ? "border-foreground -mb-px border-b-2 pb-2 font-medium"
                : "text-muted-foreground pb-2"
            }
            onClick={() => setView("applications")}
          >
            Applications
          </button>
          <button
            type="button"
            className={
              view === "resume-fit"
                ? "border-foreground -mb-px border-b-2 pb-2 font-medium"
                : "text-muted-foreground pb-2"
            }
            onClick={() => setView("resume-fit")}
          >
            Resume Fit
          </button>
        </nav>
      </header>

      {view === "applications" ? (
        <div className="grid gap-6">
          <ApplicationForm />
          <ApplicationList />
        </div>
      ) : (
        <ResumeFitView />
      )}
    </div>
  );
}

export default App;
