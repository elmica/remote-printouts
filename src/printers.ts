import type { Database } from "firebase-admin/database";
import type { Config } from "./config";
import { getPrinters, JprintError } from "./jprint";

export function startPrinterSync(config: Config, db: Database): () => void {
  let lastSeenTimestamp: number | null = null;
  let syncInFlight = false;
  let pendingSync = false;

  async function syncPrinters(source: string): Promise<void> {
    if (syncInFlight) {
      pendingSync = true;
      return;
    }

    syncInFlight = true;
    try {
      do {
        pendingSync = false;
        try {
          const printers = await getPrinters(config);
          await db.ref("print/printers").set({
            printers,
            updatedAt: Date.now(),
          });
          console.log(
            `[printers] synced ${printers.length} printer(s) (${source}): ${printers.join(", ") || "(none)"}`
          );
        } catch (err) {
          const message =
            err instanceof JprintError
              ? err.message
              : err instanceof Error
                ? err.message
                : String(err);
          console.error(`[printers] sync failed (${source}): ${message}`);
        }
      } while (pendingSync);
    } finally {
      syncInFlight = false;
    }
  }

  const updateRef = db.ref("print/update");

  const onValue = updateRef.on("value", (snapshot) => {
    const timestamp = snapshot.val();
    if (typeof timestamp !== "number") {
      return;
    }

    if (lastSeenTimestamp === timestamp) {
      return;
    }

    lastSeenTimestamp = timestamp;
    void syncPrinters("update trigger");
  });

  void syncPrinters("startup");

  console.log("[printers] listening on /print/update");

  return () => {
    updateRef.off("value", onValue);
  };
}
