import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2, Send } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { maskPhone } from "@shared/masks";

const campo = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";

/** Configurações → Enviar arquivo pelo WhatsApp do sistema (só o administrador) */
export default function EnviarArquivoWhatsapp() {
  const { data: equipe } = trpc.equipe.list.useQuery();
  const pessoas = (equipe?.pessoas ?? []).filter((p: any) => p.telefone);
  const [telefone, setTelefone] = useState("");
  const [legenda, setLegenda] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const digitos = telefone.replace(/\D/g, "");

  const enviar = async () => {
    if (!arquivo) return;
    if (!confirm(`Enviar "${arquivo.name}" pelo WhatsApp do sistema para ${maskPhone(digitos.replace(/^55(?=\d{10,11}$)/, ""))}?`)) return;
    setEnviando(true);
    try {
      const r = await fetch("/api/whatsapp/enviar-arquivo", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/octet-stream", "x-telefone": encodeURIComponent(digitos), "x-nome-arquivo": encodeURIComponent(arquivo.name), "x-legenda": encodeURIComponent(legenda) },
        body: arquivo,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Não foi possível enviar");
      toast.success(`"${j.nomeArquivo}" enviado pelo WhatsApp`);
      setArquivo(null); setLegenda("");
      if (input.current) input.current.value = "";
    } catch (e: any) { toast.error(e?.message || "Não foi possível enviar"); } finally { setEnviando(false); }
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><FileUp className="h-5 w-5 text-primary" /> Enviar arquivo pelo WhatsApp</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">Manda um PDF, imagem, Word ou Excel (até 15 MB) pelo WhatsApp do sistema, com um texto. Só o administrador.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">Para (escolher da equipe)
            <select className={campo} value="" onChange={e => e.target.value && setTelefone(maskPhone(e.target.value))}>
              <option value="">— ou digite o número ao lado —</option>
              {pessoas.map((p: any) => <option key={p.id} value={p.telefone}>{p.nome} · {maskPhone(p.telefone)}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">WhatsApp
            <input className={campo} value={telefone} onChange={e => setTelefone(maskPhone(e.target.value))} inputMode="tel" placeholder="(99) 9 9999-9999" />
          </label>
        </div>
        <label className="block text-xs text-muted-foreground">Texto (opcional)
          <textarea className="w-full rounded-md border border-border bg-background p-2 text-sm" rows={3} maxLength={1000} value={legenda} onChange={e => setLegenda(e.target.value)} placeholder="Olá! Segue o arquivo…" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp,.docx,.xlsx" onChange={e => setArquivo(e.target.files?.[0] ?? null)} />
          <Button variant="outline" onClick={() => input.current?.click()}><FileUp className="mr-1 h-4 w-4" /> {arquivo ? "Trocar arquivo" : "Escolher arquivo"}</Button>
          {arquivo && <span className="text-sm">{arquivo.name} <span className="text-xs text-muted-foreground">({Math.max(1, Math.round(arquivo.size / 1024))} KB)</span></span>}
        </div>
        <Button disabled={!arquivo || digitos.length < 10 || enviando} onClick={enviar}>
          {enviando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} Enviar pelo WhatsApp
        </Button>
      </CardContent>
    </Card>
  );
}
