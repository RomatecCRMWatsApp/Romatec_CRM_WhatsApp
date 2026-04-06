# Romatec CRM WhatsApp - TODO

## Banco de Dados
- [x] Criar schema Drizzle com tabelas: users, contacts, properties, campaigns, messages, company_config
- [x] Gerar e executar migrações SQL
- [x] Validar estrutura do banco

## Backend (tRPC Procedures)
- [x] Implementar CRUD básico de contatos (create, read, list, import) - faltam update/delete
- [x] Implementar CRUD básico de imóveis (create, read, list) - faltam update/delete
- [x] Implementar CRUD básico de campanhas (create, read, list) - faltam update/delete/start/pause/reset
- [x] Implementar CRUD de configurações da empresa (get, update)
- [ ] Implementar procedures de update/delete para contatos
- [ ] Implementar procedures de update/delete para imóveis
- [ ] Implementar procedures de update/delete/start/pause/reset para campanhas
- [ ] Implementar integração Z-API (validar credenciais, enviar mensagens, receber webhooks)
- [ ] Implementar lógica de envio de 2 mensagens/hora
- [ ] Implementar robô IA para análise de interações
- [x] Criar helpers para queries do banco

## Frontend - Layout e Navegação
- [x] Configurar tema com cores verde escuro e dourado
- [ ] Implementar DashboardLayout com sidebar
- [x] Criar navegação principal (Dashboard, Clientes, Imóveis, Campanhas, Configurações)
- [x] Implementar autenticação e logout

## Frontend - Dashboard
- [x] Criar painel inicial com visão geral
- [x] Exibir contagem de clientes
- [x] Exibir contagem de imóveis
- [x] Exibir campanhas ativas
- [x] Exibir status do robô IA
- [ ] Criar gráficos de desempenho

## Frontend - Módulo de Clientes
- [x] Listar contatos com paginação
- [x] Implementar busca e filtros
- [ ] Criar formulário de novo contato
- [ ] Implementar edição de contato
- [ ] Implementar exclusão de contato
- [x] Criar funcionalidade de importação (vCard e CSV)
- [ ] Exibir histórico de interações por contato

## Frontend - Módulo de Imóveis
- [x] Listar imóveis com cards
- [ ] Criar formulário de novo imóvel
- [ ] Implementar upload de fotos
- [ ] Implementar edição de imóvel
- [ ] Implementar exclusão de imóvel
- [x] Exibir detalhes completos do imóvel

## Frontend - Módulo de Campanhas
- [x] Listar campanhas com status
- [ ] Criar formulário de nova campanha
- [ ] Selecionar imóvel para campanha
- [ ] Selecionar contatos para campanha
- [x] Implementar botões: Play, Pause, Reset
- [x] Exibir progresso de envio
- [ ] Exibir histórico de mensagens enviadas
- [ ] Implementar pausa de campanha
- [ ] Implementar reset de campanha

## Frontend - Painel de Configurações
- [x] Exibir dados da empresa (telefone, endereço)
- [x] Formulário para editar dados da empresa
- [x] Campo para Instance ID da Z-API
- [x] Campo para Token da Z-API
- [x] Indicador de status de conexão Z-API
- [x] Botão para testar conexão
- [x] Exibir número de celular vinculado: (99) 999169-0178

## Integração Z-API
- [x] Configurar autenticação com Z-API
- [x] Implementar envio de mensagens via Z-API
- [ ] Implementar recebimento de webhooks (respostas dos clientes)
- [x] Implementar lógica de fila de mensagens (MessageScheduler)
- [ ] Implementar retry automático
- [x] Monitorar status de conexão

## Robô IA
- [ ] Integrar LLM para análise de mensagens
- [ ] Implementar análise de sentimento
- [ ] Implementar sugestões de resposta
- [ ] Criar dashboard de IA com métricas
- [ ] Implementar logging de interações

## Dados Iniciais
- [x] Processar e importar contatos do vCard
- [x] Processar e importar contatos do CSV
- [x] Cadastrar 4 imóveis fornecidos
- [x] Fazer upload de fotos dos imóveis
- [x] Configurar dados da empresa

## Testes
- [ ] Escrever testes unitários com Vitest
- [ ] Testar CRUD de contatos
- [ ] Testar CRUD de imóveis
- [ ] Testar CRUD de campanhas
- [ ] Testar integração Z-API
- [ ] Testar lógica de envio de mensagens
- [ ] Testar importação de contatos

## Documentação e Deploy
- [x] Criar documentação de instalação local
- [x] Criar guia de configuração Z-API
- [x] Criar guia de uso do sistema
- [x] Empacotar projeto para deploy
- [x] Criar script de instalação
- [x] Criar arquivo .env.example
- [x] Documentar variáveis de ambiente necessárias


## Redesign Visual (NOVO)
- [x] Atualizar tema com cores vibrantes (gradientes, efeitos)
- [x] Implementar botões 3D com sombras e efeitos hover
- [x] Redesenhar cards com bordas arredondadas e gradientes
- [x] Adicionar animações suaves e transições
- [x] Atualizar paleta de cores (manter verde + dourado + cores vibrantes)

## Aba de Campanhas (NOVO)
- [x] Criar página de Campanhas com monitoramento em tempo real
- [x] Exibir cronômetro de envio (horas:minutos:segundos)
- [x] Mostrar progresso do ciclo (percentual)
- [x] Listar estatísticas: enviadas, faltam, ciclo atual, taxa do dia
- [x] Implementar controle de contatos (expandir/colapsar)
- [x] Adicionar botões de controle: Play, Pause, Reset (3D)
- [x] Mostrar próximo ciclo em tempo real
- [x] Exibir ciclo vigente e próximo ciclo
- [x] Mostrar tabela de campanhas com mensagens
- [x] Listar contatos por campanha

