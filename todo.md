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
- [ ] Listar contatos com paginação
- [ ] Implementar busca e filtros
- [ ] Criar formulário de novo contato
- [ ] Implementar edição de contato
- [ ] Implementar exclusão de contato
- [ ] Criar funcionalidade de importação (vCard e CSV)
- [ ] Exibir histórico de interações por contato

## Frontend - Módulo de Imóveis
- [ ] Listar imóveis com cards
- [ ] Criar formulário de novo imóvel
- [ ] Implementar upload de fotos
- [ ] Implementar edição de imóvel
- [ ] Implementar exclusão de imóvel
- [ ] Exibir detalhes completos do imóvel

## Frontend - Módulo de Campanhas
- [ ] Listar campanhas com status
- [ ] Criar formulário de nova campanha
- [ ] Selecionar imóvel para campanha
- [ ] Selecionar contatos para campanha
- [ ] Implementar botões: Play, Pause, Reset
- [ ] Exibir progresso de envio
- [ ] Exibir histórico de mensagens enviadas
- [ ] Implementar pausa de campanha
- [ ] Implementar reset de campanha

## Frontend - Painel de Configurações
- [ ] Exibir dados da empresa (telefone, endereço)
- [ ] Formulário para editar dados da empresa
- [ ] Campo para Instance ID da Z-API
- [ ] Campo para Token da Z-API
- [ ] Indicador de status de conexão Z-API
- [ ] Botão para testar conexão
- [ ] Exibir número de celular vinculado: (99) 999169-0178

## Integração Z-API
- [ ] Configurar autenticação com Z-API
- [ ] Implementar envio de mensagens via Z-API
- [ ] Implementar recebimento de webhooks (respostas dos clientes)
- [ ] Implementar lógica de fila de mensagens
- [ ] Implementar retry automático
- [ ] Monitorar status de conexão

## Robô IA
- [ ] Integrar LLM para análise de mensagens
- [ ] Implementar análise de sentimento
- [ ] Implementar sugestões de resposta
- [ ] Criar dashboard de IA com métricas
- [ ] Implementar logging de interações

## Dados Iniciais
- [ ] Processar e importar contatos do vCard
- [ ] Processar e importar contatos do CSV
- [ ] Cadastrar 4 imóveis fornecidos
- [ ] Fazer upload de fotos dos imóveis
- [ ] Configurar dados da empresa

## Testes
- [ ] Escrever testes unitários com Vitest
- [ ] Testar CRUD de contatos
- [ ] Testar CRUD de imóveis
- [ ] Testar CRUD de campanhas
- [ ] Testar integração Z-API
- [ ] Testar lógica de envio de mensagens
- [ ] Testar importação de contatos

## Documentação e Deploy
- [ ] Criar documentação de instalação local
- [ ] Criar guia de configuração Z-API
- [ ] Criar guia de uso do sistema
- [ ] Empacotar projeto para deploy
- [ ] Criar script de instalação
- [ ] Criar arquivo .env.example
- [ ] Documentar variáveis de ambiente necessárias


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
