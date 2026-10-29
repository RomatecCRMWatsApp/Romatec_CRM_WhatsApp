# Romatec CRM — Inventário de funcionalidades

> Versão de referência: **v1.67.0** (29/10/2026) · produção: romateccrm.com · 97 versões publicadas.
> Foco: venda de **loteamentos e condomínios de chácaras** (piloto: Condomínio de Chácaras Bom Jardims, Açailândia/MA) + imóveis avulsos.
> Stack: Node 22 + TypeScript + tRPC + Drizzle/MySQL, React/Vite, Z-API (WhatsApp), Asaas e Mercado Pago (cobrança), Cloudinary (mídia), Telegram e Web Push (avisos), Claude (IA).

Legenda de perfis: **ADM** administrador · **SEC** secretária · **COR** corretor · **EMP** empreendedor(a) / proprietária do empreendimento · **PUB** visitante (sem login).

---

## 1. Captação de leads

| Funcionalidade | Detalhe | Perfis |
|---|---|---|
| Landing do empreendimento (`/bom-jardims`) | Fotos, vídeo, diferenciais, mapa de vendas clicável, formulário com finalidade/prazo/pagamento, consentimento LGPD, KML para Google Earth | PUB |
| Página por chácara (`/bom-jardims/chacara/C05`) | Localização exata, rota no Google Maps, KML da chácara | PUB |
| Página de campanha (`/obras-bom-jardim`) | Vídeo das obras, ficha completa obrigatória antes do WhatsApp, "Agendar visita", OG/SEO próprio | PUB |
| Simulador público (`/o/bom-jardims`) | Escolhe chácara livre, barra da entrada, parcelas por prazo, à vista; botão leva ao WhatsApp do corretor com a simulação | PUB |
| Agendamento público (`/agendar/:slug`) | Dia, faixa de horário, chácara no mapa, nº de pessoas; cria lead + visita + confirmação no WhatsApp | PUB |
| Catálogo de imóveis (`/imoveis`, `/i/IMV-0001`) | Página por imóvel com preço oculto opcional, formulário curto | PUB |
| QR de placa (`/q/IMV-0001`) | Escaneou → WhatsApp com mensagem pré-preenchida e rastreio | PUB |
| Meta Lead Ads | Formulário instantâneo do Facebook/Instagram vira lead com campanha cadastrada (form_id) | — |
| WhatsApp direto | Mensagem recebida no número do sistema vira lead (número da equipe é ignorado) | — |
| UTM e origem | utm_source/medium/campaign, referrer e página de entrada; separa anúncio pago × orgânico | — |
| Campanhas de captação | Código da campanha (#CÓDIGO) + imóvel na mensagem, QR, link wa.me, gasto e leads por 1º/último toque | ADM SEC COR |
| Lista de interesse | Pré-cadastro para lançamento | ADM SEC COR |
| Anti-robô e limites | Honeypot e limite de envios por IP nos formulários públicos | — |

## 2. Atendimento e WhatsApp

| Funcionalidade | Detalhe |
|---|---|
| Integração Z-API | Envio de texto, documento, imagem; webhook de mensagens recebidas; status da conexão |
| Robô de qualificação (IA) | Perguntas de qualificação, score frio/morno/quente, devolve para humano ao pedir |
| Respostas automáticas por empreendimento | Textos por intenção, biblioteca de mídias, régua de follow-up, aviso legal; liga/desliga pelo escritório |
| Rodízio de leads | Distribuição automática entre quem "recebe leads" (habilitado no empreendimento); link de corretor (`?c=`) fica com o corretor |
| SLA de atendimento | Alerta de 5 min, repasse aos 15 min, aviso ao admin aos 60 min (7h–21h) |
| Atendimento automático | Abriu o WhatsApp pelo aviso/CRM ou mandou mensagem = atendido; encaminhado pela secretária = em atendimento |
| Avisos de lead novo | Telegram, WhatsApp, sininho, som e push no celular |
| Assumir / devolver ao bot | Corretor assume a conversa; bot para de responder |
| Disparos (campanhas WhatsApp) | Lista de contatos, variações de texto, 2 msgs/hora, play/pause, descadastro respeitado |
| Envio de arquivos pelo WhatsApp do sistema | Folder, proposta, PDF para cliente/corretor |
| Reuniões gravadas | Grava, transcreve e resume conversas com clientes |
| Convites de reunião | Link individual e geral de confirmação de presença, painel de confirmados |

## 3. Funil e gestão de leads

- Kanban por funil (**comprador**: novo → qualificando → qualificado → visita agendada → visitou → proposta → fechado/perdido; **proprietário**: novo → avaliação → exclusividade → captado).
- Ficha do lead: slots de qualificação editáveis, score com detalhamento, histórico de eventos, mensagens, interesses, visitas, reuniões, origem web.
- Agenda de visitas com confirmação pelo WhatsApp.
- Relatório de leads (origem, campanha, tempo de atendimento, por corretor) com PDF/CSV e envio pelo WhatsApp.
- Descartar, reativar, excluir (admin com senha); limpeza de leads que eram números da equipe.
- Corretor vê só os leads dele; secretária e admin veem todos.

## 4. Estoque, mapa e empreendimentos

- Mapa temático dos lotes a partir do DXF/KML oficial (SIRGAS 2000), situação por cor: disponível, reservado, em negociação, vendido, quitado, bloqueado.
- **Zoom, arrasto e rotação** (dois dedos, botões, bússola), rótulos sempre de pé, tela cheia.
- Controle de vendas por lote (situação, cliente, valores, corretor, histórico de alterações).
- Fila de reservas do escritório (prazo de reserva).
- Memorial descritivo por lote (gerado do DXF ou manual), matrícula, via de frente.
- Documentos do empreendimento (licenças, SIGEF, registro), pasta de arquivos.
- Folder do empreendimento e folder por chácara gerados na hora (com os dados do corretor).
- Proposta comercial em PDF.

## 5. Simulador e financiamento direto

- Condições por empreendimento (entrada %, parcelas da entrada, prazos, juros a.a. efetivos, Tabela Price, desconto à vista), reajuste sem deploy.
- Preço de tabela por lote; tabela de financiamento por chácara; simulação salva.
- Simulador interno e público.

## 6. Contratos e assinatura

- Contrato (CPCV) gerado do modelo com dados do lote, comprador(es), cônjuge, dependentes e plano congelado.
- Anexos: memorial, mapa da unidade, Estatuto, Diretrizes de Uso, Anexo II, boleto.
- Versões do PDF nunca sobrescritas (hash), código de verificação público (`/c/v/:codigo`).
- **Assinatura eletrônica** com OTP, gov.br, certificado ICP A1 ou manuscrita; posicionamento das assinaturas; manifesto de assinaturas (Anexo VII).
- Cancelamento e distrato só pelo admin com senha (step-up) e auditoria; pedido de cancelamento pelo corretor/secretária.
- Contrato com cliente próprio (sem lead).

## 7. Financeiro e recebíveis

- Cobranças no **Asaas** (boleto/Pix) com split, carnê digital do comprador (`/c/:codigo`), 2ª via, webhook idempotente, sincronização.
- Pagamento manual (Pix/InfinitePay/transferência) com rateio entre parcelas e recibo.
- Extrato por comprador, fluxo de caixa, despesas, declaração de quitação, reajuste IPCA.
- Cobrança pelo WhatsApp (régua), recibos pendentes.
- Comissões: % por corretor/empreendimento, visão do corretor só da própria comissão.
- Vendas do empreendimento para a empreendedora.

## 8. Pós-venda e condomínio

- Carteirinhas do condomínio (titular e dependentes, com foto, QR), modelos de carteirinha e crachá.
- Talonários; eventos/portaria (convidados, crachá, entrada/saída).
- Portal da empreendedora (mapa, situação das chácaras, vendas, carteirinhas, reuniões).

## 9. Marketing e divulgação

- Materiais (imagens, vídeos, PDF) por empreendimento/imóvel, bloqueio de peças com preço.
- **Tudo sai com os dados do corretor**: banner com faixa (nome, CRECI, WhatsApp, Instagram, QR), vídeo com faixa, PDF com rodapé, textos com link pessoal `?c=`.
- Aba **Links de divulgação** (obras, landing, agendamento, KML, simulador + links cadastrados pelo escritório) com texto pronto, QR e compartilhar.
- SEO das páginas públicas (títulos, OG, JSON-LD, sitemap, robots), GA4/Google Ads com consentimento de cookies.
- Medição de anúncios, visitas e cliques por corretor/campanha.

## 10. Equipe, permissões e gamificação

- Perfis ADM/SEC/COR/EMP com matriz de módulos por perfil e ajuste por usuário; habilitação por empreendimento/imóvel.
- "Ver como" (o sistema como cada pessoa vê, só leitura).
- Recrutamento de corretores/secretárias/empreendedores com formulário e documentos; ficha de credenciamento.
- Cadastro completo do usuário (CRECI/CNAI, documentos, cônjuge, foto), primeiro acesso por convite.
- **Ranking de vendas** por empreendimento e campanha de premiação com prazo (indeterminado/data/estoque) e encerramento automático.
- Painel e Área do corretor (mobile), Desempenho.

## 11. Plataforma (SaaS) e administração

- Assinaturas do CRM para corretores (planos, cupons, teste grátis, Mercado Pago, upgrade), NFS-e (Spedy).
- Novidades da versão (aviso de atualização), notificações, tela de descanso.
- Auditoria de ações sensíveis, step-up de senha, LGPD (consentimento com data/hora/IP).
- Configurações da empresa, credenciais, espaço do banco, monitor de saúde, deploy automático.
- Integração com a ZAYRA (agente de IA interno da Romatec).

---

*Inventário gerado a partir das notas de versão (RELEASE_NOTES.md), do menu do sistema e das rotas públicas.*
