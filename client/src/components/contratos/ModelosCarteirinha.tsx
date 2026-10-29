import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { brandAssets } from "@/brand/assets";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { exibirTelefoneBR } from "@shared/telefone";
import { Camera, FileDown, IdCard, Loader2, Printer, QrCode, X } from "lucide-react";

/**
 * Modelos para apresentar ao cliente (aba Carteirinhas): a carteirinha do condomínio (frente e verso, igual ao PDF da
 * gráfica — server/contratos/carteirinhas.ts) e o crachá de visitante/convidado da portaria. Prévia ao vivo: o que se
 * digita e a foto escolhida aparecem no cartão na hora. A foto fica só no navegador (nada é gravado).
 */

// Mesmas cores do PDF (server/financeiro/render/comum.ts → COR)
const VERDE = "#0C3320", DOURADO = "#C9A646", CREME = "#F3EEE2";
const LOGO = "/bom-jardims/logo-520.webp";
const EMPREENDIMENTO = "Condomínio de Chácaras Bom Jardims";
const VINCULOS = ["Titular", "Cônjuge", "Dependente · Filho(a)", "Dependente · Pai/Mãe", "Dependente · Neto(a)", "Dependente · Outro"];
const campo = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";
const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?";
const validadeModelo = () => new Date(Date.now() + 365 * 86_400_000).toLocaleDateString("pt-BR");

/** Foto escolhida no aparelho, só para a prévia */
function useFotoLocal() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const escolher = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast.error("Escolha uma imagem (JPG, PNG ou WEBP)"); return; }
    setUrl(URL.createObjectURL(f));
  };
  return { url, escolher, limpar: () => setUrl(null) };
}

function Foto({ url, nome, className }: { url: string | null; nome: string; className: string }) {
  return url
    ? <img src={url} alt={`Foto de ${nome || "pessoa"}`} className={`object-cover ${className}`} />
    : <div className={`flex items-center justify-center text-lg font-bold ${className}`} style={{ background: CREME, color: VERDE }}>{iniciais(nome)}</div>;
}

/** Carteirinha CR80 (85,6 × 54 mm) — frente */
export function CarteirinhaFrente({ nome, vinculo, unidade, foto }: { nome: string; vinculo: string; unidade: string; foto: string | null }) {
  return (
    <div className="relative aspect-[85.6/54] w-full overflow-hidden rounded-xl text-white shadow-xl shadow-black/40" style={{ background: VERDE, containerType: "inline-size" } as any}>
      <div className="absolute inset-x-0 top-0 h-[3%]" style={{ background: DOURADO }} />
      <div className="absolute left-[4%] top-[7%] flex items-center gap-[3%]" style={{ width: "92%" }}>
        <img src={LOGO} alt="" className="w-[26%] object-contain" />
        <div className="min-w-0">
          <p className="font-bold leading-tight" style={{ color: DOURADO, fontSize: "4.2cqw" }}>CARTEIRINHA DO CONDOMÍNIO</p>
          <p className="truncate leading-tight" style={{ color: CREME, fontSize: "3.3cqw" }}>{EMPREENDIMENTO.toUpperCase()}</p>
        </div>
      </div>
      <div className="absolute bottom-[6.5%] left-[4%] h-[46%] w-[22%] overflow-hidden rounded-md border-2" style={{ borderColor: DOURADO }}>
        <Foto url={foto} nome={nome} className="h-full w-full" />
      </div>
      <div className="absolute bottom-[7%] left-[30%] right-[4%] space-y-[1.2cqw]">
        <p className="line-clamp-2 font-bold uppercase leading-tight" style={{ fontSize: "5.4cqw" }}>{nome || "NOME DO TITULAR"}</p>
        <p className="font-bold" style={{ color: DOURADO, fontSize: "4.2cqw" }}>{vinculo}</p>
        <p style={{ color: CREME, fontSize: "3.8cqw" }}>{unidade || "Chácara A01 · Quadra A"}</p>
        <p className="font-bold" style={{ color: CREME, fontSize: "3.8cqw" }}>Nº BJ-000123</p>
        <p style={{ color: CREME, fontSize: "3.8cqw" }}>Válida até {validadeModelo()}</p>
      </div>
    </div>
  );
}

