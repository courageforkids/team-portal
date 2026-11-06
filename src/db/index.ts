import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

import { databaseUrl } from "./url";

const url = databaseUrl();
if (!url) throw new Error("DATABASE_URL is not set");

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
const client = globalForDb.pg ?? postgres(url, { max: Number(process.env.DB_POOL_MAX ?? 5), prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.pg = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;
export { schema };