## Migração de Dados (NOVO)
- [x] Carregar imóveis na página de Gerenciar Imóveis
- [x] Carregar contatos na página de Gerenciar Clientes
- [x] Exibir dados com paginação e filtros
- [ ] Implementar CRUD completo (editar, deletar)
- [x] Adicionar busca por nome/telefone

## Painel de Configurações (NOVO)
- [ ] Exibir dados da empresa (nome, telefone, endereço)
- [ ] Mostrar status Z-API (conectado/desconectado)
- [ ] Permitir edição de dados da empresa
- [ ] Testar conexão Z-API
- [ ] Salvar configurações no banco

## Fase 2 - Correção de Dados e Carregamento
- [x] Atualizar CNPJ da empresa (17.261.987/0001-09)
- [x] Atualizar endereço do escritório (Rua São Raimundo, 10 - Centro, Açailândia)
- [x] Carregar 2.568 contatos do vCard no banco de dados (TODOS carregados!)
- [x] Carregar 4 imóveis no banco de dados
- [x] Corrigir queries tRPC para exibição de clientes
- [x] Corrigir queries tRPC para exibição de imóveis
- [x] Corrigir queries tRPC para exibição de campanhas
- [x] Testar carregamento de dados no frontend
- [x] Salvar checkpoint com dados carregados


## Logo e Branding (NOVO)
- [x] Upload do logo da Romatec para CDN
- [x] Exibir logo no header do dashboard
- [x] Exibir logo na página de login
- [x] Usar logo com fundo transparente
- [ ] Adicionar favicon com logo da empresa
- [x] Atualizar branding em todas as páginas

## Sistema de Login (NOVO)
- [x] Criar página de login com OAuth Manus
- [x] Exibir logo no formulário de login
- [x] Redirecionar usuário autenticado para dashboard
- [x] Implementar logout com redirecionamento para login
- [x] Proteger rotas que requerem autenticação


## Fase 3 - Sistema de Automação de Campanhas WhatsApp

### Arquitetura e Schema
- [ ] Criar tabela `campaign_schedules` com ciclos e pares
- [ ] Criar tabela `contact_campaign_history` para rastrear envios
- [ ] Criar tabela `campaign_messages` com variações de texto
- [ ] Adicionar coluna `blocked_until` em contacts para bloqueio de 72h
- [ ] Adicionar coluna `last_campaign_id` em contacts para ciclo

### Scheduler Principal
- [ ] Implementar `CampaignScheduler` com lógica de 2 mensagens/hora
- [ ] Implementar intervalo aleatório (10-30 min) entre mensagens
- [ ] Implementar rotação de pares (1+2 / 3+4)
- [ ] Implementar carregamento dinâmico de campanhas do banco
- [ ] Implementar bloqueio de 3 dias por contato
- [ ] Implementar ciclo de campanhas por contato (1→2→3→4)
- [ ] Implementar loop infinito 24/7
- [ ] Implementar relatório de ciclo 24h

### Controle de Contatos
- [ ] Implementar seleção de contato diferente por envio
- [ ] Implementar verificação de bloqueio (72h)
- [ ] Implementar verificação de ciclo de campanha
- [ ] Implementar reset automático de contatos
- [ ] Implementar status tracking (pending/sent/failed)

### Dashboard de Monitoramento
- [ ] Criar página de "Monitoramento em Tempo Real"
- [ ] Exibir total de contatos
- [ ] Exibir quantidade enviada
- [ ] Exibir quantidade restante
- [ ] Exibir número de falhas
- [ ] Exibir taxa de sucesso (%)
- [ ] Exibir cronômetro de execução
- [ ] Exibir número do ciclo atual
- [ ] Exibir status dinâmico das campanhas
- [ ] Exibir próximo ciclo em (countdown)
- [ ] Exibir lista de contatos com status

### Integração Z-API
- [ ] Implementar envio real de mensagens via Z-API
- [ ] Implementar tratamento de erros e retry
- [ ] Implementar logging de envios
- [ ] Implementar webhook para respostas

### Testes e Validação
- [ ] Testar lógica de 2 mensagens/hora
- [ ] Testar intervalo aleatório (10-30 min)
- [ ] Testar rotação de pares
- [ ] Testar bloqueio de 3 dias
- [ ] Testar ciclo de campanhas por contato
- [ ] Testar loop infinito 24/7
- [ ] Testar relatório de ciclo 24h
- [ ] Testar dashboard em tempo real
- [ ] Testar integração Z-API
- [ ] Validar comportamento humano (sem padrões)


## Fase 4 - Sistema Dinâmico Vinculado a Imóveis
- [x] Scheduler 100% dinâmico: campanhas = imóveis ativos
- [x] Auto-detecção de novos imóveis no ciclo
- [x] Remoção automática de imóveis vendidos do ciclo
- [x] Pares dinâmicos (adapta a qualquer quantidade de imóveis)
- [ ] Toggle por campanha: ativo/pausado no loop
- [x] Contatos em rodízio sem repetição
- [x] Mensagens personalizadas e variadas por campanha
- [ ] Dashboard com controle dinâmico de campanhas
- [ ] Testes do sistema dinâmico

## Servidor Local
- [ ] Preparar pacote para instalação em servidor local
- [ ] Documentação de instalação local
- [ ] Script de setup automático
