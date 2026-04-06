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
