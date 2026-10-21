import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { COM_CLIENTE, COR_SITUACAO, ROTULO_SITUACAO, SITUACOES_LOTE, type SituacaoLote } from "@shared/lotes";
import { SLUG_BOM_JARDIMS, codigoChacaraValido, linkChacara, linkKml } from "@shared/chacaraLink";
import { exibirTelefoneBR } from "@shared/telefone";
import EnviarWhatsAppModal from "@/components/EnviarWhatsAppModal";
import { Link2, Send, ExternalLink, Globe2 } from "lucide-react";

export type LotePainel = {
  id: number; codigo: string; quadra: string | null; numero: number | null; areaM2: number | null; perimetroM: number | null;
  situacao: SituacaoLote; leadId: number | null; leadNome: string | null; leadTelefone: string | null; clienteNome: string | null;
  corretorId: number | null; corretorNome: string | null; valorVenda: number | null; valorEntrada: number | null; numParcelas: number | null;
  dataSituacao: string | Date | null; observacao: string | null;
};

const m2 = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`);
const quando = (d: string | Date) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const campo = "w-full h-9 rounded-md border border-border bg-secondary px-2 text-sm";
const numero = (v: string) => (v.trim() === "" ? null : Number(v.replace(/\./g, "").replace(",", ".")));

/** Medidas do lote: cada lado com azimute, distância e confrontação (do memorial) */
function MedidasLote({ slug, codigo }: { slug: string; codigo: string }) {
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.empreendimentosAdmin.memoriais.useQuery({ slug, filtro: "todos", codigos: [codigo] });
  const m = data?.memoriais[0];
  return (
    <div className="border-t border-border pt-2 space-y-1.5">
      <p className="text-xs font-semibold text-muted-foreground">Medidas e confrontações</p>
      {isLoading && <p className="text-[11px] text-muted-foreground">Calculando…</p>}
      {!isLoading && !m && <p className="text-[11px] text-muted-foreground">Sem desenho importado para este lote.</p>}
      {m && (
        <>
          <div className="space-y-0.5">
            {m.vertices.map(v => (
              <p key={v.nome} className="text-[11px] leading-snug">
                <b>{v.nome}</b> · {v.distancia.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m · {v.azimute}
                <span className="text-muted-foreground"> — {v.confronta.replace(/^a /, "")}</span>
              </p>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/empreendimentos/${slug}/documentos?codigos=${codigo}`)}>Memorial descritivo</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/empreendimentos/${slug}/folder?lote=${codigo}`)}>Folder deste lote</Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Link público da chácara (fotos, mapa e localização exata) — copiar ou mandar pelo WhatsApp */
function LinkChacara({ slug, lote }: { slug: string; lote: LotePainel }) {
  const [enviar, setEnviar] = useState(false);
  const { data: det } = trpc.empreendimentosAdmin.detalhe.useQuery({ slug });
  const envio = trpc.empreendimentosAdmin.enviarLinkChacara.useMutation({
    onSuccess: r => { toast.success(`Link da chácara ${lote.codigo} enviado para ${exibirTelefoneBR(r.telefone)}`); setEnviar(false); },
    onError: e => toast.error(e.message),
  });
  const link = linkChacara(window.location.origin, lote.codigo);
  const copiar = async () => {
    try { await navigator.clipboard.writeText(link); toast.success(`Link da chácara ${lote.codigo} copiado`); }
    catch { window.prompt("Copie o link:", link); }
  };
  return (
    <div className="rounded-lg border border-border p-2.5 space-y-1.5">
      <p className="text-xs text-muted-foreground">Link da chácara (fotos, mapa, localização exata e poligonal para o Google Earth)</p>
      <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 truncate text-xs text-primary hover:underline">
        {link.replace(/^https?:\/\//, "")} <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={copiar}><Link2 className="mr-1 h-3.5 w-3.5" /> Copiar link da chácara</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs border-[#25d366]/40 text-[#1fa855] hover:text-[#1fa855]" onClick={() => setEnviar(true)}>
          <Send className="mr-1 h-3.5 w-3.5" /> Enviar no WhatsApp
        </Button>
        <Button asChild size="sm" variant="outline" className="h-7 text-xs">
          <a href={linkKml(window.location.origin, lote.codigo)} download><Globe2 className="mr-1 h-3.5 w-3.5" /> KML (Google Earth)</a>
        </Button>
      </div>
      {enviar && (
        <EnviarWhatsAppModal
          titulo={`Enviar o link da chácara ${lote.codigo}`}
          descricao="Vai uma mensagem com o link (fotos, mapa e localização exata da chácara), só para o número que você digitar — cliente, corretor ou você mesmo."
          sugestao={det?.destinoSugerido}
          enviando={envio.isPending}
          onFechar={() => setEnviar(false)}
          onEnviar={destino => envio.mutate({ slug, codigo: lote.codigo, telefone: destino })}
        />
      )}
    </div>
  );
}

export default function PainelLote({ slug, lote, onMudou, onFechar }: { slug: string; lote: LotePainel; onMudou: () => void; onFechar?: () => void }) {
  const [, navigate] = useLocation();
  const [situacao, setSituacao] = useState<SituacaoLote>(lote.situacao);
  const [leadId, setLeadId] = useState<number | null>(lote.leadId);
  const [leadRotulo, setLeadRotulo] = useState<string>(lote.leadNome ? `${lote.leadNome}${lote.leadTelefone ? ` · ${lote.leadTelefone}` : ""}` : "");
  const [busca, setBusca] = useState("");
  const [clienteNome, setClienteNome] = useState(lote.clienteNome ?? "");
  const [corretorId, setCorretorId] = useState<number | null>(lote.corretorId);
  const [valorVenda, setValorVenda] = useState(lote.valorVenda?.toString().replace(".", ",") ?? "");
  const [valorEntrada, setValorEntrada] = useState(lote.valorEntrada?.toString().replace(".", ",") ?? "");
  const [numParcelas, setNumParcelas] = useState(lote.numParcelas?.toString() ?? "");
  const [observacao, setObservacao] = useState(lote.observacao ?? "");

  useEffect(() => {
    setSituacao(lote.situacao); setLeadId(lote.leadId); setClienteNome(lote.clienteNome ?? ""); setCorretorId(lote.corretorId);
    setLeadRotulo(lote.leadNome ? `${lote.leadNome}${lote.leadTelefone ? ` · ${lote.leadTelefone}` : ""}` : "");
    setValorVenda(lote.valorVenda?.toString().replace(".", ",") ?? ""); setValorEntrada(lote.valorEntrada?.toString().replace(".", ",") ?? "");
    setNumParcelas(lote.numParcelas?.toString() ?? ""); setObservacao(lote.observacao ?? ""); setBusca("");
  }, [lote.id, lote.situacao, lote.dataSituacao]);

  const { data: corretores } = trpc.crm.responsaveis.useQuery();
  const { data: achados } = trpc.empreendimentosAdmin.buscarLeads.useQuery({ q: busca }, { enabled: busca.trim().length >= 2 });
  const { data: historico } = trpc.empreendimentosAdmin.historico.useQuery({ loteId: lote.id });
  const utils = trpc.useUtils();
  const salvar = trpc.empreendimentosAdmin.atualizarLote.useMutation({
    onSuccess: () => { toast.success(`Lote ${lote.codigo}: ${ROTULO_SITUACAO[situacao]}`); utils.empreendimentosAdmin.historico.invalidate({ loteId: lote.id }); onMudou(); },
    onError: e => toast.error(e.message),
  });

  const precisaCliente = COM_CLIENTE.includes(situacao);
  const comValores = ["reservado", "entrada", "vendido_parcelado", "vendido_avista", "quitado"].includes(situacao);

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Lote</p>
          <p className="text-xl font-bold">{lote.codigo}{lote.quadra ? ` · Quadra ${lote.quadra}` : ""}</p>
          <p className="text-xs text-muted-foreground">{m2(lote.areaM2)}{lote.perimetroM ? ` · perímetro ${lote.perimetroM.toLocaleString("pt-BR")} m` : ""}</p>
        </div>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-[#0C3320]" style={{ background: COR_SITUACAO[lote.situacao] }}>{ROTULO_SITUACAO[lote.situacao]}</span>
        {onFechar && <button onClick={onFechar} className="text-muted-foreground hover:text-foreground text-lg leading-none" aria-label="Fechar">×</button>}
      </div>

      <MedidasLote slug={slug} codigo={lote.codigo} />

      {slug === SLUG_BOM_JARDIMS && codigoChacaraValido(lote.codigo) && <LinkChacara slug={slug} lote={lote} />}

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Situação</span>
        <select value={situacao} onChange={e => setSituacao(e.target.value as SituacaoLote)} className={campo}>
          {SITUACOES_LOTE.map(s => <option key={s} value={s}>{ROTULO_SITUACAO[s]}</option>)}
        </select>
      </label>

      {precisaCliente && (
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Cliente (lead do CRM)</span>
          {leadId ? (
            <div className="flex items-center gap-2">
              <button onClick={() => navigate(`/leads/lead/${leadId}`)} className="flex-1 truncate text-left text-primary hover:underline">{leadRotulo || `Lead ${leadId}`}</button>
              <button onClick={() => { setLeadId(null); setLeadRotulo(""); }} className="text-xs text-muted-foreground hover:text-foreground">trocar</button>
            </div>
          ) : (
            <>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar lead por nome ou telefone" className={campo} />
              {(achados ?? []).length > 0 && (
                <div className="rounded-md border border-border divide-y divide-border max-h-40 overflow-y-auto">
                  {(achados ?? []).map(a => (
                    <button key={a.id} onClick={() => { setLeadId(a.id); setLeadRotulo(`${a.nome || "Lead"} · ${a.phone}`); setBusca(""); if (!clienteNome) setClienteNome(a.nome || ""); }}
                      className="block w-full px-2 py-1.5 text-left text-xs hover:bg-secondary">{a.nome || "Lead"} · {a.phone}</button>
                  ))}
                </div>
              )}
            </>
          )}
          <input value={clienteNome} onChange={e => setClienteNome(e.target.value)} maxLength={160} placeholder="Nome do cliente (se não estiver no CRM)" className={campo} />
        </div>
      )}

      {situacao !== "disponivel" && situacao !== "bloqueado" && (
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Corretor</span>
          <select value={corretorId ?? ""} onChange={e => setCorretorId(e.target.value ? Number(e.target.value) : null)} className={campo}>
            <option value="">—</option>
            {(corretores ?? []).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </label>
      )}

      {comValores && (
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1"><span className="text-xs text-muted-foreground">Valor da venda (R$)</span>
            <input value={valorVenda} onChange={e => setValorVenda(e.target.value)} inputMode="decimal" className={campo} /></label>
          <label className="space-y-1"><span className="text-xs text-muted-foreground">Entrada / sinal (R$)</span>
            <input value={valorEntrada} onChange={e => setValorEntrada(e.target.value)} inputMode="decimal" className={campo} /></label>
          {(situacao === "vendido_parcelado" || situacao === "entrada" || situacao === "quitado") && (
            <label className="space-y-1"><span className="text-xs text-muted-foreground">Parcelas</span>
              <input value={numParcelas} onChange={e => setNumParcelas(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={campo} /></label>
          )}
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Observação</span>
        <textarea value={observacao} onChange={e => setObservacao(e.target.value)} maxLength={500} rows={2} className="w-full rounded-md border border-border bg-secondary px-2 py-1.5 text-sm" />
      </label>

      <Button className="w-full" disabled={salvar.isPending} onClick={() => salvar.mutate({
        loteId: lote.id, situacao, leadId, clienteNome: clienteNome || null, corretorId,
        valorVenda: numero(valorVenda), valorEntrada: numero(valorEntrada), numParcelas: numParcelas ? Number(numParcelas) : null, observacao: observacao || null,
      })}>Salvar</Button>

      {(historico ?? []).length > 0 && (
        <div className="border-t border-border pt-2 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">Histórico</p>
          {(historico ?? []).map(h => (
            <p key={h.id} className="text-[11px] text-muted-foreground">
              {quando(h.em)} · {h.de ? `${ROTULO_SITUACAO[h.de as SituacaoLote] ?? h.de} → ` : ""}<b className="text-foreground">{ROTULO_SITUACAO[h.para as SituacaoLote] ?? h.para}</b>
              {h.quem ? ` · por ${h.quem}` : ""}{h.corretor ? ` · corretor ${h.corretor}` : ""}{h.detalhe ? ` · ${h.detalhe}` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
