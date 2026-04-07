# Romatec CRM WhatsApp - TODO

## Banco de Dados
- [x] Criar schema Drizzle com tabelas: users, contacts, properties, campaigns, messages, company_config
- [x] Gerar e executar migrações SQL
- [x] Validar estrutura do banco

## Backend (tRPC Procedures)
- [x] Implementar CRUD de contatos (create, read, list, update, delete, importBatch)
- [x] Implementar CRUD de imóveis (create, read, list, update, delete)
- [x] Implementar CRUD de campanhas (create, list, getById, autoSetup, getContacts)
- [x] Implementar CRUD de configurações da empresa (get, update)
- [x] Implementar procedures de campanhas (start/stop/reset/toggleCampaign)
- [x] Implementar integração Z-API (envio real + simulação)
- [x] Implementar lógica de envio de 2 mensagens/hora
- [x] Criar helpers para queries do banco

## Frontend - Layout e Navegação
- [x] Configurar tema dark premium (preto + verde + dourado)
- [x] Criar navegação principal (Dashboard, Clientes, Imóveis, Campanhas, Configurações)
- [x] Implementar autenticação e logout

## Frontend - Dashboard
- [x] Criar painel inicial com visão geral
- [x] Exibir contagem de clientes, imóveis, campanhas
- [x] Exibir status WhatsApp Z-API
- [x] Exibir dados da empresa

## Frontend - Módulo de Clientes
- [x] Listar contatos com paginação e busca
- [x] Criar formulário de novo contato
- [x] Implementar edição e exclusão de contato
- [x] Criar funcionalidade de importação (vCard e CSV)

## Frontend - Módulo de Imóveis
- [x] Listar imóveis com cards premium
- [x] Criar formulário completo de cadastro
- [x] Implementar upload de fotos, vídeo, planta baixa
- [x] Implementar edição e exclusão de imóvel
- [x] Criar página pública de imóvel
- [x] Gerar descrição por IA
- [x] Cards estilo premium com galeria

## Frontend - Módulo de Campanhas
- [x] Listar campanhas com status e contatos
- [x] Auto-configurar campanhas (1 por imóvel, 12 contatos cada)
- [x] Botões Play, Pause, Reset, Toggle
- [x] Monitoramento em tempo real com polling 5s
- [x] Cronômetro de ciclo e progresso

## Frontend - Painel de Configurações
- [x] Dados da empresa (nome, telefone, endereço)
- [x] Campos Z-API (Instance ID, Token)
- [x] Indicador de status e botão testar conexão

## Integração Z-API
- [x] Envio de mensagens via Z-API (real quando configurado, simulado quando não)
- [x] MessageScheduler com controle de taxa
- [x] Monitorar status de conexão
- [x] Implementar webhook para receber respostas dos clientes
- [x] Implementar retry automático em falhas de envio (3 tentativas com backoff)

## Sistema de Campanhas Dinâmico
- [x] Campanhas = Imóveis ativos (sincronização automática)
- [x] Rotação de pares dinâmica
- [x] EXATAMENTE 2 mensagens por hora, intervalo 10-30 min
- [x] Bloqueio 72h por contato
- [x] Loop infinito 24/7
- [x] Contatos em rodízio sem repetição
- [x] Mensagens variadas por campanha

## Dados Iniciais
- [x] 2.549+ contatos carregados do vCard
- [x] 4 imóveis cadastrados (ALACIDE, Mod_Vaz-01, Mod_Vaz-02, Mod_Vaz-03)
- [x] Dados da empresa configurados

## Testes
- [x] Testes unitários com Vitest (37 passando)
- [x] Testar CRUD de contatos, imóveis, campanhas
- [x] Testar integração Z-API
- [x] Testar scheduler

## Documentação e Deploy
- [x] Documentação de instalação local (DEPLOY_LOCAL.md)
- [x] Guia de configuração Z-API
- [x] Guia de uso do sistema
- [x] Script de instalação e .env.example

## Logo e Branding
- [x] Logo da Romatec no header e login
- [x] Tema dark premium aplicado em todas as páginas

## Imagens e Mapas dos Imóveis
- [x] Adicionar imagens reais aos imóveis (ALACIDE 16 fotos, Mod_Vaz-02 7 fotos, Mod_Vaz-03 8 fotos + planta)
- [x] Adicionar imagens Mod_Vaz-01 (8 renders + planta baixa)
- [x] Adicionar mapa Google Maps na página pública do imóvel (geocodificação automática por endereço)

