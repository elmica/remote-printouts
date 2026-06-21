import { loadConfig } from "./config";
import { initFirebase, shutdownFirebase } from "./firebase";
import { startPrintJobListener } from "./printjobs";
import { startPrinterSync } from "./printers";

async function main(): Promise<void> {
  const config = loadConfig();
  const db = initFirebase(config);

  const stopPrintJobs = startPrintJobListener(config, db);
  const stopPrinters = startPrinterSync(config, db);

  console.log("[remote-printouts] bridge running");

  const shutdown = async (signal: string) => {
    console.log(`[remote-printouts] ${signal} received, shutting down`);
    stopPrintJobs();
    stopPrinters();
    await shutdownFirebase();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[remote-printouts] fatal:", err);
  process.exit(1);
});
