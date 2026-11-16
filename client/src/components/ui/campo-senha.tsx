import { Eye, EyeOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Olhinho para ver a senha digitada. Usado em todo campo de senha do sistema:
 * o <Input type="password"> do shadcn já vem com ele, e os campos nativos usam <SenhaNativa>.
 */

// Classes de posição/tamanho vão para o envolto, para o olho ficar dentro do campo e não na borda da coluna
const LAYOUT = /^-?(m[trblxy]?-|w-|max-w-|min-w-|flex-|basis-|self-|col-span-|row-span-|order-|grow|shrink)|^(block|inline-block|inline-flex|flex)$/;

export function separarLayout(className?: string): { envolto: string; campo: string } {
  const envolto: string[] = [];
  const campo: string[] = [];
  for (const c of (className ?? "").split(/\s+/).filter(Boolean)) {
    const base = c.slice(c.lastIndexOf(":") + 1);
    (LAYOUT.test(base) ? envolto : campo).push(c);
  }
  return { envolto: envolto.join(" "), campo: campo.join(" ") };
}

export function ComOlho({ className, children }: { className?: string; children: (tipo: "password" | "text", classeCampo: string) => ReactNode }) {
  const [ver, setVer] = useState(false);
  const { envolto, campo } = separarLayout(className);
  return (
    <div className={cn("relative w-full", envolto)}>
      {children(ver ? "text" : "password", cn(campo, "w-full pr-10"))}
      <button
        type="button"
        onClick={() => setVer(v => !v)}
        aria-label={ver ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={ver}
        title={ver ? "Ocultar senha" : "Mostrar senha"}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {ver ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}

/** Campo de senha nativo (sem o estilo do shadcn) com o olhinho */
export function SenhaNativa({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return <ComOlho className={className}>{(tipo, classe) => <input {...props} type={tipo} className={classe} />}</ComOlho>;
}
