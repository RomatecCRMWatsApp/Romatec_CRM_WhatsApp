import { useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, IdCard } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import PageHeader from "@/components/PageHeader";
import CadastroUsuario from "@/components/equipe/CadastroUsuario";
import { perfilDe } from "@shared/equipe";

/** "Meu cadastro": o próprio usuário (todos os perfis) mantém dados, foto, credenciais e documentos */
export default function MeuCadastro() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const perfil = perfilDe(user as any);
  const { data: pendencias } = trpc.cadastro.minhasPendencias.useQuery(undefined, { enabled: !!user });

  return (
    <div>
      <PageHeader icone={IdCard} titulo="Meu cadastro" subtitulo="Seus dados vão para os contratos — mantenha-os em dia" />
      <div className="px-4 md:px-6 pb-6 max-w-[1200px] mx-auto space-y-4">
        {perfil === "empreendedor" && (
          <button onClick={() => navigate("/empreendedor")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar ao painel</button>
        )}
        {!!pendencias?.length && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div><b>Pendências:</b> {pendencias.join(" · ")}. Envie ou atualize em "Credenciais profissionais".</div>
          </div>
        )}
        <div className="rounded-xl border border-border bg-card p-4">
          <CadastroUsuario admin={perfil === "admin"} onSalvo={() => utils.auth.me.invalidate()} />
        </div>
      </div>
    </div>
  );
}
