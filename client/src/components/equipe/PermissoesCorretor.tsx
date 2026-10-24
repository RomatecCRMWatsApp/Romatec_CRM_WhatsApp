import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ROTULO_PERFIL } from "@shared/equipe";

const pctTexto = (v: number | null | undefined) => (v == null ? "" : (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }));
const pctNumero = (s: string) => { const t = s.trim().replace(",", "."); return t === "" ? null : Number(t) / 100; };

/** Pacote base de cada perfil da equipe (vale para todos, a não ser que a pessoa tenha ajuste próprio) */
export function PacoteBase() {
  const utils = trpc.useUtils();
  const [perfil, setPerfil] = useState<"corretor" | "secretario">("corretor");
  const { data } = trpc.permissoes.base.useQuery({ perfil });
  const mudar = trpc.permissoes.definirBase.useMutation({
    onSuccess: () => { toast.success("Pacote base atualizado"); utils.permissoes.invalidate(); },
    onError: e => toast.error(e.message),
  });
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 font-semibold">Pacote base do perfil</p>
        <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
          {(["corretor", "secretario"] as const).map(p => (
            <button key={p} type="button" onClick={() => setPerfil(p)}
              className={`rounded px-2.5 py-1 ${perfil === p ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{ROTULO_PERFIL[p]}</button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Todo {ROTULO_PERFIL[perfil].toLowerCase()} herda estes módulos. Ajuste individual fica em "Permissões" de cada um.
        {perfil === "corretor" ? " O corretor só vê os leads em que é o responsável." : " O secretário vê todos os leads, empreendimentos e imóveis."}
      </p>
      {!data ? <p className="text-xs text-muted-foreground">Carregando…</p> : (
      <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {data.map(m => (
          <label key={m.chave} className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={m.permitido} disabled={mudar.isPending} onChange={e => mudar.mutate({ perfil, modulo: m.chave, permitido: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" />
            {m.rotulo}
          </label>
        ))}
      </div>
      )}
    </div>
  );
}

/** % de comissão do corretor num empreendimento (vazio = padrão do empreendimento) */
function CampoComissao({ valor, padrao, onSalvar }: { valor: number | null; padrao: number | null; onSalvar: (pct: number | null) => void }) {
  const [texto, setTexto] = useState(pctTexto(valor));
  const salvar = () => {
    const pct = pctNumero(texto);
    if (pct != null && (!Number.isFinite(pct) || pct < 0 || pct > 1)) { toast.error("Comissão entre 0 e 100%"); return; }
    if (pct !== valor) onSalvar(pct);
  };
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <input value={texto} onChange={e => setTexto(e.target.value)} onBlur={salvar} onKeyDown={e => e.key === "Enter" && salvar()} inputMode="decimal"
        placeholder={padrao != null ? pctTexto(padrao) : "—"} className="h-7 w-16 rounded border border-border bg-secondary px-1.5 text-right" aria-label="Comissão do corretor (%)" />
      % <span className="text-muted-foreground">{valor == null ? `(padrão${padrao != null ? ` ${pctTexto(padrao)}%` : ""})` : ""}</span>
    </span>
  );
}

/** Permissões de um corretor: módulos (ajuste sobre o pacote base), empreendimentos com % de comissão e imóveis */
export default function PermissoesCorretor({ usuarioId }: { usuarioId: number }) {
  const utils = trpc.useUtils();
  const { data, error, isLoading } = trpc.permissoes.corretor.useQuery({ usuarioId });
  const [buscaImovel, setBuscaImovel] = useState("");
  const ok = () => utils.permissoes.corretor.invalidate({ usuarioId });
  const modulo = trpc.permissoes.definirModulo.useMutation({ onSuccess: ok, onError: e => toast.error(e.message) });
  const acesso = trpc.permissoes.definirAcesso.useMutation({ onSuccess: ok, onError: e => toast.error(e.message) });

  if (error) return <p className="text-xs text-red-400">{error.message}</p>;
  if (isLoading || !data) return <p className="text-xs text-muted-foreground">Carregando permissões…</p>;
  const imoveis = data.imoveis.filter(i => !buscaImovel.trim() || i.nome.toLowerCase().includes(buscaImovel.trim().toLowerCase()));

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-secondary/20 p-3 text-sm lg:grid-cols-3">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold">Módulos</p>
        {data.modulos.map(m => (
          <div key={m.chave} className="flex items-center gap-2 text-xs">
            <select value={m.ajuste === null ? "base" : m.ajuste ? "sim" : "nao"} disabled={modulo.isPending}
              onChange={e => modulo.mutate({ usuarioId, modulo: m.chave, permitido: e.target.value === "base" ? null : e.target.value === "sim" })}
              className="h-7 rounded border border-border bg-secondary px-1 text-xs">
              <option value="base">Pacote base ({m.pacoteBase ? "sim" : "não"})</option>
              <option value="sim">Liberado</option>
              <option value="nao">Bloqueado</option>
            </select>
            <span className={m.efetivo ? "" : "text-muted-foreground line-through"}>{m.rotulo}</span>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold">Empreendimentos habilitados</p>
        <p className="text-[11px] text-muted-foreground">Comissão do corretor sobre o valor da venda; vazio = a do empreendimento.</p>
        {data.empreendimentos.map(e => (
          <div key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={e.habilitado} disabled={acesso.isPending} onChange={ev => acesso.mutate({ usuarioId, tipo: "empreendimento", refId: e.id, habilitado: ev.target.checked })} className="h-4 w-4 accent-[var(--primary)]" />
              {e.nome}
            </label>
            {e.habilitado && <CampoComissao key={`${e.id}-${e.comissaoPct}`} valor={e.comissaoPct} padrao={e.comissaoPadraoPct}
              onSalvar={pct => acesso.mutate({ usuarioId, tipo: "empreendimento", refId: e.id, habilitado: true, comissaoPct: pct })} />}
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-xs font-semibold">Imóveis habilitados ({data.imoveis.filter(i => i.habilitado).length}/{data.imoveis.length})</p>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={acesso.isPending}
            onClick={() => data.imoveis.filter(i => !i.habilitado).forEach(i => acesso.mutate({ usuarioId, tipo: "imovel", refId: i.id, habilitado: true }))}>Todos</Button>
        </div>
        <input value={buscaImovel} onChange={e => setBuscaImovel(e.target.value)} placeholder="Filtrar imóveis" className="h-7 w-full rounded border border-border bg-secondary px-2 text-xs" />
        <div className="max-h-48 space-y-1 overflow-auto">
          {imoveis.map(i => (
            <label key={i.id} className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={i.habilitado} disabled={acesso.isPending} onChange={ev => acesso.mutate({ usuarioId, tipo: "imovel", refId: i.id, habilitado: ev.target.checked })} className="h-4 w-4 accent-[var(--primary)]" />
              <span className="truncate">{i.nome}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
