import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type FieldPath,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const FIRESTORE_IN_LIMIT = 30;

/**
 * Splits an array into fixed-size chunks (default 30 for Firestore `in` queries).
 */
export function chunkArray<T>(items: T[], size: number = FIRESTORE_IN_LIMIT): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Subscribes to a collection using chunked `where(field, 'in', chunk)` listeners.
 * Handles empty ID arrays (returns `[]` with zero reads) and >30 IDs safely.
 */
export function subscribeChunkedInQuery<T extends { id: string }>(
  collectionName: string,
  field: string | FieldPath,
  ids: string[],
  onData: (items: T[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    onData([]);
    return () => {};
  }

  const chunks = chunkArray(uniqueIds, FIRESTORE_IN_LIMIT);
  const chunkResults = new Map<number, T[]>();
  let loadedChunks = 0;
  const loadedSet = new Set<number>();

  const emitMerged = () => {
    if (loadedChunks < chunks.length) return;
    const mergedMap = new Map<string, T>();
    for (let i = 0; i < chunks.length; i++) {
      const list = chunkResults.get(i) || [];
      for (const item of list) {
        mergedMap.set(item.id, item);
      }
    }
    onData(Array.from(mergedMap.values()));
  };

  const unsubscribes = chunks.map((chunk, index) => {
    const q = query(collection(db, collectionName), where(field, 'in', chunk));
    return onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (d) => ({ id: d.id, ...(d.data() as DocumentData) } as T)
        );
        chunkResults.set(index, docs);
        if (!loadedSet.has(index)) {
          loadedSet.add(index);
          loadedChunks++;
        }
        emitMerged();
      },
      (error) => {
        if (onError) onError(error);
      }
    );
  });

  return () => {
    unsubscribes.forEach((unsub) => unsub());
  };
}

