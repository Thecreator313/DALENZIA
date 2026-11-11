'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  collection,
  doc,
  onSnapshot,
  type DocumentData,
  type DocumentReference,
  type FieldPath,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { subscribeChunkedInQuery } from '@/lib/firestore-helpers';

export interface AppSettings {
  allowTeamAssignment: boolean;
  festName: string;
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  allowTeamAssignment: true,
  festName: 'Fest Central',
};

interface SettingsContextValue {
  settings: AppSettings;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_APP_SETTINGS,
  loading: true,
});

/**
 * Provides a single shared real-time listener for `settings/global` across the entire app.
 */
export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const settingsDocRef = doc(db, 'settings', 'global');
    const unsubscribe = onSnapshot(
      settingsDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as Partial<AppSettings>;
          setSettings({
            allowTeamAssignment: data.allowTeamAssignment ?? true,
            festName: data.festName || 'Fest Central',
          });
        } else {
          setSettings(DEFAULT_APP_SETTINGS);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error listening to global settings:', error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const value = useMemo(() => ({ settings, loading }), [settings, loading]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useAppSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}

export interface CacheSnapshot<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  exists?: boolean;
}

interface CacheEntry<T = unknown> {
  snapshot: CacheSnapshot<T>;
  unsub: Unsubscribe;
  refCount: number;
  keepAlive: boolean;
  listeners: Set<() => void>;
}

class FirestoreCacheStore {
  private entries = new Map<string, CacheEntry<any>>();

  subscribeKey = (key: string | null, listener: () => void): (() => void) => {
    if (!key) return () => {};
    let entry = this.entries.get(key);
    if (entry) {
      entry.listeners.add(listener);
      return () => {
        entry?.listeners.delete(listener);
      };
    }
    // Waiters before retain creates entry
    let listeners = this.pendingListeners.get(key);
    if (!listeners) {
      listeners = new Set();
      this.pendingListeners.set(key, listeners);
    }
    listeners.add(listener);
    return () => {
      this.pendingListeners.get(key)?.delete(listener);
      this.entries.get(key)?.listeners.delete(listener);
    };
  };

  private pendingListeners = new Map<string, Set<() => void>>();

  getSnapshot = <T,>(
    key: string | null,
    fallback: CacheSnapshot<T>
  ): CacheSnapshot<T> => {
    if (!key) return fallback;
    const entry = this.entries.get(key);
    return entry ? (entry.snapshot as CacheSnapshot<T>) : fallback;
  };

  peekCount = (key: string): number | null => {
    const entry = this.entries.get(key);
    if (!entry || entry.snapshot.loading) return null;
    if (Array.isArray(entry.snapshot.data)) {
      return entry.snapshot.data.length;
    }
    return null;
  };

  retain = <T,>(
    key: string,
    initialData: T,
    keepAlive: boolean,
    startSubscription: (
      onUpdate: (data: T, exists?: boolean) => void,
      onError: (err: Error) => void
    ) => Unsubscribe
  ) => {
    const existing = this.entries.get(key);
    if (existing) {
      existing.refCount++;
      if (keepAlive) existing.keepAlive = true;
      return;
    }

    const listeners = this.pendingListeners.get(key) ?? new Set<() => void>();
    this.pendingListeners.delete(key);

    const entry: CacheEntry<T> = {
      snapshot: {
        data: initialData,
        loading: true,
        error: null,
      },
      unsub: () => {},
      refCount: 1,
      keepAlive,
      listeners,
    };
    this.entries.set(key, entry);

    const notify = () => {
      entry.listeners.forEach((l) => l());
    };

    let emittedSync = false;
    entry.unsub = startSubscription(
      (data, exists) => {
        emittedSync = true;
        entry.snapshot = {
          data,
          loading: false,
          error: null,
          ...(exists !== undefined ? { exists } : {}),
        };
        notify();
      },
      (error) => {
        emittedSync = true;
        entry.snapshot = {
          ...entry.snapshot,
          loading: false,
          error,
        };
        notify();
      }
    );

    if (!emittedSync && entry.listeners.size > 0) {
      notify();
    }
  };

