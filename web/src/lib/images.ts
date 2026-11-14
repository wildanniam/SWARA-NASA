import { useSyncExternalStore } from "react";

// Penyimpanan gambar sederhana: semua frame satu target dimuat lebih dulu,
// supaya blink tidak berkedip kosong saat berganti jendela.

const loaded = new Map<string, HTMLImageElement>();
const failed = new Set<string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function settle(url: string) {
  pending.delete(url);
  version++;
  listeners.forEach((fn) => fn());
}

export function preload(urls: string[]) {
  for (const url of urls) {
    if (loaded.has(url) || pending.has(url)) continue;
    failed.delete(url);
    pending.add(url);
    const img = new Image();
    img.onload = () => {
      loaded.set(url, img);
      settle(url);
    };
    img.onerror = () => {
      failed.add(url);
      settle(url);
    };
    img.src = url;
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Membuat komponen dirender ulang tiap ada gambar selesai dimuat. */
export function useImageStore() {
  useSyncExternalStore(subscribe, () => version);
  return {
    get: (url?: string) => (url ? loaded.get(url) : undefined),
    hasFailed: (url?: string) => (url ? failed.has(url) : false),
  };
}
