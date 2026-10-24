/**
 * Integração do carregamento com este app (wouter + tRPC/React Query) — substitui o reactRouter.tsx do kit.
 * - LocationChangeLoading: pulso na barra do topo a cada troca de rota (wouter).
 * - QueryLoading: barra/overlay enquanto houver consulta SEM dado ainda (1ª carga) ou ação em andamento.
 *   Atualização em segundo plano (polling do WhatsApp, relógio, versão, contadores) já tem dado → não acende.
 * Montar uma vez, dentro do QueryClientProvider.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { loadingBus } from "../loadingBus";

/** Segura o loadingBus enquanto `ativo` for true (um start, um done) */
function useSegurar(ativo: boolean) {
  const segurando = useRef(false);
  useEffect(() => {
    if (ativo && !segurando.current) { segurando.current = true; loadingBus.start(); }
    else if (!ativo && segurando.current) { segurando.current = false; loadingBus.done(); }
  }, [ativo]);
  useEffect(() => () => { if (segurando.current) { segurando.current = false; loadingBus.done(); } }, []);
}

export function LocationChangeLoading({ pulseMs = 350 }: { pulseMs?: number }) {
  const [pathname] = useLocation();
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    let aberto = true;
    loadingBus.start();
    const t = window.setTimeout(() => { if (aberto) { aberto = false; loadingBus.done(); } }, pulseMs);
    return () => { window.clearTimeout(t); if (aberto) { aberto = false; loadingBus.done(); } };
  }, [pathname, pulseMs]);
  return null;
}

/** Consulta que conta como carregamento: buscando e ainda sem dado (meta.silencioso = nunca conta) */
export const consultaCarregando = (q: { state: { data: unknown; fetchStatus: string }; meta?: Record<string, unknown> }) =>
  q.state.fetchStatus === "fetching" && q.state.data === undefined && !q.meta?.silencioso;

export function QueryLoading() {
  const consultas = useIsFetching({ predicate: q => consultaCarregando(q as any) });
  const acoes = useIsMutating({ predicate: m => !m.meta?.silencioso });
  useSegurar(consultas + acoes > 0);
  return null;
}
