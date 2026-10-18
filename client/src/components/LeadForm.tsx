import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { origemDaVisita, utmDaVisita } from "@/lib/origemVisita";

export type Utm = { source?: string; medium?: string; campaign?: string; content?: string };

/** UTMs da URL atual ou da entrada no site (links da bio e anúncios levam utm_source=instagram etc.) */
export function readUtm(): Utm | undefined {
  return utmDaVisita() ?? undefined;
}

/**
 * Formulário curto de captação: grava o lead no CRM (/api/public/lead)
 * e o bot manda a 1ª mensagem no WhatsApp.
 */
export default function LeadForm({ propertyId, denomination, utm, title }: {
  propertyId?: number;
  denomination?: string;
  utm?: Utm;
  title?: string;
}) {
  const [nome, setNome] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      setStatus("error");
      setError("Marque a autorização de contato para continuar.");
      return;
    }
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/public/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, phone, propertyId, consent, utm: utm ?? readUtm(), origemVisita: origemDaVisita(), website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Não foi possível enviar.");
      setStatus("done");
    } catch (err: any) {
      setStatus("error");
      setError(err?.message || "Não foi possível enviar. Fale pelo WhatsApp.");
    }
  };

  if (status === "done") {
    return (
      <div className="glass-card p-6 mb-6 text-center">
        <p className="text-3xl mb-2">✅</p>
        <h3 className="text-lg font-bold text-foreground">Recebemos seu interesse!</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Em instantes você recebe uma mensagem no WhatsApp com valores e condições
          {denomination ? <> do <b>{denomination}</b></> : " dos nossos lotes e chácaras"}.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="glass-card p-6 mb-6">
      <div className="text-center mb-4">
        <h3 className="text-lg font-bold text-foreground">{title || "📩 Receba valores e condições no WhatsApp"}</h3>
        <p className="text-sm text-muted-foreground mt-1">Preencha e a gente te chama em instantes.</p>
      </div>
      <div className="flex flex-col gap-3">
        <input
          type="text" required autoComplete="name" placeholder="Seu nome"
          value={nome} onChange={e => setNome(e.target.value)} maxLength={120}
          className="w-full px-4 py-3 rounded-xl bg-secondary/30 border border-border/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald"
        />
        <input
          type="tel" required autoComplete="tel" inputMode="tel" placeholder="WhatsApp com DDD — (99) 9 9999-9999"
          value={phone} onChange={e => setPhone(e.target.value)} maxLength={25}
          className="w-full px-4 py-3 rounded-xl bg-secondary/30 border border-border/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald"
        />
        {/* Honeypot: escondido de pessoas, robôs preenchem */}
        <input
          type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
          value={website} onChange={e => setWebsite(e.target.value)}
          style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
        />
        <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 accent-emerald-500" />
          <span>Autorizo a Romatec a entrar em contato pelo WhatsApp. Posso pedir para parar a qualquer momento respondendo "PARAR".</span>
        </label>
        {status === "error" && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={status === "sending"} className="btn-premium py-3.5 rounded-xl flex items-center justify-center gap-2 text-base disabled:opacity-60">
          <MessageCircle className="h-5 w-5" /> {status === "sending" ? "Enviando..." : "Quero receber no WhatsApp"}
        </button>
      </div>
    </form>
  );
}