  release = (key: string) => {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.refCount = Math.max(0, entry.refCount - 1);
    if (entry.refCount === 0 && !entry.keepAlive) {
      entry.unsub();
      this.entries.delete(key);
    }
  };

  dispose = () => {
    this.entries.forEach((entry) => {
      entry.unsub();
    });
    this.entries.clear();
    this.pendingListeners.clear();
  };
}

const FirestoreCacheContext = createContext<FirestoreCacheStore | null>(null);

/**
 * Panel-level shared real-time listener store. Keeps fixed subscriptions alive across
 * route navigation within the panel and unsubscribes all listeners when disposed.
 */
export function FirestoreCacheProvider({ children }: { children: React.ReactNode }) {
  const store = useMemo(() => new FirestoreCacheStore(), []);

  useEffect(() => {
    return () => {
      store.dispose();
    };
  }, [store]);

  return (
    <FirestoreCacheContext.Provider value={store}>
      {children}
    </FirestoreCacheContext.Provider>
  );
}

export function useFirestoreCacheStore(): FirestoreCacheStore {
  const store = useContext(FirestoreCacheContext);
  if (!store) {
    throw new Error('useFirestoreCacheStore must be used inside FirestoreCacheProvider');
  }
  return store;
}

const EMPTY_ARRAY: any[] = [];
const IDLE_COLLECTION_SNAPSHOT: CacheSnapshot<any[]> = {
  data: EMPTY_ARRAY,
  loading: false,
  error: null,
};
const LOADING_COLLECTION_SNAPSHOT: CacheSnapshot<any[]> = {
  data: EMPTY_ARRAY,
  loading: true,
  error: null,
};

const IDLE_DOC_SNAPSHOT: CacheSnapshot<any> = {
  data: null,
  loading: false,
  error: null,
  exists: false,
};
const LOADING_DOC_SNAPSHOT: CacheSnapshot<any> = {
  data: null,
  loading: true,
  error: null,
  exists: false,
};

export interface UseCachedOptions {
  enabled?: boolean;
  keepAlive?: boolean;
}

/**
 * Subscribes to a Firestore collection or query through the shared panel cache.
 */
export function useCachedCollection<T extends { id: string }>(
  key: string,
  queryFactory: () => Query<DocumentData>,
  options: UseCachedOptions = {}
): CacheSnapshot<T[]> {
  const { enabled = true, keepAlive = true } = options;
  const store = useFirestoreCacheStore();
  const factoryRef = useRef(queryFactory);
  factoryRef.current = queryFactory;

  const activeKey = enabled ? key : null;
  const fallback = (
    enabled ? LOADING_COLLECTION_SNAPSHOT : IDLE_COLLECTION_SNAPSHOT
  ) as CacheSnapshot<T[]>;

  const subscribe = useCallback(
    (listener: () => void) => store.subscribeKey(activeKey, listener),
    [store, activeKey]
  );
  const getSnapshot = useCallback(
    () => store.getSnapshot<T[]>(activeKey, fallback),
    [store, activeKey, fallback]
  );

  useEffect(() => {
    if (!activeKey) return;
    store.retain<T[]>(activeKey, EMPTY_ARRAY as T[], keepAlive, (onUpdate, onError) => {
      return onSnapshot(
        factoryRef.current(),
        (snapshot) => {
          const list = snapshot.docs.map(
            (d) => ({ id: d.id, ...(d.data() as DocumentData) } as T)
          );
          onUpdate(list);
        },
        (error) => onError(error)
      );
    });
    return () => store.release(activeKey);
  }, [store, activeKey, keepAlive]);

  return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
}

