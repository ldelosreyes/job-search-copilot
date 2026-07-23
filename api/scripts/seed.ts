import { sql } from "../src/db/client";
import { createApplication } from "../src/db/applications-repo";
import type { CreateApplicationInput } from "../src/schemas/application";

/**
 * Sandbox seed data — one sample application per status stage, so the
 * demo shows every branch of the discriminated union (StatusBadge,
 * StageEditor). Run nightly against the sandbox database only; never
 * point this at a real/production DATABASE_URL.
 */
const seedApplications: CreateApplicationInput[] = [
  {
    company: "Anthropic",
    roleTitle: "AI Engineer",
    source: "direct",
    salaryMin: 180_000,
    salaryMax: 220_000,
    jdText: null,
    notes: "Referred by a former colleague.",
    status: {
      stage: "interview",
      interviewRound: 2,
      interviewAt: new Date().toISOString(),
    },
  },
  {
    company: "Vercel",
    roleTitle: "Senior Full Stack Engineer",
    source: "job_board",
    salaryMin: null,
    salaryMax: null,
    jdText: null,
    notes: null,
    status: { stage: "applied", appliedAt: new Date().toISOString() },
  },
  {
    company: "Stripe",
    roleTitle: "Software Engineer, Platform",
    source: "recruiter",
    salaryMin: 160_000,
    salaryMax: 200_000,
    jdText: null,
    notes: "Recruiter reached out on LinkedIn.",
    status: { stage: "screening", screeningCallAt: new Date().toISOString() },
  },
  {
    company: "Linear",
    roleTitle: "Full Stack Engineer",
    source: "referral",
    salaryMin: 170_000,
    salaryMax: 180_000,
    jdText: null,
    notes: "Great culture fit based on the interviews.",
    status: {
      stage: "offer",
      offerAmount: 180_000,
      offerDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  },
  {
    company: "Notion",
    roleTitle: "Frontend Engineer",
    source: "job_board",
    salaryMin: null,
    salaryMax: null,
    jdText: null,
    notes: null,
    status: {
      stage: "rejected",
      reason: "Went with a candidate with more design-systems experience.",
      rejectedAt: new Date().toISOString(),
    },
  },
  {
    company: "Supabase",
    roleTitle: "Developer Experience Engineer",
    source: "direct",
    salaryMin: null,
    salaryMax: null,
    jdText: null,
    notes: "Withdrew after accepting a different offer.",
    status: { stage: "withdrawn", reason: "Accepted another offer." },
  },
];

async function main() {
  // This deletes every row in `applications`. Require an explicit opt-in
  // so a misconfigured DATABASE_URL can't silently wipe a real database.
  if (process.env.ALLOW_SEED_RESET !== "true") {
    throw new Error(
      "Refusing to run: this clears the entire applications table. " +
        "Set ALLOW_SEED_RESET=true to confirm DATABASE_URL points at a sandbox database.",
    );
  }

  try {
    console.log("Clearing applications table...");
    await sql`delete from applications`;

    console.log(`Seeding ${seedApplications.length} sample applications...`);
    for (const input of seedApplications) {
      const result = await createApplication(input);
      if (!result.ok) {
        throw result.error;
      }
    }

    console.log("Done.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
