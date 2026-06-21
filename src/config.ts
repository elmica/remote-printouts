export interface Config {
  firebaseDatabaseUrl: string;
  jprintBaseUrl: string;
  claimLeaseMs: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): Config {
  const claimLeaseMs = parseInt(process.env.CLAIM_LEASE_MS ?? "120000", 10);
  if (Number.isNaN(claimLeaseMs) || claimLeaseMs <= 0) {
    throw new Error("CLAIM_LEASE_MS must be a positive integer");
  }

  return {
    firebaseDatabaseUrl: requireEnv("FIREBASE_DATABASE_URL"),
    jprintBaseUrl: (process.env.JPRINT_BASE_URL ?? "http://localhost:3001").replace(
      /\/$/,
      ""
    ),
    claimLeaseMs,
  };
}
