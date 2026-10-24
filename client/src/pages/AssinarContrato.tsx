import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { CheckCircle2, Download, FileSignature, Loader2, Lock, ShieldCheck, Upload } from "lucide-react";
import { abrirPdf, desenharPagina } from "@/lib/pdf";

const VERDE = "#0C3320", DOURADO = "#C9A646", CREME = "#F7F3E8";

interface Info {
  contrato: { numero: string; empreendimento: string; lote: string; status: string; codigoVerificacao: string };
  signatario: { nome: string; papel: string; papelRotulo: string; metodo: string; metodoRotulo: string; status: string; assinadoEm: string | null; telefoneFinal: string | null };
  vez: boolean; aguardando: string | null; bytes: number;
  outros: { papel: string; nome: string; status: string }[];
}

async function chamar(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.mensagem || "Não foi possível concluir");
  return j;
}

/** Leitura do contrato em canvas: libera a assinatura quando o leitor chega ao fim */
function LeitorContrato({ url, onFim }: { url: string; onFim: () => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [paginas, setPaginas] = useState(0);
  const [lidas, setLidas] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const doc = await abrirPdf(url);
        if (!vivo || !caixa.current) return;
        setPaginas(doc.numPages);
        const largura = Math.min(caixa.current.clientWidth - 16, 820);
        for (let n = 1; n <= doc.numPages && vivo; n++) {
          const c = document.createElement("canvas");
          c.className = "mx-auto mb-3 block bg-white shadow";
          c.setAttribute("aria-label", `Página ${n} de ${doc.numPages}`);
          caixa.current.appendChild(c);
          await desenharPagina(doc, n, c, largura);
          setLidas(n);
        }
        // Contrato que cabe inteiro na tela: já foi lido
        const el = caixa.current;
        if (vivo && el && el.scrollHeight <= el.clientHeight + 40) onFim();
      } catch (e: any) { setErro("Não foi possível abrir o contrato. Use o botão de baixar."); }
    })();
    return () => { vivo = false; };
  }, [url]);
  const rolar = () => {
    const el = caixa.current;
    if (el && paginas && lidas === paginas && el.scrollTop + el.clientHeight >= el.scrollHeight - 40) onFim();
  };
  return (
    <div>
      <div ref={caixa} onScroll={rolar} className="h-[65vh] overflow-y-auto rounded-lg border bg-neutral-200 p-2" style={{ borderColor: DOURADO }} tabIndex={0} aria-label="Contrato para leitura" />
      <p className="mt-1 text-xs text-neutral-600">
        {erro ?? (paginas ? (lidas < paginas ? `Carregando página ${lidas + 1} de ${paginas}…` : `${paginas} páginas — role até o fim para liberar a assinatura`) : "Abrindo o contrato…")}
      </p>
    </div>
  );
}

const lerBase64 = (f: File) => new Promise<string>((ok, falha) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] ?? ""); r.onerror = falha; r.readAsDataURL(f); });