/** Carteirinha — verso (QR de autenticidade e contatos) */
export function CarteirinhaVerso() {
  return (
    <div className="relative aspect-[85.6/54] w-full overflow-hidden rounded-xl shadow-xl shadow-black/40" style={{ background: CREME, color: VERDE, containerType: "inline-size" } as any}>
      <div className="absolute inset-x-0 bottom-0 h-[3%]" style={{ background: DOURADO }} />
      <div className="absolute left-[5%] top-1/2 flex aspect-square w-[35%] -translate-y-1/2 items-center justify-center rounded bg-white">
        <QrCode className="h-[80%] w-[80%]" style={{ color: VERDE }} />
      </div>
      <div className="absolute left-[44%] right-[4%] top-[9%] space-y-[0.9cqw] leading-snug" style={{ fontSize: "3.25cqw" }}>
        <p>Uso pessoal e intransferível.</p>
        <p>Apresente na portaria com um documento com foto.</p>
        <p>Aponte a câmera para o QR para conferir a autenticidade.</p>
        <p className="pt-[1cqw] font-bold">Administração: (99) 9 9101-1970</p>
        <p className="font-bold">Vendas: (99) 9 9181-1246</p>
      </div>
      <p className="absolute bottom-[6%] left-[44%] right-[4%] text-center opacity-60" style={{ fontSize: "2.8cqw" }}>BJ-000123 · contrato MODELO</p>
    </div>
  );
}

/** Crachá de visitante/convidado da portaria (vertical, 54 × 86 mm) */
export function Cracha({ nome, tipo, evento, numero, foto }: { nome: string; tipo: string; evento: string; numero: string; foto: string | null }) {
  return (
    <div className="relative mx-auto flex aspect-[54/86] w-full max-w-[260px] flex-col overflow-hidden rounded-xl shadow-xl shadow-black/40" style={{ background: CREME, color: VERDE, containerType: "inline-size" } as any}>
      <div className="flex flex-col items-center gap-[2cqw] px-[6%] pb-[5%] pt-[6%]" style={{ background: VERDE }}>
        <img src={LOGO} alt="" className="w-[58%] object-contain" />
        <p className="text-center font-bold tracking-[0.2em]" style={{ color: DOURADO, fontSize: "9cqw" }}>{tipo.toUpperCase()}</p>
      </div>
      <div className="h-[1.2%]" style={{ background: DOURADO }} />
      <div className="flex flex-1 flex-col items-center justify-center gap-[2cqw] px-[7%] py-[3%] text-center">
        <div className="aspect-[3/4] w-[34%] overflow-hidden rounded-md border-2" style={{ borderColor: DOURADO }}>
          <Foto url={foto} nome={nome} className="h-full w-full" />
        </div>
        <p className="line-clamp-2 font-bold uppercase leading-tight" style={{ fontSize: "7cqw" }}>{nome || "NOME DO VISITANTE"}</p>
        <p className="leading-tight opacity-80" style={{ fontSize: "5cqw" }}>{evento || "Visita à chácara"}</p>
        <p className="font-bold leading-none" style={{ fontSize: "12cqw", color: VERDE }}>Nº {numero || "001"}</p>
      </div>
      <p className="border-t px-[6%] py-[3%] text-center opacity-70" style={{ fontSize: "4cqw", borderColor: `${DOURADO}66` }}>
        {EMPREENDIMENTO} · devolva na portaria ao sair
      </p>
    </div>
  );
}

/** QR (data URL) do link — gerado no navegador */
function useQr(texto: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    if (!texto) { setUrl(null); return; }
    import("qrcode").then(Q => Q.toDataURL(texto, { margin: 0, width: 320, color: { dark: VERDE, light: "#FFFFFF" } })).then(u => { if (vivo) setUrl(u); }).catch(() => setUrl(null));
    return () => { vivo = false; };
  }, [texto]);
  return url;
}

