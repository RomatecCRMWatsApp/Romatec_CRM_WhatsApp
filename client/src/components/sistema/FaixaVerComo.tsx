import { useEffect } from "react";
import { Eye, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { sairVerComo, verComoAtual } from "@/lib/verComo";

/**
 * Faixa do "ver como": fica por cima de todas as telas enquanto o administrador vê o sistema como outra pessoa —
 * com o nome, o aviso de só leitura e o botão para voltar. Se o servidor não aceitou (me.verComo vazio), sai do modo.
 */
export default function FaixaVerComo() {
  const p = verComoAtual();
  const { user, loading } = useAuth();
  const aceito = !!(user as any)?.verComo;
  useEffect(() => {
    if (p && !loading && user && !aceito) sairVerComo("/dashboard");
  }, [p, loading, user, aceito]);
  if (!p) return null;
  return (
    <div role="status" className="fixed bottom-24 left-1/2 z-[200] flex max-w-[95vw] -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--rt-gold)] bg-black/90 py-1.5 pl-3 pr-1.5 text-xs text-white shadow-2xl shadow-black/60 backdrop-blur min-[900px]:bottom-4">
      <Eye className="h-4 w-4 shrink-0 text-[var(--rt-gold)]" />
      <span className="truncate">Vendo como <b>{p.nome}</b> ({p.rotuloPerfil}) · só leitura</span>
      <button onClick={() => sairVerComo()} className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--rt-gold)] px-3 py-1 font-semibold text-black hover:brightness-110">
        <X className="h-3.5 w-3.5" /> Sair
      </button>
    </div>
  );
}
