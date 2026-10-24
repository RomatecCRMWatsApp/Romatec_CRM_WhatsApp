import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";

const VERDE = "#0C3320", DOURADO = "#C9A646", CREME = "#F7F3E8";
const METODO: Record<string, string> = { avancada: "Eletrônica avançada", govbr: "gov.br", icp_a1: "ICP-Brasil", manuscrita: "A punho" };
const STATUS: Record<string, string> = {
  em_assinatura: "Em assinatura", assinado: "Assinado", ativo: "Assinado e em vigor", quitado: "Quitado", cancelado: "Cancelado", distratado: "Distratado",
  apto_assinatura: "Aguardando envio para assinatura", minuta: "Minuta (sem valor)", rascunho: "Rascunho",
};

async function sha256(f: File) {
  const h = await crypto.subtle.digest("SHA-256", await f.arrayBuffer());
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Verificação pública do contrato (/c/v/:codigo): situação, signatários mascarados e conferência do arquivo pelo SHA-256 */
export default function VerificarContrato() {
  const { codigo } = useParams<{ codigo: string }>();
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [res, setRes] = useState<{ confere: boolean; versaoFinal: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    fetch(`/api/c/v/${encodeURIComponent(codigo)}`).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.mensagem); setD(j); }).catch(e => setErro(e.message));
  }, [codigo]);
  const conferir = async (f: File | undefined) => {
    if (!f) return;
    setOcupado(true); setRes(null);
    try {
      // O arquivo não sai do aparelho: só o SHA-256 vai para o servidor
      const r = await fetch(`/api/c/v/${encodeURIComponent(codigo)}/conferir`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sha256: await sha256(f) }) });
      setRes(await r.json());
    } finally { setOcupado(false); }
  };
  return (
    <div className="min-h-screen" style={{ background: CREME, color: "#1d2b22", fontFamily: "Manrope, system-ui, sans-serif" }}>
      <header className="border-b-4 px-4 py-3 text-white" style={{ background: VERDE, borderColor: DOURADO }}>
        <p className="mx-auto max-w-3xl font-bold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Condomínio de Chácaras Bom Jardims · Verificação de contrato</p>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        {erro && <p className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">{erro}</p>}
        {!d && !erro && <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Consultando…</p>}
        {d && (
          <>
            <section className="rounded-xl border bg-white p-4" style={{ borderColor: DOURADO }}>
              <h1 className="flex items-center gap-2 text-lg font-bold" style={{ color: VERDE }}><ShieldCheck className="h-5 w-5" /> Contrato {d.numero}</h1>
              <p className="text-sm">{d.empreendimento} · <b>{STATUS[d.status] ?? d.status}</b></p>
              {d.sha256 && <p className="mt-2 break-all font-mono text-[11px] text-neutral-600">SHA-256 da versão atual: {d.sha256}</p>}
            </section>
            <section className="rounded-xl border bg-white p-4" style={{ borderColor: DOURADO }}>
              <h2 className="mb-2 font-semibold" style={{ color: VERDE }}>Signatários</h2>
              <ul className="divide-y text-sm">
                {d.signatarios.map((s: any, i: number) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span><b>{s.nome}</b> · CPF {s.cpf}</span>
                    <span className={s.status === "assinado" ? "text-emerald-700" : "text-neutral-500"}>
                      {s.status === "assinado" ? `✓ ${METODO[s.metodo] ?? s.metodo} · ${new Date(s.assinadoEm).toLocaleString("pt-BR")}` : "pendente"}
                    </span>
                  </li>
                ))}
                {!d.signatarios.length && <li className="py-2 text-neutral-500">Ainda não enviado para assinatura.</li>}
              </ul>
            </section>
            <section className="rounded-xl border bg-white p-4" style={{ borderColor: DOURADO }}>
              <h2 className="mb-1 font-semibold" style={{ color: VERDE }}>Conferir um arquivo</h2>
              <p className="mb-2 text-xs text-neutral-600">Escolha o PDF do contrato: o aparelho calcula a impressão digital (SHA-256) e compara com a registrada. O arquivo não é enviado.</p>
              <input type="file" accept="application/pdf" onChange={e => conferir(e.target.files?.[0])} className="text-sm" />
              {ocupado && <p className="mt-2 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Conferindo…</p>}
              {res && (res.confere
                ? <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Arquivo autêntico{res.versaoFinal ? " — é a versão final do contrato" : " — versão anterior do contrato"}.</p>
                : <p className="mt-2 flex items-center gap-2 text-sm text-red-700"><XCircle className="h-4 w-4" /> Este arquivo não corresponde a nenhuma versão registrada.</p>)}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