## Configuração Z-API
- [x] Configurar credenciais Z-API (Instance ID, Token, Client-Token) no sistema - CONECTADO!

## Bugs
- [x] Corrigir NotFoundError: insertBefore no site publicado (restart servidor resolveu)
- [x] Excluir imóvel de teste do banco (ID 30015 removido)
- [x] Corrigir bug de exclusão de imóvel (adicionado cascade delete de messages e history)
- [x] Revisar código completo do bot (corrigido Client-Token, endpoint /send-text, headers)
- [x] Testar envio real de mensagem WhatsApp via Z-API (messageId: 69F7407D071E813F2CC2)
- [x] Preparar para campanha real - Z-API funcionando!
- [x] Adicionar upload drag&drop para fotos na edição de imóveis
- [x] Adicionar upload drag&drop para vídeos na edição de imóveis
- [x] Adicionar upload drag&drop para planta baixa na edição de imóveis
- [x] Corrigir: imóveis de teste voltam ao publicar (testes agora fazem cleanup automático + dados limpos)
- [x] Corrigir erro insertBefore (reescrito com useMemo, useCallback, loading state, keys estáveis, polling 10s)
- [x] URGENTE: Parar campanhas e corrigir bug insertBefore React (keys, loading, corrida de render)
- [x] CRÍTICO: Scheduler corrigido - limite rígido 2 msgs/hora, intervalo mínimo 20min, lock de envio
- [x] Corrigir rotação de campanhas (pares alternados a cada hora - validado com 7 testes unitários)
- [x] Reescrever mensagens com copywriting profissional (12 variações com gatilhos mentais)
- [x] Mensagens personalizadas por contato ({{NOME}} substituído pelo primeiro nome real - 6 testes)
- [x] Envio aleatório (contatos embaralhados)
- [x] Incluir link da página pública do imóvel nas mensagens de campanha
- [x] Testes unitários: personalização (6), rotação de pares (7), variações (4), limites (4) = 62 testes total

## Correções de Bugs - Análise Profunda (06/04/2026)
- [x] BUG CRÍTICO 1: Race condition no executeCycle() - salvar cycleNumber no setTimeout e validar antes de enviar msg 2
- [x] BUG CRÍTICO 2: clearTimeout(messageTimer) no stop() - mensagem 2 dispara mesmo após parar
- [x] BUG CRÍTICO 3: resetCampaignContacts() reutiliza contatos bloqueados 72h - filtrar bloqueados
- [x] BUG CRÍTICO 4: syncCampaignsWithProperties() sem lock - pode causar leitura inconsistente
- [x] BUG MÉDIO 5: Rotação de par com número ímpar de campanhas - campanha 0 recebe dobro
- [x] BUG MÉDIO 6: Validação de telefone BR deve ser mínimo 13 dígitos (55+DDD+9 dígitos)
- [x] MELHORIA 7: Log de aviso quando contatos disponíveis < 48 (4 campanhas × 12)
- [x] MELHORIA 8: getMessageVariation() garantir rotação sem repetição consecutiva

## Bugs Reportados pelo José (06/04/2026 - Sessão 2)
- [x] BUG: Reset enviou 4+ mensagens em vez de 2/hora - scheduler não para completamente antes de resetar
- [x] BUG: Reset não troca contatos - precisa eliminar tudo e começar do zero com 12 NOVOS contatos
- [x] BUG: Mensagens antigas com "Boa tarde!" ainda no banco - reset deve atualizar variações de mensagem
- [x] BUG: Reset + Start causa envio duplicado - múltiplos timers ativos simultaneamente
- [x] CORREÇÃO: Reset deve: parar scheduler → cancelar TODOS timers → limpar msgs/contatos → gerar novas variações → redesignar 12 novos contatos → NÃO reiniciar automaticamente

## Bugs Reportados pelo José (06/04/2026 - Sessão 2)
- [x] BUG GRAVE: Reset enviou 4 msgs + reset + mais 4 msgs = 8 total (deveria ser max 2/hora)
- [x] BUG: Reset não mata timers antigos - ciclo anterior continua rodando em paralelo
- [x] BUG: Reset não troca contatos por 12 NOVOS - reutiliza os mesmos
- [x] BUG: Variações antigas ("Boa tarde!") permanecem no banco após reset
- [x] CORREÇÃO: Reset deve parar scheduler completamente, cancelar TODOS timers, limpar tudo, gerar novas variações, pegar 12 novos contatos, e NÃO reiniciar automaticamente