/** Página pública do signatário (link individual): lê o contrato e assina pelo método definido para ele */
export default function AssinarContrato() {
  const { token } = useParams<{ token: string }>();
  const base = `/api/assinar/${token}`;
  const [info, setInfo] = useState<Info | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [leu, setLeu] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [enviado, setEnviado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pfx, setPfx] = useState<File | null>(null);
  const [senha, setSenha] = useState("");
  const [arquivoGov, setArquivoGov] = useState<File | null>(null);
  const [feito, setFeito] = useState(false);

  const carregar = () => chamar(base).then(setInfo).catch(e => setErro(e.message));
  useEffect(() => { carregar(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const executar = async (f: () => Promise<void>) => { setOcupado(true); setMsg(null); try { await f(); } catch (e: any) { setMsg(e.message); } finally { setOcupado(false); } };
  const pedirCodigo = () => executar(async () => { const r = await chamar(`${base}/codigo`, { method: "POST" }); setEnviado(r.destino); });
  const geo = () => new Promise<{ lat: number; lon: number } | null>(ok => {
    if (!navigator.geolocation) return ok(null);
    navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lon: p.coords.longitude }), () => ok(null), { timeout: 4000 });
  });
  const assinarAvancada = () => executar(async () => {
    await chamar(`${base}/avancada`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo, leuAteOFim: leu, aceite, geo: await geo() }) });
    setFeito(true); carregar();
  });
  const assinarCertificado = () => executar(async () => {
    if (!pfx) throw new Error("Escolha o arquivo do certificado (.pfx ou .p12)");
    const pfxBase64 = await lerBase64(pfx);
    await chamar(`${base}/certificado`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pfxBase64, senha }) });
    setSenha(""); setPfx(null); setFeito(true); carregar();
  });
  const enviarGovbr = () => executar(async () => {
    if (!arquivoGov) throw new Error("Escolha o PDF assinado no gov.br");
    await chamar(`${base}/govbr`, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: arquivoGov });
    setFeito(true); carregar();
  });

  const s = info?.signatario;
  const assinado = feito || s?.status === "assinado";
  return (
    <div className="min-h-screen" style={{ background: CREME, color: "#1d2b22", fontFamily: "Manrope, system-ui, sans-serif" }}>
      <header className="border-b-4 px-4 py-3" style={{ background: VERDE, borderColor: DOURADO }}>
        <div className="mx-auto flex max-w-5xl items-center gap-3 text-white">
          <img src="/bom-jardims/logo.webp" alt="" className="h-10 w-auto" onError={e => ((e.target as HTMLImageElement).style.display = "none")} />
          <div>
            <p className="font-bold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Condomínio de Chácaras Bom Jardims</p>
            <p className="text-xs" style={{ color: DOURADO }}>Assinatura do contrato</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-5">
        {erro && <p className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">{erro}</p>}
        {!info && !erro && <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
        {info && s && (
          <>
            <section className="rounded-xl border bg-white p-4" style={{ borderColor: DOURADO }}>
              <h1 className="text-lg font-bold" style={{ color: VERDE }}>Contrato {info.contrato.numero} · Chácara {info.contrato.lote}</h1>
              <p className="text-sm">Olá, <b>{s.nome}</b>. Você assina como <b>{s.papelRotulo.toLowerCase()}</b> — {s.metodoRotulo}.</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {info.outros.map((o, i) => (
                  <span key={i} className={`rounded-full px-2 py-0.5 ${o.status === "assinado" ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-600"}`}>
                    {o.nome} · {o.papel} {o.status === "assinado" ? "✓" : ""}
                  </span>
                ))}
              </div>
            </section>

            {assinado ? (
              <section className="rounded-xl border bg-white p-6 text-center" style={{ borderColor: DOURADO }}>
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
                <h2 className="mt-2 text-lg font-bold" style={{ color: VERDE }}>Assinatura registrada</h2>
                <p className="text-sm">Obrigado! Quando todos assinarem, você recebe o contrato pelo WhatsApp.</p>
                <p className="mt-3 text-xs text-neutral-600">Confira a autenticidade em <a className="underline" href={`/c/v/${info.contrato.codigoVerificacao}`}>romateccrm.com/c/v/{info.contrato.codigoVerificacao}</a></p>
                <a className="mt-3 inline-flex items-center gap-1 text-sm underline" href={`${base}/contrato.pdf?baixar=1`}><Download className="h-4 w-4" /> Baixar o contrato</a>
              </section>
            ) : (
              <>
                <section className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold" style={{ color: VERDE }}>1. Leia o contrato</h2>
                    <a className="inline-flex items-center gap-1 text-sm underline" href={`${base}/contrato.pdf?baixar=1`}><Download className="h-4 w-4" /> Baixar PDF</a>
                  </div>
                  <LeitorContrato url={`${base}/contrato.pdf`} onFim={() => setLeu(true)} />
                  {leu && <p className="text-sm text-emerald-700">✓ Leitura concluída</p>}
                </section>

                <section className="space-y-3 rounded-xl border bg-white p-4" style={{ borderColor: DOURADO }}>
                  <h2 className="font-semibold" style={{ color: VERDE }}>2. Assine</h2>
                  {!info.vez && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{info.aguardando}</p>}

                  {s.metodo === "avancada" && (
                    <div className="space-y-3">
                      <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-1" checked={aceite} onChange={e => setAceite(e.target.checked)} disabled={!leu} />
                        <span>Li o contrato inteiro e concordo com todas as cláusulas. Sei que esta assinatura eletrônica tem validade jurídica (MP 2.200-2/2001, art. 10, § 2º).</span>
                      </label>
                      <button disabled={!leu || ocupado} onClick={pedirCodigo} className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: VERDE }}>
                        {enviado ? "Reenviar código" : `Receber código no WhatsApp${s.telefoneFinal ? ` (final ${s.telefoneFinal})` : ""}`}
                      </button>
                      {enviado && (
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="text-sm">Código enviado para {enviado}
                            <input value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code"
                              className="mt-1 block w-40 rounded-lg border px-3 py-2 text-center text-lg tracking-[0.4em]" placeholder="000000" aria-label="Código de 6 dígitos" />
                          </label>
                          <button disabled={codigo.length !== 6 || !aceite || !leu || ocupado} onClick={assinarAvancada}
                            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: DOURADO, color: VERDE }}>
                            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />} Assinar contrato
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {s.metodo === "icp_a1" && (
                    <div className="space-y-3">
                      <p className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900"><Lock className="mt-0.5 h-4 w-4 shrink-0" />
                        Seu certificado e sua senha são usados só nesta assinatura e não ficam guardados no sistema. Ninguém pode assinar com o seu certificado por você.</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-sm">Certificado A1 (.pfx ou .p12)
                          <input type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={e => setPfx(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
                        </label>
                        <label className="text-sm">Senha do certificado
                          <input type="password" value={senha} onChange={e => setSenha(e.target.value)} autoComplete="off" className="mt-1 block w-full rounded-lg border px-3 py-2" />
                        </label>
                      </div>
                      <button disabled={!leu || !info.vez || !pfx || !senha || ocupado} onClick={assinarCertificado}
                        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: DOURADO, color: VERDE }}>
                        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Assinar com certificado digital
                      </button>
                    </div>
                  )}

                  {s.metodo === "govbr" && (
                    <ol className="list-decimal space-y-2 pl-5 text-sm">
                      <li><a className="underline" href={`${base}/contrato.pdf?baixar=1`}>Baixe o contrato em PDF</a> (não altere o arquivo).</li>
                      <li>Abra <a className="underline" href="https://assinador.iti.br" target="_blank" rel="noreferrer">assinador.iti.br</a>, entre com sua conta gov.br (prata ou ouro) e assine o PDF.</li>
                      <li className="space-y-2">Envie aqui o PDF assinado:
                        <input type="file" accept="application/pdf" onChange={e => setArquivoGov(e.target.files?.[0] ?? null)} className="mt-1 block text-sm" />
                        <button disabled={!leu || !info.vez || !arquivoGov || ocupado} onClick={enviarGovbr}
                          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: DOURADO, color: VERDE }}>
                          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar PDF assinado
                        </button>
                      </li>
                    </ol>
                  )}
                  {!leu && <p className="text-xs text-neutral-600">A assinatura é liberada depois que você rolar o contrato até o fim.</p>}
                  {msg && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-800">{msg}</p>}
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