/** Crachá do corretor (vertical, 54 × 86 mm): marca Romatec, foto, nome, função, CRECI, telefone e QR do WhatsApp dele */
function CrachaCorretor({ nome, funcao, creci, telefone, whatsapp, foto }: { nome: string; funcao: string; creci: string; telefone: string; whatsapp: string | null; foto: string | null }) {
  const qr = useQr(whatsapp ? `https://wa.me/${whatsapp}` : null);
  return (
    <div data-cracha-corretor className="relative mx-auto flex aspect-[54/86] w-full max-w-[260px] flex-col overflow-hidden rounded-xl shadow-xl shadow-black/40" style={{ background: "#0B0F0D", color: "#FFFFFF", containerType: "inline-size" } as any}>
      <div className="relative flex flex-col items-center px-[8%] pb-[5%] pt-[7%]" style={{ background: VERDE }}>
        <img src={brandAssets.rosa} alt="" aria-hidden className="pointer-events-none absolute -right-[18%] -top-[12%] w-[70%] opacity-[0.12]" />
        <img src={brandAssets.wordmark} alt="Romatec Consultoria Total" className="relative w-[78%] object-contain" />
      </div>
      <div className="h-[1.2%]" style={{ background: DOURADO }} />
      <div className="flex flex-1 flex-col items-center justify-center gap-[1.6cqw] px-[7%] py-[3%] text-center">
        <div className="aspect-[3/4] w-[40%] overflow-hidden rounded-lg border-2" style={{ borderColor: DOURADO }}>
          <Foto url={foto} nome={nome} className="h-full w-full" />
        </div>
        <p className="line-clamp-2 font-bold leading-tight [font-family:var(--rt-font-title)]" style={{ color: DOURADO, fontSize: "8cqw" }}>{nome || "Nome do Corretor"}</p>
        <p className="font-semibold uppercase tracking-[0.12em] opacity-90" style={{ fontSize: "4.4cqw" }}>{funcao}</p>
        {creci && <p className="rounded-full px-[4cqw] py-[0.8cqw] font-bold" style={{ background: `${DOURADO}26`, color: DOURADO, fontSize: "5.6cqw" }}>{creci}</p>}
      </div>
      <div className="flex items-center gap-[4cqw] border-t px-[7%] py-[4%]" style={{ borderColor: `${DOURADO}55` }}>
        {qr ? <img src={qr} alt="QR do WhatsApp" className="w-[30%] rounded bg-white p-[1.2cqw]" /> : <div className="flex aspect-square w-[30%] items-center justify-center rounded bg-white/90"><QrCode className="h-[70%] w-[70%]" style={{ color: VERDE }} /></div>}
        <div className="min-w-0 text-left leading-tight">
          <p className="opacity-70" style={{ fontSize: "3.8cqw" }}>Fale comigo no WhatsApp</p>
          <p className="font-bold" style={{ fontSize: "5cqw" }}>{telefone || "(99) 9 0000-0000"}</p>
          <p className="opacity-70" style={{ fontSize: "3.6cqw" }}>romateccrm.com</p>
        </div>
      </div>
    </div>
  );
}