## Correção do Número WhatsApp (06/04/2026)
- [x] BUG: Número do WhatsApp no link do site está errado (91811-2460 em vez de 99181-1246)

## Especialistas na Página Pública (06/04/2026)
- [x] Adicionar 2 especialistas na página pública: José Romário (99) 99181-1246 e Daniele Cavalcante (99) 99206-2871

## Bugs Reportados pelo José (06/04/2026 - Sessão 3 - Tela de Campanhas)
- [x] BUG 1: Cronômetro ausente - não mostra contagem regressiva para próximo ciclo
- [x] BUG 2: Status "PARADO" no topo quando campanha está rodando - deveria mostrar "RODANDO" com LED verde
- [x] BUG 3: Par ativo não acende na rotação de pares - deveria destacar (verde) o par que está rodando
- [x] BUG 4: Mod_Vaz-01 não enviou nenhuma msg no mesmo ciclo que ALACIDE - ambas do Par 1 deveriam enviar
- [x] BUG 5: Horário de início mostra 18:05:51 mesmo após reiniciar - deveria atualizar para hora real
- [x] BUG 6: Contagem inconsistente - WhatsApp mostra 3 msgs enviadas mas dashboard mostra 2

## Bugs Botões (06/04/2026)
- [x] BUG: Botões "Redefinir" e "Parar Tudo" sem cores visíveis e não acionam

## Bug Reset Enviados (06/04/2026)
- [x] BUG: Redefinir não zera sentCount e contatos dentro de cada campanha (fix: invalidate cache após reset)
- [x] BUG: Cronômetro adicionado no header de cada card de campanha
- [x] BUG: Cronômetro adicionado no header de cada card de campanha
- [x] BUG: Campanhas de teste (TESTE_AUTO) filtradas da UI

## Ajustes Cronômetro e LED (06/04/2026)
- [x] Cronômetro inverso: contagem regressiva de 1:00:00 até 00:00:00 (diminuindo)
- [x] Barra de progresso subindo conforme cronômetro diminui
- [x] LED mudar de "Enviando" (verde pulsante) para "Enviado" (verde fixo) após envio da mensagem

## Bug Horário Início (06/04/2026)
- [x] BUG: Horário "Iniciado" agora limpa no reset (null) e atualiza ao clicar Iniciar

## Painel Cronômetro Estilo CRM Antigo (06/04/2026)
- [x] Painel cronômetro com: contagem regressiva grande, Ciclo X | Par X de Y, barra progresso roxa
- [x] Mostrar: Início às, Rodando há, Próximo ciclo (horário previsto)
- [x] Mostrar: Mensagens neste ciclo: X/2

## BUG CRÍTICO CORRIGIDO v3.0: 3 msgs ALACIDE em vez de 1 ALACIDE + 1 Mod_Vaz-01 (06/04/2026)
- [x] BUG: Scheduler enviou 3 msgs da ALACIDE quando deveria ser 1 ALACIDE + 1 Mod_Vaz-01 por hora
- [x] FIX: O ciclo de 60min agora é baseado no momento do Play (não na hora cheia do relógio)
- [x] FIX: executeCycle() NÃO reseta messagesThisCycle - só o timer de 60min zera o contador
- [x] FIX: scheduleNextCycle() agenda EXATAMENTE 60min após o início do ciclo atual
- [x] FIX: canSendMessage() verifica limite ANTES de enviar (verificação tripla)
- [x] FIX: isSending LOCK impede envio simultâneo
- [x] Testes: 53 testes passando (incluindo 11 novos para v3.0)

## Feature: msgs/hora configurável por campanha v4.0 (06/04/2026)
- [x] Adicionar campo messagesPerHour no schema campaigns (default: 2, min: 1, max: 10)
- [x] Executar migração SQL (ALTER TABLE campaigns ADD messagesPerHour)
- [x] Reescrever scheduler v4.0 com fila dinâmica por par e slots aleatórios
- [x] Slots distribuídos aleatoriamente dentro de 60 min (mínimo 3 min entre msgs)
- [x] Ciclo baseado no Play, NÃO na hora cheia do relógio
- [x] Procedure tRPC updateMessagesPerHour para salvar no banco
- [x] UI editável no card de campanha (campo clicável com +/- e Salvar)
- [x] Mostrar slots agendados no cronômetro (verde=enviado, roxo=pendente)
- [x] Mostrar total do par (camp1.mph + camp2.mph) na rotação de pares
- [x] Testes unitários: 56 testes passando (incluindo 12 novos para v4.0)