/**
 * Subscribes to a single Firestore document through the shared panel cache.
 */
export function useCachedDoc<T>(
  key: string,
  docRefFactory: () => DocumentReference<DocumentData>,
  options: UseCachedOptions = {}
): CacheSnapshot<T | null> {
  const { enabled = true, keepAlive = true } = options;
  const store = useFirestoreCacheStore();
  const factoryRef = useRef(docRefFactory);
  factoryRef.current = docRefFactory;

  const activeKey = enabled ? key : null;
  const fallback = (
    enabled ? LOADING_DOC_SNAPSHOT : IDLE_DOC_SNAPSHOT
  ) as CacheSnapshot<T | null>;

  const subscribe = useCallback(
    (listener: () => void) => store.subscribeKey(activeKey, listener),
    [store, activeKey]
  );
  const getSnapshot = useCallback(
    () => store.getSnapshot<T | null>(activeKey, fallback),
    [store, activeKey, fallback]
  );

  useEffect(() => {
    if (!activeKey) return;
    store.retain<T | null>(activeKey, null, keepAlive, (onUpdate, onError) => {
      return onSnapshot(
        factoryRef.current(),
        (docSnap) => {
          if (docSnap.exists()) {
            onUpdate(docSnap.data() as T, true);
          } else {
            onUpdate(null, false);
          }
        },
        (error) => onError(error)
      );
    });
    return () => store.release(activeKey);
  }, [store, activeKey, keepAlive]);

  return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
}

/**
 * Subscribes to a chunked `where(field, 'in', ids)` Firestore query, automatically
 * handling >30 IDs and empty arrays without redundant reads.
 */
export function useCachedChunkedIn<T extends { id: string }>(
  keyPrefix: string,
  collectionName: string,
  field: string | FieldPath,
  ids: string[],
  options: UseCachedOptions = {}
): CacheSnapshot<T[]> {
  const { enabled = true, keepAlive = true } = options;
  const store = useFirestoreCacheStore();
  const fieldRef = useRef(field);
  fieldRef.current = field;

  const fieldKey = typeof field === 'string' ? field : '__fieldpath__';
  const idsKey = Array.from(new Set(ids.filter(Boolean))).sort().join('\u0000');
  const stableIds = useMemo(
    () => (idsKey ? idsKey.split('\u0000') : (EMPTY_ARRAY as string[])),
    [idsKey]
  );
  const activeKey = enabled ? `${keyPrefix}:${fieldKey}:${idsKey}` : null;

  const fallback = (
    enabled && stableIds.length > 0
      ? LOADING_COLLECTION_SNAPSHOT
      : IDLE_COLLECTION_SNAPSHOT
  ) as CacheSnapshot<T[]>;

  const subscribe = useCallback(
    (listener: () => void) => store.subscribeKey(activeKey, listener),
    [store, activeKey]
  );
  const getSnapshot = useCallback(
    () => store.getSnapshot<T[]>(activeKey, fallback),
    [store, activeKey, fallback]
  );

  useEffect(() => {
    if (!activeKey) return;
    store.retain<T[]>(activeKey, EMPTY_ARRAY as T[], keepAlive, (onUpdate, onError) => {
      return subscribeChunkedInQuery<T>(
        collectionName,
        fieldRef.current,
        stableIds,
        (items) => onUpdate(items),
        (err) => onError(err)
      );
    });
    return () => store.release(activeKey);
  }, [store, activeKey, collectionName, stableIds, keepAlive]);

  return useSyncExternalStore(subscribe, getSnapshot, () => fallback);
}

/**
 * Convenience hook for full-collection subscription in the current panel session.
 */
export function useSharedCollection<T extends { id: string }>(
  collectionName: string,
  options: UseCachedOptions = {}
): CacheSnapshot<T[]> {
  return useCachedCollection<T>(
    `col:${collectionName}`,
    () => collection(db, collectionName),
    options
  );
}
