import { ApplicationForm } from "@/components/application-form";
import { ApplicationList } from "@/components/application-list";

function App() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Job Search Copilot</h1>
        <p className="text-muted-foreground text-sm">
          Tracking applications for the Senior Full Stack / Software Engineer search.
        </p>
      </header>

      <div className="grid gap-6">
        <ApplicationForm />
        <ApplicationList />
      </div>
    </div>
  );
}

export default App;