/** Imprime o crachá no tamanho real (54 × 86 mm) numa janela só com ele; rascunho = tarja "sem validade" (corretor) */
function imprimirCracha(rascunho: boolean) {
  const el = document.querySelector("[data-cracha-corretor]") as HTMLElement | null;
  const w = window.open("", "_blank", "width=480,height=720");
  if (!el || !w) { toast.error("Não foi possível abrir a impressão (libere pop-ups para este site)"); return; }
  const estilos = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map(n => n.outerHTML).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Crachá do corretor</title>${estilos}
    <style>@page{size:54mm 86mm;margin:0}html,body{margin:0;background:#fff}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    [data-cracha-corretor]{width:54mm!important;max-width:none!important;border-radius:3mm!important;box-shadow:none!important}
    .tarja{position:fixed;left:0;top:0;width:54mm;height:86mm;display:flex;align-items:center;justify-content:center;pointer-events:none}
    .tarja span{transform:rotate(-58deg);white-space:nowrap;font:800 15pt Arial,sans-serif;color:rgba(192,38,31,.88);border:2.5pt solid rgba(192,38,31,.88);padding:1.5mm 3mm;background:rgba(255,255,255,.55)}</style>
    </head><body>${el.outerHTML}${rascunho ? '<div class="tarja"><span>RASCUNHO · SEM VALIDADE</span></div>' : ""}</body></html>`);
  w.document.close();
  const ir = () => { w.focus(); w.print(); };
  // Espera as imagens (logo, foto, QR) carregarem antes de imprimir
  const imgs = Array.from(w.document.images);
  Promise.all(imgs.map(i => (i.complete ? Promise.resolve() : new Promise(r => { i.onload = i.onerror = () => r(null); })))).then(() => setTimeout(ir, 200));
}

function EscolherFoto({ foto }: { foto: ReturnType<typeof useFotoLocal> }) {
  return (
    <div className="flex items-center gap-2">
      <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary">
        <Camera className="h-3.5 w-3.5" /> {foto.url ? "Trocar a foto" : "Escolher a foto"}
        <input type="file" accept="image/*" capture="user" className="hidden" onChange={e => { foto.escolher(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {foto.url && <button type="button" onClick={foto.limpar} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><X className="h-3 w-3" /> tirar</button>}
      <span className="text-[11px] text-muted-foreground">só na prévia — não é gravada</span>
    </div>
  );
}

export default function ModelosCarteirinha() {
  const [aba, setAba] = useState<"carteirinha" | "cracha" | "corretor">("carteirinha");
  // Crachá do corretor: começa com o cadastro de quem está logado (nunca o contato padrão do escritório)
  const { user } = useAuth();
  // Oficial (sem tarja) só para administrador, secretária e empreendedor; o corretor vê a prévia e baixa rascunho
  const oficial = ["admin", "secretario", "empreendedor"].includes(perfilDe(user as any) ?? "");
  const [cc, setCc] = useState({ nome: "", funcao: "Corretor(a) de imóveis", creci: "", telefone: "" });
  const [ccIniciado, setCcIniciado] = useState(false);
  useEffect(() => {
    const u = user as any;
    if (ccIniciado || !u?.name) return;
    const creci = u.creci ? `CRECI${u.creciUf ? `/${u.creciUf}` : ""} ${u.creci}` : "";
    setCc(c => ({ ...c, nome: String(u.name).split(/\s+/).slice(0, 3).join(" "), creci, telefone: u.telefone ? exibirTelefoneBR(String(u.telefone)) : "" }));
    setCcIniciado(true);
  }, [user, ccIniciado]);
  const whatsappDoCracha = (() => { const d = cc.telefone.replace(/\D/g, ""); return d.length >= 10 ? (d.startsWith("55") ? d : `55${d}`) : null; })();
  const [nome, setNome] = useState("");
  const [vinculo, setVinculo] = useState(VINCULOS[0]);
  const [unidade, setUnidade] = useState("");
  const [tipo, setTipo] = useState("Visitante");
  const [evento, setEvento] = useState("");
  const [numero, setNumero] = useState("");
  const foto = useFotoLocal();
  const [baixando, setBaixando] = useState(false);

  const baixarPdf = async () => {
    setBaixando(true);
    try {
      const q = new URLSearchParams({ nome, vinculo, unidade, formato: "a4" });
      const r = await fetch(`/api/carteirinhas/modelo.pdf?${q}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Falha ao gerar o modelo");
      window.open(URL.createObjectURL(await r.blob()), "_blank", "noopener");
    } catch (e: any) { toast.error(e.message); } finally { setBaixando(false); }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-[var(--rt-gold)]/40 bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <IdCard className="h-5 w-5 text-[var(--rt-gold)]" />
        <h2 className="flex-1 text-base font-semibold">Modelos para apresentar ao cliente
          {!oficial && <span className="ml-2 align-middle text-[11px] font-normal text-amber-300">prévia à vontade · baixar e imprimir saem como rascunho, sem validade</span>}
        </h2>
        <div role="tablist" className="flex gap-1 rounded-lg border border-border p-1">
          {([["carteirinha", "Carteirinha do condomínio"], ["cracha", "Crachá de visitante"], ["corretor", "Crachá do corretor"]] as const).map(([k, r]) => (
            <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
              className={`rounded-md px-3 py-1 text-xs ${aba === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{r}</button>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[320px_1fr]">
        {/* Campos: a prévia acompanha o que se digita */}
        {aba === "corretor" ? (
          <div className="space-y-2.5 rounded-xl border border-border p-3">
            <p className="text-xs text-muted-foreground">Já vem com os seus dados do cadastro — ajuste o que quiser antes de imprimir.</p>
            <label className="block space-y-1 text-xs text-muted-foreground">Nome no crachá
              <input value={cc.nome} onChange={e => setCc({ ...cc, nome: e.target.value })} maxLength={60} className={campo} />
            </label>
            <label className="block space-y-1 text-xs text-muted-foreground">Função
              <select value={cc.funcao} onChange={e => setCc({ ...cc, funcao: e.target.value })} className={campo}>
                {["Corretor(a) de imóveis", "Consultor(a) de vendas", "Secretária", "Gestor(a) comercial"].map(v => <option key={v}>{v}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-xs text-muted-foreground">CRECI
              <input value={cc.creci} onChange={e => setCc({ ...cc, creci: e.target.value })} maxLength={30} placeholder="CRECI/MA 0.000" className={campo} />
            </label>
            <label className="block space-y-1 text-xs text-muted-foreground">Telefone / WhatsApp
              <input value={cc.telefone} onChange={e => setCc({ ...cc, telefone: e.target.value })} maxLength={20} className={campo} />
            </label>
            <EscolherFoto foto={foto} />
            <Button size="sm" className="w-full" variant={oficial ? "default" : "outline"} onClick={() => imprimirCracha(!oficial)}>
              <Printer className="mr-1 h-4 w-4" /> {oficial ? "Imprimir no tamanho real (54 × 86 mm)" : "Imprimir rascunho (sem validade)"}
            </Button>
          </div>
        ) : (
        <div className="space-y-2.5 rounded-xl border border-border p-3">
          <p className="text-xs text-muted-foreground">Preencha para ver como fica — é só uma prévia.</p>
          <label className="block space-y-1 text-xs text-muted-foreground">Nome
            <input value={nome} onChange={e => setNome(e.target.value)} maxLength={80} placeholder={aba === "carteirinha" ? "Nome do titular" : "Nome do visitante"} className={campo} />
          </label>
          {aba === "carteirinha" ? (
            <>
              <label className="block space-y-1 text-xs text-muted-foreground">Vínculo
                <select value={vinculo} onChange={e => setVinculo(e.target.value)} className={campo}>{VINCULOS.map(v => <option key={v}>{v}</option>)}</select>
              </label>
              <label className="block space-y-1 text-xs text-muted-foreground">Chácara
                <input value={unidade} onChange={e => setUnidade(e.target.value)} maxLength={60} placeholder="Chácara A01 · Quadra A" className={campo} />
              </label>
            </>
          ) : (
            <>
              <label className="block space-y-1 text-xs text-muted-foreground">Tipo
                <select value={tipo} onChange={e => setTipo(e.target.value)} className={campo}>{["Visitante", "Convidado", "Prestador de serviço"].map(v => <option key={v}>{v}</option>)}</select>
              </label>
              <label className="block space-y-1 text-xs text-muted-foreground">Evento / motivo
                <input value={evento} onChange={e => setEvento(e.target.value)} maxLength={60} placeholder="Ex.: Aniversário na chácara B12 · 15/11" className={campo} />
              </label>
              <label className="block space-y-1 text-xs text-muted-foreground">Nº do crachá
                <input value={numero} onChange={e => setNumero(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="001" className={campo} />
              </label>
            </>
          )}
          <EscolherFoto foto={foto} />
          {aba === "carteirinha" && (
            <Button size="sm" variant="outline" className="w-full" disabled={baixando} onClick={baixarPdf}>
              {baixando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />} {oficial ? "Baixar modelo em PDF (sem foto)" : "Baixar rascunho em PDF (sem validade)"}
            </Button>
          )}
        </div>
        )}

        {/* Prévia */}
        {aba === "corretor" ? (
          <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,260px)_1fr]">
            <CrachaCorretor nome={cc.nome} funcao={cc.funcao} creci={cc.creci} telefone={cc.telefone} whatsapp={whatsappDoCracha} foto={foto.url ?? ((user as any)?.fotoUrl ?? null)} />
            <p className="text-[11px] text-muted-foreground">Crachá de 54 × 86 mm para usar no plantão de vendas e nas visitas. O QR abre o WhatsApp do corretor: o cliente aponta a câmera e já fala com ele. A foto vem do seu cadastro (Meu cadastro); a escolhida aqui vale só para esta impressão.</p>
          </div>
        ) : aba === "carteirinha" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1"><p className="text-xs text-muted-foreground">Frente</p><CarteirinhaFrente nome={nome} vinculo={vinculo} unidade={unidade} foto={foto.url} /></div>
            <div className="space-y-1"><p className="text-xs text-muted-foreground">Verso</p><CarteirinhaVerso /></div>
            <p className="text-[11px] text-muted-foreground sm:col-span-2">Cartão de 85,6 × 54 mm (tamanho de cartão de banco). Titular e cônjuge recebem quando o contrato é assinado; cada dependente quando o cadastro dele fica completo, com a foto. O QR do verso confirma na portaria que a carteirinha é verdadeira.</p>
          </div>
        ) : (
          <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,260px)_1fr]">
            <Cracha nome={nome} tipo={tipo} evento={evento} numero={numero} foto={foto.url} />
            <p className="text-[11px] text-muted-foreground">Crachá de 54 × 86 mm entregue na portaria a visitantes, convidados de eventos e prestadores de serviço, numerado e devolvido na saída.</p>
          </div>
        )}
      </div>
    </section>
  );
}
