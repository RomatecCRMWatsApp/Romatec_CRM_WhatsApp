import { useLocation } from "wouter";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, IdCard, MonitorPause } from "lucide-react";
import { DESCANSO_PADRAO, OPCOES_DESCANSO } from "@shared/releases";
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
        <Preferencias minutos={Number((user as any)?.descansoMinutos ?? DESCANSO_PADRAO)} />
      </div>
    </div>
  );
}

/** Preferências da pessoa: tempo da tela de descanso (salvo no cadastro, vale em qualquer aparelho) */
function Preferencias({ minutos }: { minutos: number }) {
  const utils = trpc.useUtils();
  const salvar = trpc.novidades.definirDescanso.useMutation({
    onSuccess: r => { utils.auth.me.invalidate(); toast.success(r.minutos ? `Tela de descanso depois de ${r.minutos} min` : "Tela de descanso desativada"); },
    onError: e => toast.error(e.message),
  });
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><MonitorPause className="h-4 w-4" /> Preferências</p>
      <label className="flex flex-wrap items-center gap-3 text-sm">
        Tela de descanso
        <select value={minutos} disabled={salvar.isPending} onChange={e => salvar.mutate({ minutos: Number(e.target.value) })}
          className="h-9 rounded-md border border-border bg-secondary/30 px-3 text-sm">
          {OPCOES_DESCANSO.map(m => <option key={m} value={m}>{m ? `depois de ${m} min sem uso` : "Desativada"}</option>)}
        </select>
      </label>
      <p className="text-[11px] text-muted-foreground">Cobre a tela com a hora e o selo Romatec quando você fica um tempo sem mexer — protege os dados dos clientes. Não abre durante envios de arquivo ou com a câmera aberta.</p>
    </div>
  );
}
