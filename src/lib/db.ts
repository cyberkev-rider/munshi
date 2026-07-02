/**
 * Local-first storage via Dexie (IndexedDB). Every write lands here
 * immediately — there is no server in Step 1. Records carry a `synced`
 * flag so a future sync layer can find and push anything not yet
 * uploaded, without needing a schema change at that point.
 */

import Dexie, { type EntityTable } from "dexie";
import type { Party, Transaction } from "./types";

export class MunshiDB extends Dexie {
  parties!: EntityTable<Party, "id">;
  transactions!: EntityTable<Transaction, "id">;

  constructor() {
    super("munshi-db");
    this.version(1).stores({
      parties: "id, name, created_at, synced",
      transactions: "id, party_id, created_at, is_deleted, synced",
    });
  }
}

/**
 * Singleton Dexie instance. Dexie is safe to instantiate once and reuse;
 * this module is only ever imported client-side (all callers are in "use
 * client" components/hooks), so there is no server/client mismatch risk.
 */
export const db = new MunshiDB();
