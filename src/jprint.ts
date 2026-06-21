import type { Config } from "./config";

export type PrintJobType = "escpos" | "zpl" | "escpos-raw" | "batch";

export interface JprintResult {
  ok: boolean;
  job?: string;
  type?: string;
  error?: string;
  results?: unknown[];
}

const ENDPOINTS: Record<PrintJobType, string> = {
  escpos: "/api/print/escpos",
  zpl: "/api/print/zpl",
  "escpos-raw": "/api/print/escpos/raw",
  batch: "/api/print/batch",
};

export class JprintError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "JprintError";
  }
}

export async function getPrinters(config: Config): Promise<string[]> {
  const url = `${config.jprintBaseUrl}/api/printers`;
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new JprintError(
      `GET /api/printers failed (${response.status}): ${body}`,
      response.status
    );
  }

  const data = (await response.json()) as { printers?: string[] };
  if (!Array.isArray(data.printers)) {
    throw new JprintError("GET /api/printers returned invalid response");
  }

  return data.printers;
}

export async function submitPrintJob(
  config: Config,
  type: PrintJobType,
  body: Record<string, unknown>
): Promise<JprintResult> {
  const endpoint = ENDPOINTS[type];
  if (!endpoint) {
    throw new JprintError(`Unknown print job type: ${type}`);
  }

  const url = `${config.jprintBaseUrl}${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let result: JprintResult;
  try {
    result = (await response.json()) as JprintResult;
  } catch {
    const text = await response.text().catch(() => "");
    throw new JprintError(
      `POST ${endpoint} returned non-JSON (${response.status}): ${text}`,
      response.status
    );
  }

  if (!response.ok || !result.ok) {
    throw new JprintError(
      result.error ?? `POST ${endpoint} failed (${response.status})`,
      response.status
    );
  }

  return result;
}

export function buildJprintBody(
  job: Record<string, unknown>
): { type: PrintJobType; body: Record<string, unknown> } {
  const type = job.type as PrintJobType | undefined;
  if (!type || !(type in ENDPOINTS)) {
    throw new JprintError(`Invalid or missing job type: ${String(type)}`);
  }

  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(job)) {
    if (key === "type" || key.startsWith("_") || key === "error" || key === "failedAt") {
      continue;
    }
    body[key] = value;
  }

  return { type, body };
}
