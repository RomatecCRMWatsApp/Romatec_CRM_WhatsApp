import { toast } from "sonner";
import { Copy, Eye, ExternalLink, FileText, IdCard, Link2, MessageCircle, Share2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCartaoVendas } from "@/lib/cartaoVendas";
import { comAssinatura } from "@shared/cartaoVendas";
import { DOCUMENTOS_CLIENTE, documentoCliente, linkDocumento, linkIndiceDocumentos, type DocumentoCliente } from "@shared/documentosCliente";

/**
 * Contratos › aba "Links para o cliente": contrato, intermediação, checklist de restrições (Diretrizes), Estatuto, anexos e modelos de carteirinha e crachá com link público só
 * de leitura (/documentos/:emp/:doc — sem copiar, baixar ou editar). O link e o texto saem com o ?c=, o nome, o CRECI
 * e o WhatsApp de quem compartilha.
 */

const EMP = "bom-jardims";
const copiar = async (texto: string, rotulo: string) => {
  try { await navigator.clipboard.writeText(texto); toast.success(`${rotulo} copiado`); } catch { window.prompt("Copie:", texto); }
};
const compartilhar = async (texto: string) => {
  if ((navigator as any).share) { try { await navigator.share({ text: texto }); } catch { /* cancelou */ } return; }
  copiar(texto, "Texto");
};

function Acoes({ link, texto }: { link: string; texto: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" asChild>
        <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer"><MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Enviar no WhatsApp</a>
      </Button>
      <Button size="sm" variant="outline" onClick={() => copiar(link, "Link")}><Link2 className="mr-1.5 h-3.5 w-3.5" /> Copiar link</Button>
      <Button size="sm" variant="outline" onClick={() => copiar(texto, "Texto com o link")}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar texto</Button>
      <Button size="sm" variant="outline" onClick={() => compartilhar(texto)}><Share2 className="mr-1.5 h-3.5 w-3.5" /> Compartilhar</Button>
      <Button size="sm" variant="ghost" asChild>
        <a href={link} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Ver como o cliente</a>
      </Button>
    </div>
  );
}

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
type Leituras = { total: number; ultima: string | null } | undefined;

function CardDocumento({ d, cartao, leituras }: { d: DocumentoCliente; cartao: ReturnType<typeof useCartaoVendas>; leituras: Leituras }) {
  const link = linkDocumento(window.location.origin, EMP, d.slug, cartao.ref);
  const texto = comAssinatura(d.textoWhatsapp.replace("{link}", link), cartao);
  return (
    <Card className="border-border bg-card">
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-900/60 text-amber-300">
            {d.forma === "cartao" ? <IdCard className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{d.titulo}</p>
            <p className="text-sm text-muted-foreground">{d.subtitulo}</p>
            {d.forma === "pdf" && (
              <p className="mt-1 flex items-center gap-1 text-xs text-emerald-300">
                <Eye className="h-3.5 w-3.5" /> {leituras?.total ? `Aberto ${leituras.total}× · último ${quando(leituras.ultima!)}` : "Ainda não aberto"}
              </p>
            )}
          </div>
        </div>
        <a href={link} target="_blank" rel="noreferrer" className="block break-all rounded-md border border-border bg-secondary/30 px-2 py-1.5 font-mono text-xs text-emerald-300">{link}</a>
        <Acoes link={link} texto={texto} />
      </CardContent>
    </Card>
  );
}

export default function LinksDocumentos() {
  const cartao = useCartaoVendas();
  const { data: rastreio } = trpc.linksDivulgacao.leiturasDocumentos.useQuery(undefined, { refetchInterval: 60_000 });
  const indice = linkIndiceDocumentos(window.location.origin, EMP, cartao.ref);
  const textoIndice = comAssinatura(`📂 *Documentos do Condomínio de Chácaras Bom Jardims*\n\nContrato de compra e venda, contrato de intermediação, Estatuto, checklist de restrições, tarifa da água e modelos de carteirinha e crachá — tudo para leitura:\n${indice}`, cartao);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Links só de leitura (sem copiar, baixar ou editar) — saem com o seu código, nome, CRECI e WhatsApp.</p>
        <Card className="border-amber-300/50 bg-card">
          <CardContent className="space-y-3 py-4">
            <div>
              <p className="font-semibold">Todos os documentos — Bom Jardims</p>
              <p className="text-sm text-muted-foreground">Uma página com a lista completa; o cliente escolhe o que quer ler.</p>
            </div>
            <a href={indice} target="_blank" rel="noreferrer" className="block break-all rounded-md border border-border bg-secondary/30 px-2 py-1.5 font-mono text-xs text-emerald-300">{indice}</a>
            <Acoes link={indice} texto={textoIndice} />
          </CardContent>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          {DOCUMENTOS_CLIENTE.map(d => <CardDocumento key={d.slug} d={d} cartao={cartao} leituras={rastreio?.porDoc[d.slug]} />)}
        </div>
        {!!rastreio?.ultimas.length && (
          <Card className="border-border bg-card">
            <CardContent className="py-4">
              <p className="mb-2 font-semibold">Últimas aberturas {rastreio.escritorio ? "(todos os links)" : "dos seus links"}</p>
              <div className="divide-y divide-border text-sm">
                {rastreio.ultimas.map((u, i) => (
                  <div key={i} className="flex flex-wrap justify-between gap-x-3 py-1.5">
                    <span>{documentoCliente(u.doc)?.titulo ?? u.doc}</span>
                    <span className="text-muted-foreground">{rastreio.escritorio ? `${u.corretor}${u.codigo ? ` · cód. ${u.codigo}` : ""} · ` : ""}{quando(u.em)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        <p className="text-xs text-muted-foreground">
          Rastreio: cada página sai carimbada com "Enviado por" (nome, CRECI, código do link e data) e cada abertura fica registrada — um print que vazar mostra de qual link saiu.
        </p>
        <p className="text-xs text-muted-foreground">
          O contrato e os anexos aparecem com o cliente de exemplo e a chácara A01 (tarja "somente leitura"). O cliente lê as páginas como imagem: não há texto para copiar nem arquivo para baixar.
        </p>
    </div>
  );
}
