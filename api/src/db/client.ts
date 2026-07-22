import postgres from "postgres";

/**
 * Single shared connection pool for the whole API process.
 *
 * DATABASE_URL is the Supabase Postgres connection string
 * (Project Settings -> Database -> Connection string -> URI, "Transaction" mode
 * pooler recommended for serverless/edge deploys). Never commit the real value —
 * it lives in .env locally and in Vercel's environment variables in production.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and fill in your Supabase connection string.",
  );
}

export const sql = postgres(connectionString, {
  // Supabase's pooled connection (pgbouncer) doesn't support prepared statements.
  prepare: false,
});
