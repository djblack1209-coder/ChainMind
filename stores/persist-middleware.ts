// Custom Zustand persist middleware using IndexedDB (async, non-blocking)
// Debounced writes to prevent IndexedDB thrashing during rapid state updates

import type { StateCreator, StoreMutatorIdentifier } from 'zustand';
import { storageGet, storageSet } from '@/lib/storage';

type PersistConfig<T> = {
  name: string;
  partialize?: (state: T) => Partial<T>;
  debounceMs?: number;
};

type Persist = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  initializer: StateCreator<T, Mps, Mcs>,
  config: PersistConfig<T>
) => StateCreator<T, Mps, Mcs>;

type PersistImpl = <T>(
  initializer: StateCreator<T, [], []>,
  config: PersistConfig<T>
) => StateCreator<T, [], []>;

const persistImpl: PersistImpl = (initializer, config) => (set, get, api) => {
  const { name, partialize, debounceMs = 300 } = config;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let hydrated = false;
  let dirtyBeforeHydration = false;

  // Hydrate from IndexedDB on init
  storageGet<Partial<Record<string, unknown>>>(name).then((persisted) => {
    if (persisted) {
      set(persisted as Parameters<typeof set>[0]);
    }
    hydrated = true;
    if (dirtyBeforeHydration) {
      dirtyBeforeHydration = false;
      const state = get();
      const toPersist = partialize ? partialize(state) : state;
      storageSet(name, toPersist).catch((err) => {
        console.warn(`[Persist] Failed to save "${name}":`, err);
      });
    }
  }).catch((err) => {
    console.warn(`[Persist] Failed to hydrate "${name}":`, err);
    hydrated = true;
    if (dirtyBeforeHydration) {
      dirtyBeforeHydration = false;
      const state = get();
      const toPersist = partialize ? partialize(state) : state;
      storageSet(name, toPersist).catch((saveErr) => {
        console.warn(`[Persist] Failed to save "${name}":`, saveErr);
      });
    }
  });

  // Debounced persist function
  const debouncedPersist = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!hydrated) {
        dirtyBeforeHydration = true;
        return;
      }
      const state = get();
      const toPersist = partialize ? partialize(state) : state;
      storageSet(name, toPersist).catch((err) => {
        console.warn(`[Persist] Failed to save "${name}":`, err);
      });
    }, debounceMs);
  };

  // Wrap set to auto-persist with debounce
  const persistSet: typeof set = (...args) => {
    set(...args);
    debouncedPersist();
  };

  const initialState = initializer(persistSet, get, api);
  return initialState;
};

export const persistIndexedDB = persistImpl as unknown as Persist;
