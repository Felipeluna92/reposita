import { useCallback, useEffect, useState } from "react";
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
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await repository.loadData(demo));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [demo]);
  useEffect(() => {
    void reload();
  }, [reload]);
  async function mutate(action: () => Promise<InventoryData>) {
    setBusy(true);
    try {
      const next = await action();
      setData(next);
    } finally {
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
    examples: () => {
      try {
        setData(repository.exampleData());
      } catch (e) {
        setError((e as Error).message);
      }
    },
  };
}
