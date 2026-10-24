import { expect, it } from "vitest";
import type { PrivateStorage, ResearchState } from "../domain/types";
import { emptyState } from "../domain/types";
import { reconcileStorage } from "./reconcile-storage";

it("reconciles only old unreferenced objects, preserving noncurrent and quarantined evidence", async () => {
  const removed: string[] = [];
  const now = 10 * 24 * 60 * 60 * 1000;
  const firm = emptyState();
  firm.documents = [
    { versions: [{ id: "historical" }, { id: "quarantined" }] },
  ] as ResearchState["documents"];
  const keys = [
    { key: "orphan", modifiedAt: 0 },
    { key: "historical", modifiedAt: 0 },
    { key: "quarantined", modifiedAt: 0 },
    { key: "new-upload", modifiedAt: now },
  ];
  const storage: PrivateStorage = {
    keys: async () => keys.filter((key) => !removed.includes(key.key)),
    remove: async (key) => {
      removed.push(key);
    },
    get: async () => new Uint8Array(),
    put: async () => {},
  };
  expect(await reconcileStorage(storage, [firm], now)).toEqual(["orphan"]);
  expect(removed).toEqual([]);
  expect(await reconcileStorage(storage, [firm], now, true)).toEqual([
    "orphan",
  ]);
  expect(await reconcileStorage(storage, [firm], now, true)).toEqual([]);
  expect(removed).toEqual(["orphan"]);
});
