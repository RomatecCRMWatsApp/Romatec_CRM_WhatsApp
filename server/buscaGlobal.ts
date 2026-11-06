/**
 * Busca única (lupa no topo / Ctrl+K). Procura ao mesmo tempo em leads, compradores, contratos, chácaras, imóveis,
 * equipe e materiais, sempre dentro do que a pessoa já pode ver:
 *  - administrador e secretária: tudo;
 *  - corretor: os leads em que é o responsável, os contratos dele e o que estiver nos empreendimentos/imóveis habilitados;
 *  - empreendedor: o empreendimento dele.
 * O banco filtra por LIKE (o MySQL já ignora maiúsculas e acentos) e a ordem final vem de shared/buscaGlobal.ts.
 */
import { and, eq, inArray, like, or } from "drizzle-orm";
import { getDb } from "./db";
import { contratoPessoas, contratos, empreendimentos, leadQualifications, lotes, materiais, pessoas, properties, users } from "../drizzle/schema";
import { agruparResultados, melhorPontuacao, prepararTermo, soDigitos, type ResultadoBusca } from "../shared/buscaGlobal";
import { perfilDe, podeAbrir } from "../shared/equipe";
import { temAcesso } from "../shared/permissoes";
import { numeroCreciPF } from "../shared/cartaoVendas";
import { leadsVisiveis, type PermissoesUsuario } from "./permissoes";

const LIMITE_SQL = 60;
const ROTULO_SCORE: Record<string, string> = { quente: "quente", morno: "morno", frio: "frio" };
const ROTULO_LOTE: Record<string, string> = { disponivel: "disponível", reservado: "reservada", vendido: "vendida", bloqueado: "bloqueada" };