## Redesign Visual Campanhas - Dark Premium (06/04/2026)
- [x] Fundo escuro em toda a tela de campanhas (consistente com dashboard)
- [x] Cards de campanha com fundo dark, bordas sutis, sombras
- [x] Painel de controle dark com gradientes
- [x] Cronômetro e slots com cores vibrantes sobre fundo escuro
- [x] Rotação de pares com visual dark
- [x] Botões com cores vibrantes sobre fundo escuro

## Bug Horário Cards + Redesign Dark (06/04/2026)
- [x] BUG: Horário de início nos cards mostra hora antiga (19:44:47) em vez da hora do scheduler (20:13:23)
- [x] FIX: Cards devem usar startedAtFormatted do scheduler como fonte da verdade
- [x] Redesign dark premium: fundo escuro, cards escuros, cores vibrantes
- [x] BUG: Barra "Tempo do Ciclo" preenchida mas percentual mostra 0% - percentual não acompanha a barra

## Proteção Anti-Duplicação msgs/hora (06/04/2026) - IMPLEMENTADO
- [x] msgs/hora limitado automaticamente pelos contatos pendentes (countPendingContacts)
- [x] generateSlots usa Math.min(mph, pendingContacts) para limitar
- [x] Nunca enviar 2 msgs para o mesmo cliente (contato marcado 'sent' após envio)
- [x] Scheduler usa Math.min(messagesPerHour, contatosPendentes)

## Atualização contatos dinâmicos = msgs/hora × 12 (06/04/2026)
- [x] totalContacts = messagesPerHour × 12 (múltiplos de 12 pelo ciclo de 12h)
- [x] Quando muda msgs/hora, recalcular contatos e redesignar automaticamente
- [x] 1 msg/h = 12 contatos, 2 = 24, 3 = 36, 4 = 48, 5 = 60
- [x] Limitar msgs/hora pelos contatos pendentes (proteção anti-duplicação)
- [x] Nunca enviar 2 msgs para o mesmo contato
- [x] Atualizar UI para mostrar contatos dinâmicos (mostra mph ×12 = X contatos)

## Relatório WhatsApp a cada fim de ciclo (06/04/2026)
- [x] Enviar relatório via Z-API para (99) 99181-1246 a cada fim de ciclo
- [x] Relatório com: campanha, msgs enviadas, falhas, contatos pendentes, próximo ciclo
- [x] Formato texto limpo para WhatsApp

## Alterar título header Campanhas (07/04/2026)
- [x] Mudar "Campanhas WhatsApp" para "Romatec CRM Campanhas WhatsApp"

## Alterar header Dashboard (07/04/2026)
- [x] Mudar "Romatec CRM / Bem-vindo..." para "Romatec CRM - Customer Relationship Management | CEO José Romário P Bezerra"

## Alterar header Dashboard (07/04/2026)
- [x] Linha 1: "Romatec CRM" (título grande)
- [x] Linha 2: "Customer Relationship Management" (subtítulo)
- [x] Linha 3: "CEO José Romário P Bezerra" (menor, embaixo)

## PWA - Progressive Web App (07/04/2026)
- [x] Criar manifest.json com nome, ícones, cores da Romatec
- [x] Criar service worker para cache offline
- [x] Adicionar meta tags PWA no index.html (iOS e Android)
- [x] Gerar ícones PWA em 9 tamanhos (72-512px + apple-touch-icon)
- [x] Registrar service worker no main.tsx

## Bug: Ícone PWA não aparece na tela inicial (07/04/2026)
- [x] Corrigir apple-touch-icon para iOS (caminho local /apple-touch-icon.png)
- [x] Garantir ícones acessíveis no manifest.json (192 e 512 locais)
- [x] Copiar ícones para client/public/ para iOS encontrar automaticamente

## Persistência do Scheduler + Auto-Restart (07/04/2026)
- [x] Criar tabela schedulerState no banco (status, currentPairIndex, cycleNumber, startedAt, stateJson)
- [x] Salvar estado no banco a cada mudança (start, stop, ciclo, envio)
- [x] Restaurar estado do banco ao iniciar o servidor (restoreAndResume)
- [x] Auto-restart: se status era 'running', reiniciar scheduler automaticamente após deploy
- [x] Campanhas não param mais ao republicar
- [x] 97 testes passando

