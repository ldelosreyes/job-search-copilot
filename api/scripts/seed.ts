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
    jdText: `About the role
Join a product engineering team building reliable, useful, and safe AI experiences powered by large language models. You will work closely with research, product, and design to turn new model capabilities into products used by customers at scale.

What you'll do
- Design and ship end-to-end AI product features across TypeScript, React, Python, and backend services.
- Build evaluation frameworks, monitoring, and feedback loops that measure quality, safety, latency, and reliability.
- Prototype with new model capabilities, validate ideas with users, and productionise the strongest approaches.
- Improve platform architecture and engineering practices as the product and team grow.

You may be a good fit if you
- Have 5+ years of professional software engineering experience building customer-facing products.
- Are strong across frontend and backend development and comfortable working in ambiguous problem spaces.
- Have experience operating reliable production systems and collaborating with research or data teams.
- Communicate clearly and care deeply about product quality, responsible AI, and user trust.

Strong candidates may also have experience with LLM applications, model evaluation, distributed systems, or developer tools.`,
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
    jdText: `About the role
Help build the platform developers use to create, deploy, and operate modern web applications. As a senior full-stack engineer, you will own product work from user experience through the services and infrastructure that support it.

What you will do
- Design and ship customer-facing features using TypeScript, React, Next.js, and Node.js.
- Build APIs and platform primitives that make deployments fast, observable, secure, and easy to understand.
- Improve performance and reliability across high-traffic, globally distributed systems.
- Partner with product, design, and infrastructure teams and provide technical direction for complex projects.
- Talk with developers, turn their feedback into product improvements, and raise the quality of the overall developer experience.

About you
- You have 6+ years of experience shipping production web applications and can work across the full stack.
- You have strong TypeScript and React fundamentals and understand APIs, databases, caching, and distributed systems.
- You independently drive projects from unclear requirements through launch and iteration.
- You care about thoughtful UI details, clear abstractions, testing, observability, and operational excellence.

Bonus points for experience with Next.js, serverless platforms, CI/CD systems, open source, or developer tooling.`,
    notes: null,
    status: { stage: "applied", appliedAt: new Date().toISOString() },
  },
  {
    company: "Stripe",
    roleTitle: "Software Engineer, Platform",
    source: "recruiter",
    salaryMin: 160_000,
    salaryMax: 200_000,
    jdText: `About the team
The Platform Engineering team builds the foundations that product teams use to develop and operate reliable financial services. Our systems sit on critical paths, handle high request volumes, and must balance developer velocity with correctness, security, and availability.

What you'll do
- Design, build, and operate APIs, service frameworks, and distributed systems used by engineers across the company.
- Lead projects from technical design through rollout, including migrations and coordination with dependent teams.
- Improve service reliability, observability, capacity planning, incident response, and operational tooling.
- Create abstractions that make secure and resilient infrastructure easier for product engineers to use.
- Review designs, mentor engineers, and help shape the long-term platform roadmap.

Minimum requirements
- 5+ years of professional software engineering experience, including production distributed systems.
- Strong programming ability in at least one general-purpose language such as Java, Go, Ruby, or Python.
- Experience with service-oriented architecture, databases, event-driven systems, and production operations.
- A record of delivering complex cross-team projects with clear written and verbal communication.

Preferred qualifications include experience with payments, high-integrity data systems, Kubernetes, Kafka, or internal developer platforms.`,
    notes: "Recruiter reached out on LinkedIn.",
    status: { stage: "screening", screeningCallAt: new Date().toISOString() },
  },
  {
    company: "Linear",
    roleTitle: "Full Stack Engineer",
    source: "referral",
    salaryMin: 170_000,
    salaryMax: 180_000,
    jdText: `About the role
We are looking for an experienced full-stack engineer to help build a fast, thoughtful product development system for modern software teams. Our engineers are generalists who own meaningful product areas and work across a TypeScript stack.

What you'll do
- Build new user-facing features from database models and GraphQL APIs through polished React interfaces.
- Improve real-time collaboration, offline support, data synchronisation, and application performance.
- Profile and optimise complex interfaces including editors, virtualised lists, and keyboard-driven workflows.
- Add monitoring and operational tooling, investigate incidents, and improve system reliability.
- Work directly with design and product to shape problems, make trade-offs, and ship focused solutions.

What we're looking for
- 5+ years of experience building high-quality customer-facing software.
- Strong React and TypeScript skills plus experience with Node.js, GraphQL, and PostgreSQL.
- A track record of owning complex features end to end and delivering visible product impact.
- Excellent product judgment and a high bar for speed, interaction design, and visual polish.
- Comfort working autonomously in a small, remote, async-first team.

Experience with real-time systems, local-first software, performance engineering, or startup environments is a plus.`,
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
    jdText: `About the role
Join the frontend team building collaborative tools that help individuals and organisations manage knowledge and get work done. You will own high-impact product experiences and the shared foundations that keep a complex workspace fast, accessible, and consistent.

What you'll do
- Build and refine editor, database, navigation, and collaboration experiences using React and TypeScript.
- Partner closely with product designers to turn prototypes into intuitive, polished interactions.
- Evolve the component library and design system while improving accessibility across the product.
- Diagnose rendering and interaction performance issues in large, data-rich workspaces.
- Improve frontend architecture, testing, observability, and developer workflows.

What we're looking for
- 5+ years of software engineering experience with deep expertise in modern JavaScript, TypeScript, React, HTML, and CSS.
- Experience shipping complex web applications with a strong focus on user experience and product quality.
- Knowledge of accessibility, browser behaviour, state management, and frontend performance.
- Strong communication skills and the ability to lead projects across engineering, design, and product.

Nice to have: experience with rich-text editors, collaborative applications, design systems, offline-first products, or desktop web technologies.`,
    notes: "Went with a candidate with more design-systems experience.",
    status: {
      stage: "rejected",
      rejectedAt: new Date().toISOString(),
    },
  },
  {
    company: "Supabase",
    roleTitle: "Developer Experience Engineer",
    source: "direct",
    salaryMin: null,
    salaryMax: null,
    jdText: `About the role
Help developers successfully build with an open-source Postgres development platform. This role sits between engineering, product, documentation, and community: you will create tools and learning experiences while bringing developer feedback back into the product.

What you'll do
- Build and maintain SDK examples, starter applications, integrations, CLI workflows, and technical documentation.
- Create clear guides that explain Postgres, authentication, storage, realtime systems, and edge functions.
- Reproduce developer issues, improve error messages and APIs, and contribute fixes across the product.
- Launch sample projects and educational content for new features and common production architectures.
- Collaborate openly with maintainers and community contributors in a remote, asynchronous environment.

What we're looking for
- Strong TypeScript and web development experience, including React or a comparable frontend framework.
- Practical knowledge of Postgres, SQL, APIs, authentication, and modern deployment workflows.
- Excellent technical writing and the ability to explain difficult concepts through working examples.
- Experience contributing to developer tools, SDKs, documentation, support engineering, or open-source projects.
- High ownership, curiosity, empathy for developers, and comfort communicating in public.

Bonus points for experience with multiple languages or frameworks, community programs, video education, or operating production databases.`,
    notes: "Accepted another offer.",
    status: { stage: "withdrawn" },
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
    // One transaction: if clearing `resume` fails (e.g. a migration
    // drift like the missing-table incident this guarded against),
    // the `applications` delete rolls back too, instead of leaving the
    // demo empty until the next nightly run happens to succeed.
    await sql.begin(async (trx) => {
      console.log("Clearing applications table...");
      await trx`delete from applications`;

      // No seeded dummy resume — starts empty after every reset, same as
      // the spec's "nothing works until a resume is uploaded" design.
      console.log("Clearing resume table...");
      await trx`delete from resume`;
    });

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
