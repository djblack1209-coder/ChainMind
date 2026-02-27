// Async IndexedDB storage layer using idb-keyval
// Prevents main-thread blocking unlike LocalStorage

import { get, set, del, keys } from 'idb-keyval';

const PREFIX = 'aichain:';

export async function storageGet<T>(key: string): Promise<T | undefined> {
  return get<T>(PREFIX + key);
}

export async function storageSet<T>(key: string, value: T): Promise<void> {
  return set(PREFIX + key, value);
}

export async function storageDel(key: string): Promise<void> {
  return del(PREFIX + key);
}

export async function storageKeys(): Promise<string[]> {
  const allKeys = await keys();
  return allKeys
    .filter((k) => typeof k === 'string' && k.startsWith(PREFIX))
    .map((k) => (k as string).slice(PREFIX.length));
}
