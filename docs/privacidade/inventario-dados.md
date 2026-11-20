# Inventário de dados pessoais — CRM da Romatec

> Gerado por inspeção de código em 20/11/2026 (branch `seguranca/privacidade-lgpd`), sem acesso a dados reais.
> **Bases legais são CANDIDATAS — a validar pelo jurídico.** Responsável interno: **PENDENTE** (decisão de negócio).

## Identificação do produto
- **O que é:** CRM interno da Romatec (Node 22 + Express + tRPC + React/Vite; MySQL no Railway; SQLite só nos testes). Usado pela equipe (admin, secretária, corretores credenciados), empreendedores parceiros e assessoria jurídica.
- **Superfícies públicas:** landing de imóveis (`/i/:codigo`, `/imoveis`), páginas do empreendimento Bom Jardims, agendamento (`/agendar/:slug`), portal do comprador/carnê (`/c/:codigo`), Pix (`/pix/:token`), assinatura de contrato (`/assinar/:token`), formulário de recrutamento, portal de imobiliárias parceiras, `/api/public/lead`, webhooks (Z-API, Meta, Asaas, Spedy).
- **Cobrança:** boletos/Pix de compradores de chácaras via **Asaas**; camada SaaS de licença para corretores/empreendedores (`server/saas`, liga/desliga por configuração). Não há checkout de cartão próprio.
- **Papéis LGPD (a validar):** a Romatec tende a ser **controladora** dos dados de leads, compradores e equipe; pode atuar como **operadora** de dados do empreendedor (vendedora do loteamento) em partes do fluxo de contratos — decisão jurídica (ver `pendencias-juridicas-e-negocio.md`). O AvalieImob é outro produto, **não** compartilha base com este CRM e não foi tratado aqui.

## Categorias
| Operação | Titulares | Campos (exemplos) | Tabelas / armazenamento | Origem | Destinatários | Base legal candidata | Retenção (proposta, a validar) | Descarte |
|---|---|---|---|---|---|---|---|---|
| Atendimento de leads | interessados | nome, telefone, respostas de qualificação, UTM, consentimento do formulário (texto, data, IP), score, notas | `leadQualifications`, `leadEventos`, `leadEncaminhamentos`, `leadInteresses`, `contacts`, `messages`, `igConversas` | formulário público, WhatsApp, Instagram/Meta Lead Ads, portais | corretor responsável, Z-API/Meta, IA (qualificação/resumo, quando ligada), Telegram (aviso) | procedimentos preliminares a pedido / legítimo interesse / consentimento (formulário) | 24 meses sem interação | anonimização (`server/privacidade/titular.ts`) |
| Rastreio de visita | visitantes | id de visitante (cookie `rmt_vid`), UTMs, eventos | `leadEventos`, cookie first-party, GA4/Ads (Google) | landing `/i`, páginas de marketing | Google (só com aceite) | consentimento | 180 dias (cookie); GA conforme conta Google | revogação apaga cookies/para eventos |
| Contratos e compradores | compradores, cônjuges, procuradores, dependentes | CPF/CNPJ, RG, CNH, nascimento, filiação, estado civil, regime de bens, renda, endereço, contatos | `pessoas`, `contratoPessoas`, `pessoaDocumentos`, `chacaraDependentes`, `contratos`, `contratoArquivos`, `assinaturaSignatarios/Eventos` | ficha preenchida pela equipe/comprador | empreendedor (vendedora), cartório, Asaas, jurídico | execução de contrato; obrigação legal | prazo do contrato + prescrição (a validar) | **retido**; anonimização bloqueada para partes de contrato |
| Cobrança | compradores | valores, vencimentos, link do boleto, pagador (nome, CPF parcial) | `cobrancas`, `pagamentosManuais`, `recibos`, `financeiroAuditoria`, `cobrancaAvisos` | sistema / Asaas | Asaas, contabilidade | execução de contrato; obrigação legal/fiscal | prazo fiscal (a validar) | retido |
| Equipe e credenciamento | colaboradores, corretores, cônjuges | CPF, RG, CRECI, endereço, documentos (base64 no banco), foto, assinatura/certificado | `users`, `usuarioDocumentos`, `usuarioConjuge`, `usuarioFoto`, `certificadosUsuario` (pfx cifrado), `recrutamentos`, `recrutamentoDocs`, `corretoresExternos` | cadastro / recrutamento | admin, empreendimento (ficha de credenciamento) | execução de contrato / obrigação legal | vínculo + prazo legal (a validar) | exclusão de login ≠ exclusão de dados (ver retenção) |
| Licença SaaS | corretores/empreendedores | CPF/CNPJ do trial, NFS-e (tomador) | `saasTrials`, `saasNfse`, `saasEventosPagamento`, `auditoriaAcesso` (IP) | sistema | Asaas, Spedy | execução de contrato / obrigação fiscal | prazo fiscal (a validar) | retido |
| Eventos, reuniões, fila | convidados, interessados | nome, telefone, documento, placa | `eventosConvidados`, `reuniaoConvidados`, `loteFilaEspera` | equipe | equipe | legítimo interesse / segurança do evento | 12 meses após o evento | anonimização |
| Prospecção B2B | contatos comerciais (imobiliárias etc.) | nome, telefone, e-mail, endereço, mensagens | `prospectos`, `imobiliariasParceiras` | fontes públicas/IA | equipe | legítimo interesse (B2B) — **avaliar** (LIA) | 12 meses sem resposta | anonimização |
| Privacidade (novo) | titulares que fazem pedidos | nome, contato informado, descrição, hash do IP | `privacidadePedidos`, `privacidadePedidoEventos`, `privacidadeAceites` | formulário `/privacidade`, CRM | admin | obrigação legal (art. 18) | 5 anos após conclusão (a validar) | exclusão manual após prazo |

## Dados sensíveis, crianças e decisões automatizadas
- **Sensíveis:** não há campo próprio de saúde, religião etc. Documentos de identidade e fotos podem revelar dados biométricos (foto do rosto) — tratar como alto risco. **Avaliação jurídica pendente.**
- **Crianças/adolescentes:** `chacaraDependentes` guarda nome/CPF/nascimento de dependentes (podem ser menores). Exige avaliação do art. 14 — **pendente**.
- **Decisão automatizada:** score de lead (`leadScore`, `scoreDetalhe`) e qualificação por IA definem prioridade/distribuição. Não há negativa automática de contrato identificada, mas a priorização afeta o atendimento → documentar critérios e canal de revisão (art. 20) — **pendente**.

## Minimização (feito / proposto)
- Aceite de termos novo **não grava IP nem dispositivo** (hash de versão + horário bastam). Pedidos de titular guardam só **hash** do IP.
- Proposto (não alterado sem autorização): rever retenção de `consentimento.ip` dos leads; rever conversas inteiras guardadas; não exigir CPF onde não há contrato.
