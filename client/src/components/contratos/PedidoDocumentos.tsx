import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, MessageCircle } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { textoPedidoDocumentos } from "@shared/pedidoDocumentos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Contratos › Pedir documentos: texto pronto para mandar ao cliente pelo WhatsApp antes de montar o contrato */
export default function PedidoDocumentos() {
  const { user } = useAuth();
  const [nome, setNome] = useState("");
  const [chacara, setChacara] = useState("");
  const [fone, setFone] = useState("");
  const corretor = String((user as any)?.name ?? "").trim();
  const base = useMemo(() => textoPedidoDocumentos({ nome, chacara, corretor }), [nome, chacara, corretor]);
  const [editado, setEditado] = useState<string | null>(null);
  const texto = editado ?? base;
  const digitos = fone.replace(/\D/g, "");
  const wa = digitos.length >= 10 ? `https://wa.me/${digitos.startsWith("55") ? digitos : `55${digitos}`}?text=${encodeURIComponent(texto)}` : null;

  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); toast.success("Texto copiado. É só colar no WhatsApp do cliente."); }
    catch { window.prompt("Copie o texto:", texto); }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Mande este texto ao cliente para pedir os documentos e dados do contrato. Preencha o nome e a chácara (opcional) e copie, ou abra direto no WhatsApp.</p>
      <div className="grid gap-2 md:grid-cols-3">
        <Input id="pedido-nome" value={nome} onChange={e => { setNome(e.target.value); setEditado(null); }} placeholder="Nome do cliente (opcional)" />
        <Input id="pedido-chacara" value={chacara} onChange={e => { setChacara(e.target.value); setEditado(null); }} placeholder="Chácara, ex.: C05 (opcional)" maxLength={10} />
        <Input id="pedido-fone" value={fone} onChange={e => setFone(e.target.value)} placeholder="WhatsApp do cliente (opcional)" inputMode="tel" />
      </div>
      <textarea id="pedido-texto" value={texto} onChange={e => setEditado(e.target.value)} rows={24}
        className="w-full rounded-md border border-border bg-background p-3 text-sm" />
      <div className="flex flex-wrap gap-2">
        <Button onClick={copiar}><Copy className="mr-1 h-4 w-4" /> Copiar texto</Button>
        {wa && <Button variant="outline" asChild><a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="mr-1 h-4 w-4" /> Abrir no WhatsApp</a></Button>}
        {editado !== null && <Button variant="ghost" onClick={() => setEditado(null)}>Voltar ao texto padrão</Button>}
      </div>
    </div>
  );
}
