import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Camera, FileDown, IdCard, Loader2, QrCode, X } from "lucide-react";

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
function CarteirinhaFrente({ nome, vinculo, unidade, foto }: { nome: string; vinculo: string; unidade: string; foto: string | null }) {
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
function CarteirinhaVerso() {
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
function Cracha({ nome, tipo, evento, numero, foto }: { nome: string; tipo: string; evento: string; numero: string; foto: string | null }) {
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
  const [aba, setAba] = useState<"carteirinha" | "cracha">("carteirinha");
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
        <h2 className="flex-1 text-base font-semibold">Modelos para apresentar ao cliente</h2>
        <div role="tablist" className="flex gap-1 rounded-lg border border-border p-1">
          {([["carteirinha", "Carteirinha do condomínio"], ["cracha", "Crachá de visitante"]] as const).map(([k, r]) => (
            <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
              className={`rounded-md px-3 py-1 text-xs ${aba === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{r}</button>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[320px_1fr]">
        {/* Campos: a prévia acompanha o que se digita */}
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
              {baixando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileDown className="mr-1 h-4 w-4" />} Baixar modelo em PDF (sem foto)
            </Button>
          )}
        </div>

        {/* Prévia */}
        {aba === "carteirinha" ? (
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
