import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Versão do aviso: ao mudar o texto, sobe a versão e o aviso volta a aparecer para todos */
const VERSAO = "v1";
const chave = (usuarioId: number) => `juridico:aviso-validacao:${VERSAO}:${usuarioId}`;

const jaViu = (usuarioId: number) => {
  try { return localStorage.getItem(chave(usuarioId)) === "1"; } catch { return false; }
};

/** Corpo do aviso (também usado ao reabrir pela aba Assinaturas) */
export function TextoValidacao() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
      <p>
        As notificações, requerimentos, atas e ofícios do empreendimento são assinados aqui no Portal Jurídico com
        <b> certificado digital ICP-Brasil</b>. Veja como validar as assinaturas.
      </p>
      <section>
        <h4 className="font-semibold text-[#E8B931]">1. Onde ficam os documentos</h4>
        <p className="text-muted-foreground">Na aba <b>Assinaturas</b>, cada documento mostra quem assinou, a data e o link <b>“validar no ITI”</b>. No PDF, cada assinatura aparece como um <b>selo verde em cima do traço</b> de quem assinou.</p>
      </section>
      <section>
        <h4 className="font-semibold text-[#E8B931]">2. Como validar (validador oficial do ITI, gratuito)</h4>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Baixe o PDF em <b>PDF › Baixar</b>. Use sempre o arquivo original baixado do portal: imprimir ou “salvar como PDF” cria uma cópia sem a assinatura.</li>
          <li>Acesse <a className="text-ok-300 underline" href="https://validar.iti.gov.br/" target="_blank" rel="noopener noreferrer">validar.iti.gov.br</a>, aceite os termos e envie o arquivo.</li>
          <li>O relatório mostra cada signatário (nome e CPF), o certificado ICP-Brasil, a data e hora e se o documento está íntegro. Ele pode ser baixado em PDF para instruir petições e protocolos.</li>
        </ul>
      </section>
      <section>
        <h4 className="font-semibold text-[#E8B931]">3. No Adobe Acrobat / Reader</h4>
        <p className="text-muted-foreground">O aviso “Pelo menos uma assinatura exige validação” <b>não é erro</b>: o computador só ainda não confia na raiz ICP-Brasil. Uma vez em cada computador, baixe as cadeias <b>AC Raiz ICP-Brasil</b> no site do ITI (Repositório) e importe no Adobe em <b>Preferências › Assinaturas › Identidades e certificados confiáveis › Mais › Importar</b>, marcando <b>“Usar este certificado como raiz confiável”</b>.</p>
      </section>
      <section>
        <h4 className="font-semibold text-[#E8B931]">4. Validade jurídica</h4>
        <p className="text-muted-foreground">O selo é a parte visível; a validade está na assinatura embutida no arquivo, com presunção de veracidade em relação aos signatários (MP n.º 2.200-2/2001, art. 10, § 1º; Lei n.º 14.063/2020). Para protocolo e juntada, use sempre o PDF original.</p>
      </section>
      <p className="text-muted-foreground">Para assinar com o seu certificado, guarde-o uma vez na aba <b>Certificado</b>. A senha nunca é guardada: ela é pedida a cada assinatura.</p>
    </div>
  );
}

/** Aviso exibido ao advogado depois do login, até ele tocar em "Entendi" (lembrado neste aparelho) */
export function AvisoValidacao({ usuarioId, forcar, onFechar }: { usuarioId?: number | null; forcar?: boolean; onFechar?: () => void }) {
  const [aberto, setAberto] = useState(() => !!usuarioId && !jaViu(usuarioId));
  const visivel = !!forcar || aberto;
  const fechar = (lembrar: boolean) => {
    if (lembrar && usuarioId) { try { localStorage.setItem(chave(usuarioId), "1"); } catch { /* sem armazenamento: volta a aparecer */ } }
    setAberto(false);
    onFechar?.();
  };
  if (!usuarioId && !forcar) return null;
  return (
    <Dialog open={visivel} onOpenChange={o => { if (!o) fechar(false); }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#E8B931]"><ShieldCheck className="h-5 w-5" /> Assinaturas digitais: como validar</DialogTitle>
        </DialogHeader>
        <TextoValidacao />
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          {!forcar && <Button variant="outline" onClick={() => fechar(false)}>Ver depois</Button>}
          <Button className="bg-[#E8B931] font-semibold text-black hover:bg-[#F6D56B]" onClick={() => fechar(true)}>Entendi</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
