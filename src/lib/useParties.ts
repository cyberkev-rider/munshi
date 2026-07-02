"use client";

import { useCallback, useEffect, useState } from "react";
import { listParties } from "./repo";
import type { Party } from "./types";

/** Loads the flat list of parties (no balances) — used by the party picker
 * in the manual entry flow, which only needs names to search/select. */
export function useParties() {
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setParties(await listParties());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { parties, loading, refresh };
}
