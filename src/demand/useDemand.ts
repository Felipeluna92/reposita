import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DemandData,
  DemandInput,
  DemandStatus,
  PurchaseInput,
} from "./types";
import * as repo from "./repository";
export function useDemand(demo: boolean) {
  const [data, setData] = useState<DemandData>({
    demands: [],
    tests: [],
    store: null,
  });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const sequence = useRef(0),
    lock = useRef(false);
  const reload = useCallback(async () => {
    if (lock.current) return;
    const request = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const next = await repo.loadDemand(demo);
      if (request === sequence.current) setData(next);
    } catch (e) {
      if (request === sequence.current) setError((e as Error).message);
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [demo]);
  useEffect(() => {
    void reload();
    return () => {
      sequence.current++;
    };
  }, [reload]);
  async function mutate(action: () => Promise<DemandData>) {
    if (lock.current) throw new Error("Aguarde a operação atual.");
    lock.current = true;
    const request = ++sequence.current;
    setBusy(true);
    try {
      const next = await action();
      if (request === sequence.current) setData(next);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    ...data,
    loading,
    error,
    busy,
    reload,
    save: (input: DemandInput, id: string) =>
      mutate(() => repo.saveDemand(demo, input, id)),
    action: (id: string, action: DemandStatus | "forget_contact") =>
      mutate(() => repo.demandAction(demo, id, action)),
    saveTest: (input: PurchaseInput, id: string) =>
      mutate(() => repo.saveTest(demo, input, id)),
    testAction: (
      id: string,
      action: "purchase" | "complete" | "cancel",
      note: string,
    ) => mutate(() => repo.testAction(demo, id, action, note)),
    saveStore: (name: string, enabled: boolean, rotate = false) =>
      mutate(() => repo.saveStore(demo, name, enabled, rotate)),
  };
}
