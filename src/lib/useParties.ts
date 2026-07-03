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
    // Intentional fetch-on-mount; refresh() flips loading before awaiting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  return { parties, loading, refresh };
}
