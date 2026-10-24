import type { PrivateStorage, ResearchState } from "../domain/types";

/** Run offline with a complete firm inventory; current-version-only lists lose cited evidence. */
export async function reconcileStorage(
  storage: PrivateStorage,
  firms: ResearchState[],
  now: number,
  apply = false,
) {
  const retained = new Set(
    firms.flatMap((firm) =>
      firm.documents.flatMap((document) =>
        document.versions.map((version) => version.id),
      ),
    ),
  );
  const cutoff = now - 24 * 60 * 60 * 1000;
  const orphans = (await storage.keys()).filter(
    (object) => object.modifiedAt < cutoff && !retained.has(object.key),
  );
  if (apply) for (const object of orphans) await storage.remove(object.key);
  return orphans.map((object) => object.key);
}