export async function buscarTudo(entrada: string, ator: { id: number; perfil?: string | null; role?: string | null }, p: PermissoesUsuario) {
  const termo = prepararTermo(entrada);
  if (!termo.valido) return { termo: entrada, grupos: [] as ReturnType<typeof agruparResultados> };
  const db: any = await getDb();
  if (!db) return { termo: entrada, grupos: [] as ReturnType<typeof agruparResultados> };

  const perfil = p.perfil ?? perfilDe(ator as any);
  const escritorio = perfil === "admin" || perfil === "secretario";
  const q = `%${entrada.trim()}%`;
  const qd = termo.digitos.length >= 4 ? `%${termo.digitos}%` : null;
  const out: ResultadoBusca[] = [];
  const caiu = (nome: string) => (e: any) => { console.warn(`[Busca] ${nome}:`, e?.message); return [] as any[]; };

  // Empreendimentos (nomes e slugs) para montar links e checar acesso
  const emps: any[] = await db.select({ id: empreendimentos.id, slug: empreendimentos.slug, nome: empreendimentos.nome }).from(empreendimentos).catch(caiu("empreendimentos"));
  const empPorId = new Map(emps.map(e => [Number(e.id), e]));
  const podeEmp = (id: number) => temAcesso(perfil, p.acessos, "empreendimento", id);

  const [leadsRows, pessoasRows, contratosRows, lotesRows, imoveisRows, equipeRows, materiaisRows] = await Promise.all([
    // Leads: nome ou telefone
    db.select({ id: leadQualifications.id, nome: leadQualifications.nome, phone: leadQualifications.phone, score: leadQualifications.score,
      responsavelId: leadQualifications.responsavelId, empreendimentoSlug: leadQualifications.empreendimentoSlug })
      .from(leadQualifications).where(qd ? or(like(leadQualifications.nome, q), like(leadQualifications.phone, qd)) : like(leadQualifications.nome, q)).limit(LIMITE_SQL)
      .catch(caiu("leads")),
    // Compradores (cadastro de pessoas dos contratos): nome ou CPF/CNPJ
    db.select({ id: pessoas.id, nome: pessoas.nome, cpfCnpj: pessoas.cpfCnpj }).from(pessoas)
      .where(qd ? or(like(pessoas.nome, q), like(pessoas.cpfCnpj, qd)) : like(pessoas.nome, q)).limit(LIMITE_SQL).catch(caiu("pessoas")),
    // Contratos: número ou código da chácara
    db.select({ id: contratos.id, numero: contratos.numero, loteCodigo: contratos.loteCodigo, status: contratos.status, empreendimentoId: contratos.empreendimentoId, corretorUserId: contratos.corretorUserId })
      .from(contratos).where(or(like(contratos.numero, q), like(contratos.loteCodigo, q))).limit(LIMITE_SQL).catch(caiu("contratos")),
    // Chácaras: código (B13), com o empreendimento
    db.select({ id: lotes.id, codigo: lotes.codigo, quadra: lotes.quadra, status: lotes.status, areaM2: lotes.areaM2, empreendimentoId: lotes.empreendimentoId })
      .from(lotes).where(like(lotes.codigo, q)).limit(LIMITE_SQL).catch(caiu("lotes")),
    // Imóveis: nome, código, endereço ou cidade
    db.select({ id: properties.id, codigo: properties.codigo, nome: properties.denomination, endereco: properties.address, cidade: properties.city })
      .from(properties).where(or(like(properties.denomination, q), like(properties.codigo, q), like(properties.address, q), like(properties.city, q))).limit(LIMITE_SQL)
      .catch(caiu("imoveis")),
    // Equipe (só o escritório procura gente da equipe)
    escritorio
      ? db.select({ id: users.id, name: users.name, email: users.email, creci: users.creci, telefone: users.telefone, perfil: users.perfil, role: users.role, ativo: users.ativo })
        .from(users).where(qd ? or(like(users.name, q), like(users.email, q), like(users.creci, qd), like(users.telefone, qd)) : or(like(users.name, q), like(users.email, q))).limit(LIMITE_SQL)
        .catch(caiu("equipe"))
      : Promise.resolve([]),
    // Materiais de divulgação: título
    db.select({ id: materiais.id, titulo: materiais.titulo, tipo: materiais.tipo, propertyId: materiais.propertyId, empreendimentoSlug: materiais.empreendimentoSlug })
      .from(materiais).where(like(materiais.titulo, q)).limit(LIMITE_SQL).catch(caiu("materiais")),
  ]);

  // ─── Leads ───
  for (const l of leadsVisiveis(p, ator.id, leadsRows as any[])) {
    const pontos = melhorPontuacao([{ valor: l.nome }, { valor: l.phone, modo: "numero" }], termo);
    const emp = l.empreendimentoSlug ? emps.find(e => e.slug === l.empreendimentoSlug)?.nome : null;
    out.push({ tipo: "lead", id: `lead:${l.id}`, titulo: l.nome || formatarFone(l.phone) || `Lead ${l.id}`,
      detalhe: [formatarFone(l.phone), l.score ? `lead ${ROTULO_SCORE[l.score] ?? l.score}` : null, emp].filter(Boolean).join(", ") || null,
      url: `/clientes/lead/${l.id}`, pontos });
  }

  // ─── Compradores → contratos deles ───
  const pessoaIds = (pessoasRows as any[]).map(x => Number(x.id));
  const vinculos: any[] = pessoaIds.length
    ? await db.select({ contratoId: contratoPessoas.contratoId, pessoaId: contratoPessoas.pessoaId, papel: contratoPessoas.papel }).from(contratoPessoas)
      .where(inArray(contratoPessoas.pessoaId, pessoaIds)).catch(caiu("contratoPessoas"))
    : [];
  const idsContratosDePessoas = Array.from(new Set(vinculos.map(v => Number(v.contratoId))));
  const contratosDePessoas: any[] = idsContratosDePessoas.length
    ? await db.select({ id: contratos.id, numero: contratos.numero, loteCodigo: contratos.loteCodigo, status: contratos.status, empreendimentoId: contratos.empreendimentoId, corretorUserId: contratos.corretorUserId })
      .from(contratos).where(inArray(contratos.id, idsContratosDePessoas)).catch(caiu("contratos de compradores"))
    : [];
  const podeContrato = (c: any) => escritorio
    || (perfil === "corretor" && Number(c.corretorUserId) === ator.id)
    || (perfil === "empreendedor" && podeEmp(Number(c.empreendimentoId)));
  const contratoPorId = new Map<number, any>([...contratosDePessoas, ...(contratosRows as any[])].map(c => [Number(c.id), c]));

  for (const pe of pessoasRows as any[]) {
    const dele = vinculos.filter(v => Number(v.pessoaId) === Number(pe.id)).map(v => contratoPorId.get(Number(v.contratoId))).filter(Boolean).filter(podeContrato);
    if (!dele.length) continue; // comprador só aparece ligado a um contrato que a pessoa pode ver
    const pontos = melhorPontuacao([{ valor: pe.nome }, { valor: pe.cpfCnpj, modo: "numero" }], termo);
    const c = dele[0];
    out.push({ tipo: "cliente", id: `pessoa:${pe.id}`, titulo: pe.nome,
      detalhe: [mascararDoc(pe.cpfCnpj), `contrato ${c.numero}`, `chácara ${c.loteCodigo}`, dele.length > 1 ? `+${dele.length - 1} contrato(s)` : null].filter(Boolean).join(", "),
      url: `/clientes/comprador/${pe.id}`, pontos });
  }

  // ─── Contratos (pelo número, pela chácara ou pelo comprador) ───
  const compradorDoContrato = new Map<number, string>();
  for (const v of vinculos) if (String(v.papel).startsWith("comprador")) {
    const nome = (pessoasRows as any[]).find(x => Number(x.id) === Number(v.pessoaId))?.nome;
    if (nome && !compradorDoContrato.has(Number(v.contratoId))) compradorDoContrato.set(Number(v.contratoId), nome);
  }
  for (const c of Array.from(contratoPorId.values())) {
    if (!podeContrato(c)) continue;
    const comprador = compradorDoContrato.get(Number(c.id));
    const pontos = Math.max(melhorPontuacao([{ valor: c.numero }, { valor: c.loteCodigo }], termo), comprador ? melhorPontuacao([{ valor: comprador }], termo) - 5 : 0);
    out.push({ tipo: "contrato", id: `contrato:${c.id}`, titulo: `Contrato ${c.numero}`,
      detalhe: [`chácara ${c.loteCodigo}`, comprador, empPorId.get(Number(c.empreendimentoId))?.nome, c.status].filter(Boolean).join(", "),
      url: `/contratos/${c.id}`, pontos });
  }

  // ─── Chácaras ───
  for (const l of lotesRows as any[]) {
    if (!podeEmp(Number(l.empreendimentoId))) continue;
    const emp = empPorId.get(Number(l.empreendimentoId));
    const pontos = melhorPontuacao([{ valor: l.codigo }], termo);
    const area = l.areaM2 != null ? `${Number(l.areaM2).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²` : null;
    out.push({ tipo: "chacara", id: `lote:${l.id}`, titulo: `Chácara ${l.codigo}`,
      detalhe: [emp?.nome, l.quadra ? `quadra ${l.quadra}` : null, area, ROTULO_LOTE[l.status] ?? l.status].filter(Boolean).join(", "),
      url: emp ? `/empreendimentos/${emp.slug}?lote=${encodeURIComponent(l.codigo)}` : "/empreendimentos", pontos });
  }

  // ─── Imóveis ───
  for (const im of imoveisRows as any[]) {
    if (!temAcesso(perfil, p.acessos, "imovel", Number(im.id))) continue;
    const pontos = melhorPontuacao([{ valor: im.nome }, { valor: im.codigo }, { valor: im.endereco }, { valor: im.cidade }], termo);
    out.push({ tipo: "imovel", id: `imovel:${im.id}`, titulo: im.codigo ? `${im.codigo} · ${im.nome}` : im.nome,
      detalhe: [im.endereco, im.cidade].filter(Boolean).join(", ") || null, url: `/properties?imovel=${im.id}`, pontos });
  }

  // ─── Equipe ───
  for (const u of equipeRows as any[]) {
    const pu = perfilDe(u);
    const pontos = melhorPontuacao([{ valor: u.name }, { valor: u.email }, { valor: u.creci, modo: "numero" }, { valor: u.telefone, modo: "numero" }], termo);
    const controlado = pu === "corretor" || pu === "empreendedor";
    out.push({ tipo: "equipe", id: `user:${u.id}`, titulo: u.name || u.email || `Usuário ${u.id}`,
      detalhe: [rotuloPerfil(pu), u.creci ? `CRECI ${numeroCreciPF(u.creci)}` : null, formatarFone(u.telefone), u.ativo === false || u.ativo === 0 ? "login desativado" : null].filter(Boolean).join(", ") || null,
      // Corretor e empreendedor: o Controle de acessos (secretária também abre); o resto da equipe: Equipe (administrador)
      url: controlado ? `/controle-acessos?busca=${encodeURIComponent(u.name || "")}` : "/equipe", pontos });
  }

  // ─── Materiais ───
  for (const m of materiaisRows as any[]) {
    const emp = m.empreendimentoSlug ? emps.find(e => e.slug === m.empreendimentoSlug) : null;
    const pode = emp ? podeEmp(Number(emp.id)) : m.propertyId ? temAcesso(perfil, p.acessos, "imovel", Number(m.propertyId)) : escritorio;
    if (!pode) continue;
    out.push({ tipo: "material", id: `material:${m.id}`, titulo: m.titulo, detalhe: [m.tipo, emp?.nome].filter(Boolean).join(", ") || null,
      url: "/materiais", pontos: melhorPontuacao([{ valor: m.titulo }], termo) });
  }

  // Só o que a pessoa consegue abrir (a mesma regra do menu)
  const abre = out.filter(r => podeAbrir(perfil as any, r.url.split("?")[0]));
  return { termo: entrada, grupos: agruparResultados(abre) };
}

function formatarFone(t: string | null | undefined): string | null {
  const d = soDigitos(t).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d[2]} ${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t ? String(t) : null;
}

/** CPF/CNPJ parcialmente escondido na lista (o completo fica no contrato) */
function mascararDoc(doc: string | null | undefined): string | null {
  const d = soDigitos(doc);
  if (d.length === 11) return `CPF ***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `CNPJ ${d.slice(0, 2)}.***.***/${d.slice(8, 12)}-**`;
  return null;
}

function rotuloPerfil(p: string | null | undefined): string | null {
  return p === "admin" ? "Administrador" : p === "secretario" ? "Secretária" : p === "corretor" ? "Corretor" : p === "empreendedor" ? "Empreendedor" : null;
}
