/**
 * Integração com chamadas HTTP: tudo que passar por aqui aciona barra/overlay.
 * - trackedFetch: substitui fetch nas telas
 * - attachAxiosLoading: liga interceptors numa instância axios existente
 */
import { loadingBus } from "../loadingBus";

export interface TrackOptions {
  /** true = não mostra carregamento (polling, status do WhatsApp, relógio) */
  silent?: boolean;
}

export async function trackedFetch(input: RequestInfo | URL, init?: RequestInit & TrackOptions): Promise<Response> {
  const { silent, ...rest } = init ?? {};
  if (silent) return fetch(input, rest);
  loadingBus.start();
  try {
    return await fetch(input, rest);
  } finally {
    loadingBus.done();
  }
}

interface AxiosLikeConfig { headers?: Record<string, unknown> | object; [k: string]: unknown }
interface AxiosLikeInterceptor<V> {
  use(onFulfilled: (v: V) => V | Promise<V>, onRejected?: (e: unknown) => unknown): number;
}
export interface AxiosLike {
  interceptors: {
    request: AxiosLikeInterceptor<AxiosLikeConfig>;
    response: AxiosLikeInterceptor<{ config: AxiosLikeConfig }>;
  };
}

const FLAG = "__rtTracked";

/** Requisições com header `x-rt-silent: 1` não acionam o loader. */
export function attachAxiosLoading(instance: AxiosLike): void {
  instance.interceptors.request.use(
    (config) => {
      const h = (config.headers ?? {}) as Record<string, unknown>;
      const silent = h["x-rt-silent"] === "1" || h["x-rt-silent"] === 1;
      if (!silent) {
        loadingBus.start();
        (config as Record<string, unknown>)[FLAG] = true;
      }
      return config;
    },
    (error) => Promise.reject(error),
  );
  const finish = (config?: AxiosLikeConfig) => {
    if (config && (config as Record<string, unknown>)[FLAG]) {
      (config as Record<string, unknown>)[FLAG] = false;
      loadingBus.done();
    }
  };
  instance.interceptors.response.use(
    (response) => {
      finish(response.config);
      return response;
    },
    (error) => {
      finish((error as { config?: AxiosLikeConfig })?.config);
      return Promise.reject(error);
    },
  );
}
