import { defineConfig } from "drizzle-kit";
import { loadEnvFile } from "node:process";

try { loadEnvFile(".env.local"); }
catch { /* Environment variables may be supplied directly by CI or Vercel. */ }
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || databaseUrl.includes("your-project")) {
  throw new Error("Set DATABASE_URL in .env.local to your Supabase PostgreSQL connection string before running a database migration.");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl },
});
