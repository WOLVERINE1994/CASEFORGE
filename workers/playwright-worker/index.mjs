import { chromium } from "playwright";

import { createPlaywrightWorkerServer } from "./server.mjs";

const host = process.env.AUTOMATION_WORKER_HOST || "0.0.0.0";
const port = Number(process.env.AUTOMATION_WORKER_PORT || 4890);
const worker = createPlaywrightWorkerServer({
  browserLauncher: chromium,
  host,
  port,
});

await worker.listen(port, host);

console.log(`CaseForge Playwright worker listening on http://${host}:${port}`);

async function shutdown() {
  await worker.close().catch(() => undefined);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
