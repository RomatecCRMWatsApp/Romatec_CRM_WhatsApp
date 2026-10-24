import { useSyncExternalStore } from "react";

/**
 * Contador global de carregamentos. Qualquer parte do app chama start()/done()
 * (ou track(promise)) e a barra do topo + overlay reagem sozinhos.
 */
type Listener = () => void;
let pending = 0;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

export const loadingBus = {
  start(): void {
    pending += 1;
    emit();
  },
  done(): void {
    pending = Math.max(0, pending - 1);
    emit();
  },
  reset(): void {
    pending = 0;
    emit();
  },
  async track<T>(work: Promise<T> | (() => Promise<T>)): Promise<T> {
    loadingBus.start();
    try {
      return await (typeof work === "function" ? work() : work);
    } finally {
      loadingBus.done();
    }
  },
  get pending(): number {
    return pending;
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useGlobalLoading(): boolean {
  return useSyncExternalStore(
    loadingBus.subscribe,
    () => pending > 0,
    () => false,
  );
}
