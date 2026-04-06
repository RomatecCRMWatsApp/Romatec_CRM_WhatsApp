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
