import type { ButtonHTMLAttributes, ReactNode } from "react";
import { InfinityMini } from "./RomatecLoader";

export interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  /** texto exibido durante o carregamento (ex.: "Enviando para o WhatsApp…") */
  loadingText?: ReactNode;
}

export function LoadingButton({ loading = false, loadingText, children, disabled, className, type = "button", ...rest }: LoadingButtonProps) {
  return (
    <button
      type={type}
      className={["rt-btn", className].filter(Boolean).join(" ")}
      aria-busy={loading}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <InfinityMini />}
      {loading ? loadingText ?? children : children}
    </button>
  );
}
