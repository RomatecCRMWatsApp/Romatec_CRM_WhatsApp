import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

/**
 * "Abrir AvalieImob" (plano Corretor Pro): pede o link de entrada única (válido por 60 s, uso único) e abre numa aba nova.
 * A aba é aberta antes da chamada (no clique) para o navegador não bloquear o pop-up.
 */
export function useAbrirAvalieimob() {
  const m = trpc.saas.minhaAvalieimobSso.useMutation();
  return {
    isPending: m.isPending,
    mutate: () => {
      const aba = window.open("about:blank", "_blank");
      if (aba) aba.opener = null;
      m.mutate(undefined, {
        onSuccess: r => { if (aba) aba.location.href = r.url; else window.location.href = r.url; },
        onError: e => { aba?.close(); toast.error(e.message); },
      });
    },
  };
}
