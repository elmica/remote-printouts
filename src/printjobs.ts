import type { Database, Reference } from "firebase-admin/database";
import type { Config } from "./config";
import { buildJprintBody, JprintError, submitPrintJob } from "./jprint";

interface JobData {
  _status?: string;
  _claimedAt?: number;
  error?: string;
  failedAt?: number;
  type?: string;
  [key: string]: unknown;
}

const handling = new Set<string>();

function isClaimable(data: JobData | null, leaseMs: number, now: number): boolean {
  if (!data) return false;
  if (data.error || data.failedAt) return false;

  if (!data._status) return true;

  if (data._status === "processing" && data._claimedAt) {
    return now - data._claimedAt > leaseMs;
  }

  return false;
}

async function claimJob(
  ref: Reference,
  leaseMs: number
): Promise<JobData | null> {
  const now = Date.now();
  let claimed: JobData | null = null;

  const result = await ref.transaction((current: JobData | null) => {
    if (!isClaimable(current, leaseMs, now)) {
      return undefined;
    }

    claimed = {
      ...current!,
      _status: "processing",
      _claimedAt: now,
    };
    return claimed;
  });

  if (!result.committed || !claimed) {
    return null;
  }

  return claimed;
}

async function handleJob(
  config: Config,
  db: Database,
  jobId: string,
  data: JobData
): Promise<void> {
  const ref = db.ref(`print/printjobs/${jobId}`);

  try {
    const { type, body } = buildJprintBody(data);
    const result = await submitPrintJob(config, type, body);
    await ref.remove();
    console.log(`[printjobs] ${jobId} printed (${result.type ?? type}, job=${result.job ?? "?"})`);
  } catch (err) {
    const message =
      err instanceof JprintError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);

    await ref.update({
      error: message,
      failedAt: Date.now(),
      _status: null,
      _claimedAt: null,
    });
    console.error(`[printjobs] ${jobId} failed: ${message}`);
  }
}

export function startPrintJobListener(config: Config, db: Database): () => void {
  const jobsRef = db.ref("print/printjobs");

  const onChildAdded = jobsRef.on("child_added", (snapshot) => {
    const jobId = snapshot.key;
    if (!jobId) return;

    if (handling.has(jobId)) {
      return;
    }

    void (async () => {
      const ref = db.ref(`print/printjobs/${jobId}`);
      const claimed = await claimJob(ref, config.claimLeaseMs);
      if (!claimed) {
        return;
      }

      handling.add(jobId);
      try {
        await handleJob(config, db, jobId, claimed);
      } finally {
        handling.delete(jobId);
      }
    })();
  });

  console.log("[printjobs] listening on /print/printjobs");

  return () => {
    jobsRef.off("child_added", onChildAdded);
  };
}
