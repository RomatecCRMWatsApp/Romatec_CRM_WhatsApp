/** Central de suporte: quem atende a equipe e como chamar (WhatsApp, telefone, e-mail). */
export interface ContatoSuporte {
  nome: string;
  papel: "Administrador" | "Secretaria";
  email: string | null;
  telefone: string | null;
  /** Número internacional só com dígitos para wa.me (ex.: 5599991811246); null se não houver telefone válido */
  whatsapp: string | null;
}

interface LinhaUsuario { name: string | null; email: string | null; telefone: string | null; role: string | null; perfil: string | null }

export function numeroWhatsApp(telefone: string | null | undefined): string | null {
  const d = String(telefone || "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

export function contatosSuporte(linhas: LinhaUsuario[]): ContatoSuporte[] {
  return linhas
    .filter(l => l.name || l.email || l.telefone)
    .map(l => ({
      nome: (l.name || l.email || "Equipe Romatec").trim(),
      papel: l.role === "admin" ? ("Administrador" as const) : ("Secretaria" as const),
      email: l.email?.trim() || null,
      telefone: l.telefone?.trim() || null,
      whatsapp: numeroWhatsApp(l.telefone),
    }))
    .sort((a, b) => (a.papel === b.papel ? a.nome.localeCompare(b.nome, "pt-BR") : a.papel === "Administrador" ? -1 : 1));
}
