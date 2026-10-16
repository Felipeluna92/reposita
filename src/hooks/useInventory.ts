import { useCallback, useEffect, useRef, useState } from "react";
import type { InventoryData, Movement, ProductInput } from "../types";
import * as repository from "../lib/repository";
export function useInventory(demo: boolean) {
  const [data, setData] = useState<InventoryData>({
    products: [],
    movements: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const mutationLock = useRef(false);
  const reload = useCallback(async () => {
    if (mutationLock.current) return;
    const request = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const next = await repository.loadData(demo);
      if (sequence.current === request) setData(next);
    } catch (e) {
      if (sequence.current === request) setError((e as Error).message);
    } finally {
      if (sequence.current === request) setLoading(false);
    }
  }, [demo]);
  useEffect(() => {
    void reload();
    return () => {
      sequence.current++;
    };
  }, [reload]);
  async function mutate(action: () => Promise<InventoryData>) {
    if (mutationLock.current)
      throw new Error("Aguarde a operação atual terminar.");
    mutationLock.current = true;
    sequence.current++;
    setBusy(true);
    try {
      const next = await action();
      setData(next);
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }
  return {
    ...data,
    loading,
    error,
    busy,
    reload,
    save: (input: ProductInput, id?: string) =>
      mutate(() => repository.saveProduct(demo, data, input, id)),
    move: (movement: Movement) =>
      mutate(() => repository.moveStock(demo, data, movement)),
    archive: (id: string) =>
      mutate(() => repository.archiveProduct(demo, data, id)),
    restore: (id: string) =>
      mutate(() => repository.restoreProduct(demo, data, id)),
    importItems: (items: ProductInput[], request: string) =>
      mutate(() => repository.importProducts(demo, data, items, request)),
    examples: () => {
      try {
        setData(repository.exampleData());
      } catch (e) {
        setError((e as Error).message);
      }
    },
  };
}
