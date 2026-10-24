import { useLayoutEffect, useRef } from "react";
import { cursorDepoisDaMascara } from "@shared/masks";

export const sel = "h-10 px-3 rounded-md border border-border bg-secondary/30 text-foreground text-sm w-full";
const inp = "h-10 px-3 rounded-md border bg-secondary/30 text-foreground text-sm w-full outline-none focus:ring-2 focus:ring-primary/40";

/** Rótulo + campo + mensagem de erro (borda vermelha) */
export function Campo({ rotulo, erro, children, className = "" }: { rotulo: string; erro?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="text-muted-foreground text-xs">{rotulo}</span>
      {children}
      {erro && <span className="text-[11px] text-red-400">{erro}</span>}
    </label>
  );
}

export const classeCampo = (erro?: string) => `${inp} ${erro ? "border-red-500" : "border-border"}`;

/**
 * Input com máscara (CPF, RG, telefone, CEP): mostra formatado, devolve o texto formatado e
 * mantém o cursor no lugar quando se edita no meio (cursorDepoisDaMascara).
 */
export function InputMascara({ valor, mascara, onMudar, erro, ...resto }: {
  valor: string; mascara: (v: string) => string; onMudar: (v: string) => void; erro?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const ref = useRef<HTMLInputElement>(null);
  const cursor = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (cursor.current != null && ref.current && document.activeElement === ref.current) ref.current.setSelectionRange(cursor.current, cursor.current);
    cursor.current = null;
  });
  return (
    <input ref={ref} {...resto} value={mascara(valor)} className={classeCampo(erro)}
      onChange={e => {
        const digitado = e.target.value;
        const m = mascara(digitado);
        cursor.current = cursorDepoisDaMascara(digitado, e.target.selectionStart ?? digitado.length, m);
        onMudar(m);
      }} />
  );
}

/** Interruptor simples (toggle) */
export function Interruptor({ ligado, onMudar, rotulo, disabled, title }: { ligado: boolean; onMudar: (v: boolean) => void; rotulo: string; disabled?: boolean; title?: string }) {
  return (
    <label className={`flex items-center gap-2 text-xs ${disabled ? "opacity-50" : "cursor-pointer"}`} title={title}>
      <button type="button" role="switch" aria-checked={ligado} disabled={disabled} onClick={() => onMudar(!ligado)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${ligado ? "bg-emerald-600" : "bg-secondary border border-border"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${ligado ? "left-[18px]" : "left-0.5"}`} />
      </button>
      {rotulo}
    </label>
  );
}

/** Data AAAA-MM-DD → dd/mm/aaaa */
export const dataBr = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
