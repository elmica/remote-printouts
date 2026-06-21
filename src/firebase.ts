import { initializeApp, cert, deleteApp, type App } from "firebase-admin/app";
import { getDatabase, type Database } from "firebase-admin/database";
import type { Config } from "./config";

let app: App;
let db: Database;

export function initFirebase(config: Config): Database {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    throw new Error("Missing required environment variable: GOOGLE_APPLICATION_CREDENTIALS");
  }

  app = initializeApp({
    credential: cert(credentialsPath),
    databaseURL: config.firebaseDatabaseUrl,
  });

  db = getDatabase(app);
  return db;
}

export function getDb(): Database {
  if (!db) {
    throw new Error("Firebase not initialized");
  }
  return db;
}

export function shutdownFirebase(): Promise<void> {
  if (!app) {
    return Promise.resolve();
  }
  return deleteApp(app);
}