## Bug: Link /imovel/alacide não funciona (07/04/2026)
- [x] Link da página pública do imóvel não abre quando clicado na mensagem do WhatsApp
- [x] Verificar rota /imovel/:slug no App.tsx
- [x] Verificar se slug "alacide" corresponde ao imóvel no banco

## Fix: Erro React #310 nas páginas públicas de imóveis (07/04/2026)
- [x] Corrigir erro "Rendered more hooks than during the previous render" no PropertyPublic.tsx
- [x] Mover todos os useState para ANTES dos returns condicionais (loading/not found)
- [x] Mover array especialistas para fora do componente (constante)
- [x] Testar todas as 4 páginas: /imovel/alacide, /imovel/mod-vaz-01, /imovel/mod-vaz-02, /imovel/mod-vaz-03
- [x] Confirmar links corretos nas mensagens das campanhas (slugs com hífen, não underscore)
- [x] 97 testes passando, TypeScript sem erros

## Dashboard de Performance (07/04/2026)
- [x] Criar procedure tRPC para estatísticas de performance (msgs por dia, taxa sucesso, por campanha)
- [x] Criar página Performance.tsx com gráficos (Chart.js/Recharts)
- [x] Gráfico 1: Barras de envios últimos 7 dias + Área chart evolução 30 dias
- [x] Gráfico 2: Taxa de sucesso vs falha por campanha (pizza/donut)
- [x] Gráfico 3: Progresso por campanha (barras - enviados/pendentes/total)
- [x] Gráfico 4: Evolução de envios ao longo do tempo (linha)
- [x] Cards resumo: total enviadas, taxa sucesso, média por dia, campanhas ativas
- [x] Adicionar navegação para Performance no Dashboard principal
- [x] Tema dark premium consistente com o resto do sistema
- [x] Testes automatizados da procedure performance.getStats (3 testes integração, 100 total passando)


## Bot Inteligente com Interação (07/04/2026)
- [x] Criar webhook para receber mensagens da Z-API (POST /api/webhook/zapi)
- [x] Implementar lógica de IA para entender intenção do cliente (IA analisa "Oi", "Áudio", interesse)
- [x] Transcrição de áudio com Whisper API (quando cliente manda áudio)
- [x] Resposta persuasiva inicial com qualidades do imóvel + condições
- [x] Integrar simulador de financiamento (Caixa 10.26%, Itaú 11.60%, Santander 11.69%, Bradesco 11.70%, BB 12.00%)
- [x] Simular financiamento em 240x com taxa real + TR (conforme orçamento do cliente)
- [x] Recomendação de imóveis por orçamento (210k, 250k, 300k, 380k)
- [x] Fluxo de qualificação: quando cliente interessado → enviar link com botão para escolher atendente (Romário/Daniele)
- [x] Enviar link de simulação completa para cliente visualizar todos os bancos
- [x] Testes de integração com Z-API (receber/responder mensagens)
- [x] Testes com áudio (transcrição + resposta)
- [x] Testes de simulação (cálculos corretos, taxas reais) — 108 testes passando

## Ajustes Ciclo + Bot Parcelas (07/04/2026)
- [x] Ciclo fixo 24h: scheduler sempre roda 24 ciclos (1 ciclo = 1 hora, 24 ciclos = 1 dia)
- [x] Ao final de 24h encerra ciclo e inicia novo automaticamente
- [x] Estatísticas por ciclo diário (envios, cliques, interações, leads qualificados)
- [x] Bot envia parcelas simples no WhatsApp: 240x (20 anos) e 300x (25 anos) com Caixa
- [x] Remover página de simulador web (desnecessário) — não foi criada
- [x] Não criar simulador interativo — foco é captar e vender
- [x] Investigar 3+ falhas: números inválidos (12, 13, 15 dígitos) causando erro 400 Z-API
- [x] Validar formato de telefone antes de enviar (55+DDD+9+8dígitos = 13 dígitos)
- [x] Pular números inválidos sem contar como falha (marcar como "invalid")

## Limpeza de Contatos Inválidos (07/04/2026)
- [x] Analisar base de 2.544 contatos: identificar números inválidos (!=13 dígitos ou 5º dígito !=9)
- [x] Remover contatos com números inválidos do banco (1.105 removidos)
- [x] Reportar quantos foram removidos e quantos válidos restaram (1.439 válidos)
