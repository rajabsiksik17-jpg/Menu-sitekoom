import { defineConfig } from "drizzle-kit";

// Generates SQL migrations from src/db/schema.ts into ./drizzle (applied by scripts/migrate.ts and at server start).
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
});
