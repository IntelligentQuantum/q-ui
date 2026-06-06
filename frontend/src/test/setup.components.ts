import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import enUS from '../../../web/translation/en-US.json';

vi.mock('persian-calendar-suite', () => ({
  PersianDateTimePicker: () => null,
}));

// Node 22+ exposes its own experimental global `localStorage` that is unusable
// without a valid `--localstorage-file` (its methods throw / aren't functions).
// That broken global shadows jsdom's working one, so a plain
// `typeof localStorage === 'undefined'` guard isn't enough — replace whenever
// the current binding lacks a usable getItem.
function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  } as Storage;
}

function ensureStorage(name: 'localStorage' | 'sessionStorage') {
  const current = (globalThis as { [k: string]: unknown })[name] as Storage | undefined;
  if (current && typeof current.getItem === 'function') return;
  Object.defineProperty(globalThis, name, {
    value: makeMemoryStorage(),
    configurable: true,
    writable: true,
  });
}

ensureStorage('localStorage');
ensureStorage('sessionStorage');

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

if (!i18next.isInitialized) {
  void i18next.use(initReactI18next).init({
    lng: 'en-US',
    fallbackLng: 'en-US',
    resources: { 'en-US': { translation: enUS } },
    interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
    returnNull: false,
  });
}

afterEach(async () => {
  cleanup();
  document.body.innerHTML = '';
  /*
   * React 19 defers passive-effect flushes onto a macrotask (setImmediate),
   * whose callback reads `window.event`. If one is still queued when vitest
   * tears down the jsdom environment, it fires after `window` is gone and
   * throws "window is not defined". Drain a few macrotask ticks here so any
   * pending callback runs while `window` still exists. Several ticks are used
   * because a microtask resolving mid-drain (rc-trigger/AntD) can queue a new
   * one behind the first.
   */
  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
});
