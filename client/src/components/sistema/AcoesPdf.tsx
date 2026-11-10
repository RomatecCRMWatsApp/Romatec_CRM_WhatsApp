import { useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, ExternalLink, Loader2, MessageCircle, Send, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe } from "@shared/equipe";
import { maskPhone } from "@shared/masks";

interface Props {
  /** PDF para quem está logado (abre no navegador; com ?baixar=1, baixa) */
  url: string;
  /** Nome do arquivo ao baixar ou compartilhar */
  nomeArquivo: string;
  /** Gera o link público assinado (sem login) para mandar a quem não tem acesso ao sistema; devolve o caminho */
  linkPublico: () => Promise<{ caminho: string; validadeDias: number }>;
  /** Texto que acompanha o link no WhatsApp */
  mensagem: string;
}

const comBaixar = (u: string) => `${u}${u.includes("?") ? "&" : "?"}baixar=1`;

/**
 * Ações de um PDF: abrir, baixar, enviar pelo WhatsApp (o seu, com o link), copiar o link, compartilhar o arquivo
 * (celular: escolhe WhatsApp, e-mail…) e, para o administrador, mandar o arquivo pelo WhatsApp do sistema.
 */
export function AcoesPdf({ url, nomeArquivo, linkPublico, mensagem }: Props) {
  const { user } = useAuth();
  const admin = perfilDe(user as any) === "admin";
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [sistema, setSistema] = useState(false);
  const [telefone, setTelefone] = useState("");
  const podeCompartilharArquivo = typeof navigator !== "undefined" && "canShare" in navigator;

  const link = async () => {
    const r = await linkPublico();
    return { url: new URL(r.caminho, window.location.origin).toString(), dias: r.validadeDias };
  };
  // O PDF gerado fica guardado: se o celular recusar o compartilhamento depois da espera, o segundo toque é imediato
  const cache = useRef<{ url: string; f: File } | null>(null);
  const arquivo = async () => {
    if (cache.current?.url === url) return cache.current.f;
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) throw new Error((await r.text().catch(() => "")) || "Não foi possível gerar o PDF");
    const f = new File([await r.blob()], nomeArquivo, { type: "application/pdf" });
    cache.current = { url, f };
    return f;
  };
  const rodar = (qual: string, f: () => Promise<void>) => async () => {
    setOcupado(qual);
    try { await f(); } catch (e: any) {
      if (e?.name === "AbortError") return;
      toast.error(e?.name === "NotAllowedError" ? "O PDF ficou pronto: toque em Compartilhar de novo." : e?.message || "Não foi possível concluir");
    } finally { setOcupado(null); }
  };

  const whatsapp = rodar("whats", async () => {
    // Abre a janela antes do await: o navegador do celular bloqueia pop-up aberto depois de uma espera
    const janela = window.open("", "_blank");
    const l = await link();
    const destino = `https://wa.me/?text=${encodeURIComponent(`${mensagem}\n${l.url}\n(link válido por ${l.dias} dias)`)}`;
    if (janela) janela.location.href = destino; else window.location.href = destino;
  });
  const copiar = rodar("copiar", async () => {
    const l = await link();
    await navigator.clipboard.writeText(l.url);
    toast.success(`Link copiado (válido por ${l.dias} dias)`);
  });
  const compartilhar = rodar("compartilhar", async () => {
    const f = await arquivo();
    if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: nomeArquivo, text: mensagem });
    else {
      const l = await link();
      await navigator.share({ title: nomeArquivo, text: mensagem, url: l.url });
    }
  });
  const enviarSistema = rodar("sistema", async () => {
    const digitos = telefone.replace(/\D/g, "");
    if (digitos.length < 10) throw new Error("Informe o WhatsApp com DDD");
    const f = await arquivo();
    const r = await fetch("/api/whatsapp/enviar-arquivo", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/octet-stream", "x-telefone": encodeURIComponent(digitos), "x-nome-arquivo": encodeURIComponent(nomeArquivo), "x-legenda": encodeURIComponent(mensagem) },
      body: f,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || "Não foi possível enviar");
    toast.success(`PDF enviado pelo WhatsApp do sistema para ${maskPhone(digitos)}`);
    setSistema(false); setTelefone("");
  });

  const icone = (qual: string, I: typeof Download) => (ocupado === qual ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <I className="mr-1 h-3.5 w-3.5" />);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ações do PDF">
        <Button asChild size="sm" variant="outline"><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-1 h-3.5 w-3.5" /> Abrir</a></Button>
        <Button asChild size="sm" variant="outline"><a href={comBaixar(url)} download={nomeArquivo}><Download className="mr-1 h-3.5 w-3.5" /> Baixar</a></Button>
        <Button size="sm" variant="outline" disabled={!!ocupado} onClick={whatsapp}>{icone("whats", MessageCircle)} WhatsApp</Button>
        <Button size="sm" variant="outline" disabled={!!ocupado} onClick={copiar}>{icone("copiar", Copy)} Copiar link</Button>
        {podeCompartilharArquivo && <Button size="sm" variant="outline" disabled={!!ocupado} onClick={compartilhar}>{icone("compartilhar", Share2)} Compartilhar</Button>}
        {admin && <Button size="sm" variant="outline" disabled={!!ocupado} onClick={() => setSistema(v => !v)} aria-expanded={sistema}><Send className="mr-1 h-3.5 w-3.5" /> WhatsApp do sistema</Button>}
      </div>
      {admin && sistema && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
          <label className="text-xs text-muted-foreground">Enviar o PDF para
            <input className="ml-2 h-8 w-44 rounded-md border border-border bg-background px-2 text-sm text-foreground" value={telefone}
              onChange={e => setTelefone(maskPhone(e.target.value))} inputMode="tel" placeholder="(99) 9 9999-9999" aria-label="WhatsApp de quem recebe" />
          </label>
          <Button size="sm" disabled={!!ocupado} onClick={enviarSistema}>{icone("sistema", Send)} Enviar</Button>
        </div>
      )}
    </div>
  );
}
