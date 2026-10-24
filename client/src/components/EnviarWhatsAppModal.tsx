import { useState, type ReactNode } from "react";
import { Send } from "lucide-react";
import { normalizePhoneBR, mascaraTelefoneBR, exibirTelefoneBR } from "@shared/telefone";
import { InfinityMini } from "@/brand";

export const btnWhats = (cor: string, bg: string, borda: string) => ({
  padding: "7px 14px", borderRadius: "8px", background: bg, border: `1px solid ${borda}`, color: cor,
  fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px",
});

/**
 * Modal de envio pelo WhatsApp: o usuário digita o número de destino (José, colaborador, corretor, cliente).
 * Máscara e validação BR (shared/telefone); o número do José é só sugestão. Nada sai sem o clique em Enviar.
 */
export default function EnviarWhatsAppModal({ titulo, descricao, sugestao, enviando, onFechar, onEnviar, children }: {
  titulo: string;
  descricao: ReactNode;
  /** Número sugerido (55 + DDD + 9 + 8), usado no exemplo e no botão "Usar o número do José" */
  sugestao?: string;
  enviando: boolean;
  onFechar: () => void;
  /** Recebe o número já normalizado (55 + DDD + 9 + 8) */
  onEnviar: (destino: string) => void;
  /** Opções extras (ex.: formato) entre o número e os botões */
  children?: ReactNode;
}) {
  const [telefone, setTelefone] = useState("");
  const destino = normalizePhoneBR(telefone);
  const enviar = () => { if (destino && !enviando) onEnviar(destino); };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}
      onClick={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="whats-titulo" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "440px" }}>
        <h3 id="whats-titulo" style={{ fontSize: "15px", fontWeight: 600, color: "#d8f0dc", margin: "0 0 4px" }}>{titulo}</h3>
        <p style={{ fontSize: "11px", color: "#5a8a65", margin: "0 0 14px" }}>{descricao}</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
          <label htmlFor="whats-destino" style={{ fontSize: "10px", color: "#5a8a65", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 700 }}>Número de destino (WhatsApp, com DDD)</label>
          {sugestao && (
            <button type="button" onClick={() => setTelefone(mascaraTelefoneBR(sugestao))} style={{ background: "none", border: "none", color: "#3ec87a", fontSize: "11px", fontWeight: 600, cursor: "pointer", padding: 0 }}>
              Usar o número do José
            </button>
          )}
        </div>
        <input id="whats-destino" autoFocus type="tel" inputMode="tel" autoComplete="off" value={telefone}
          onChange={e => setTelefone(mascaraTelefoneBR(e.target.value))}
          onKeyDown={e => { if (e.key === "Enter") enviar(); }}
          placeholder={sugestao ? `Ex.: ${mascaraTelefoneBR(sugestao.slice(2))}` : "(99) 99999-9999"}
          style={{
            width: "100%", padding: "9px 12px", margin: "4px 0 4px", background: "var(--background)",
            border: `1px solid ${telefone && !destino ? "rgba(239,68,68,0.5)" : "var(--border)"}`,
            borderRadius: "8px", color: "#c8f0d0", fontSize: "14px", outline: "none", boxSizing: "border-box", letterSpacing: "0.02em",
          }} />
        <p style={{ fontSize: "11px", margin: "0 0 12px", minHeight: "16px", color: destino ? "#3ec87a" : "#e07070" }}>
          {destino ? `✓ Vai para ${exibirTelefoneBR(destino)}` : telefone ? "Número incompleto ou inválido — celular com DDD (o +55 é opcional)" : ""}
        </p>
        {children}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button onClick={onFechar} style={{ padding: "8px 16px", borderRadius: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#6a8a70", cursor: "pointer" }}>
            Cancelar
          </button>
          <button disabled={!destino || enviando} onClick={enviar} aria-busy={enviando} style={{
            ...btnWhats("#25d366", "rgba(37,211,102,0.15)", "rgba(37,211,102,0.3)"), padding: "8px 20px",
            opacity: !destino ? 0.5 : 1, cursor: enviando ? "progress" : undefined,
          }}>
            {enviando ? <><InfinityMini width={26} /> Enviando para o WhatsApp…</> : <><Send size={13} /> Enviar</>}
          </button>
        </div>
      </div>
    </div>
  );
}
