import { trpc } from "@/lib/trpc";

/**
 * Conta o uso do material para o Controle de acessos do escritório (baixou, enviou, copiou o texto).
 * Silencioso: se falhar, o corretor nem percebe.
 */
export function useRegistrarUso() {
  const m = trpc.materiais.registrarUso.useMutation({ onError: () => { /* estatística não atrapalha o corretor */ } });
  return (id: number, acao: "baixar" | "enviar" | "copiar") => { try { m.mutate({ id, acao }); } catch { /* idem */ } };
}
