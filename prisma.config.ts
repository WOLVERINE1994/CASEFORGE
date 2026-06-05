import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

loadEnv({ path: ".env" });
loadEnv({ override: true, path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use the direct Neon connection for Prisma CLI operations and migrations.
    url: env("DIRECT_URL"),
  },
});
