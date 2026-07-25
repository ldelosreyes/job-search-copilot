import { ApplicationForm } from "@/components/application-form";
import { ApplicationList } from "@/components/application-list";
import { ResumeAndScoreStrip } from "@/components/resume-and-score-strip";
import { LoginScreen } from "@/components/login-screen";
import { Button } from "@/components/ui/button";
import { authEnabled, supabase } from "@/lib/supabase-client";
import { useSession } from "@/hooks/use-session";

function App() {
  const { session, isLoading } = useSession();

  if (authEnabled && isLoading) {
    return null;
  }

  if (authEnabled && !session) {
    return <LoginScreen />;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8">
        <div className="flex items-start justify-between">
          <h1 className="text-2xl font-semibold">Job Search Copilot</h1>
          {authEnabled && (
            <Button variant="ghost" size="sm" onClick={() => supabase!.auth.signOut()}>
              Sign out
            </Button>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          Tracking applications for the Senior Full Stack / Software Engineer search.
        </p>
      </header>

      <div className="grid gap-6">
        <ResumeAndScoreStrip />
        <ApplicationForm />
        <ApplicationList />
      </div>
    </div>
  );
}

export default App;
