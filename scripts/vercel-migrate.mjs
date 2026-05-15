import { spawnSync } from "node:child_process";

const isVercelProduction =
  process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const hasDirectUrl = Boolean(process.env.DIRECT_URL?.trim());

if (!isVercelProduction) {
  console.log("Skipping Prisma migrate deploy outside Vercel production.");
  process.exit(0);
}

if (!hasDatabaseUrl || !hasDirectUrl) {
  console.log(
    "Skipping Prisma migrate deploy because DATABASE_URL or DIRECT_URL is missing."
  );
  process.exit(0);
}

console.log("Running Prisma migrate deploy for Vercel production.");

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
