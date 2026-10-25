import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { CARTAO_PADRAO, type CartaoVendas } from "@shared/cartaoVendas";

/**
 * Cartão de vendas do usuário logado (nome, CRECI se houver, telefone, e-mail e foto). Propostas, folders e
 * links saem com ele; o empreendedor recebe o do administrador (regra no servidor).
 */
export function useCartaoVendas(): CartaoVendas & { ref: string | null } {
  const { data } = trpc.cadastro.cartaoVendas.useQuery(undefined, { staleTime: 5 * 60_000 });
  return data ?? { ...CARTAO_PADRAO, ref: null };
}

/** Acrescenta a referência de quem compartilha (?c=…) ao link público */
export function comRef(url: string, ref: string | null | undefined): string {
  if (!ref) return url;
  return `${url}${url.includes("?") ? "&" : "?"}c=${encodeURIComponent(ref)}`;
}

/** Página pública: cartão de quem compartilhou o link (?c=…), guardado na sessão para as próximas páginas */
export function useCartaoDoLink(): CartaoVendas | null {
  const [cartao, setCartao] = useState<CartaoVendas | null>(null);
  useEffect(() => {
    let ref = new URLSearchParams(window.location.search).get("c");
    try {
      if (ref) sessionStorage.setItem("romatec-ref", ref);
      else ref = sessionStorage.getItem("romatec-ref");
    } catch { /* sem sessionStorage */ }
    if (!ref || !/^[A-Za-z0-9_-]{9,16}$/.test(ref)) return;
    fetch(`/api/cartao/${encodeURIComponent(ref)}`).then(r => (r.ok ? r.json() : null)).then(c => c && setCartao(c)).catch(() => {});
  }, []);
  return cartao;
}

/** Foto do corretor no cantinho (no lugar do selo "R"); sem foto, o selo da Romatec */
export function FotoCorretor({ cartao, tamanho = 62 }: { cartao: CartaoVendas; tamanho?: number }) {
  const [erro, setErro] = useState(false);
  if (cartao.fotoUrl && !erro) {
    return <img src={cartao.fotoUrl} alt={cartao.nome} onError={() => setErro(true)} crossOrigin="anonymous"
      style={{ width: tamanho, height: tamanho, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "2px solid #C9A84C" }} />;
  }
  return <img src="/brand/selo-romatec.svg" alt="Selo Romatec Consultoria Total" style={{ width: tamanho, height: tamanho, flexShrink: 0 }} />;
}
