export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/** Área de quem usa este aparelho: o advogado (portal jurídico) volta para o login jurídico ao sair ou expirar a sessão */
const CHAVE_AREA = "rt_area_login";
export const marcarAreaLogin = (area: "juridico" | "crm") => { try { localStorage.setItem(CHAVE_AREA, area); } catch { /* sem armazenamento: login comum */ } };

export const getLoginUrl = () => {
  try {
    if (typeof window !== "undefined" && (window.location.pathname.startsWith("/juridico") || localStorage.getItem(CHAVE_AREA) === "juridico")) return "/juridico/entrar";
  } catch { /* sem armazenamento: login comum */ }
  return "/login";
};
