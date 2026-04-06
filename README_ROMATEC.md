# Romatec CRM WhatsApp

Sistema completo de gestão imobiliária com automação de marketing via WhatsApp para a Romatec Consultoria Imobiliária.

## 🎯 Funcionalidades Principais

### Dashboard
- Visão geral de clientes, imóveis e campanhas
- Status em tempo real da integração Z-API
- Acesso rápido às principais funcionalidades

### Gestão de Clientes
- Importação em lote de contatos (vCard e CSV)
- CRUD completo de clientes
- Histórico de interações
- Bloqueio automático de contatos (3 dias)

### Gestão de Imóveis
- Cadastro de imóveis com fotos e descrição
- Preços e localização
- Status de disponibilidade
- Integração com campanhas

### Campanhas WhatsApp
- Criação de campanhas por imóvel
- Envio automático de 2 mensagens por hora
- Variações de texto para evitar bloqueios
- Controle de status (draft, scheduled, running, paused, completed)
- Botões: Play, Pause, Reset

### Configurações
- Dados da empresa (telefone, endereço)
- Integração Z-API (Instance ID e Token)
- Indicador de status de conexão
- Teste de conexão

### Robô IA
- Análise de sentimento de respostas
- Sugestões de resposta automática
- Métricas de engajamento

## 🚀 Início Rápido

### 1. Instalação

```bash
# Clonar ou extrair o projeto
cd romatec-crm-whatsapp

# Instalar dependências
pnpm install

# Configurar banco de dados
# Veja DEPLOY_LOCAL.md para instruções detalhadas
```

### 2. Configuração

```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar .env com suas credenciais
# - DATABASE_URL
# - ZAPI_INSTANCE_ID
# - ZAPI_TOKEN
```

### 3. Executar

```bash
# Desenvolvimento
pnpm dev

# Produção
pnpm build
pnpm start
```

## 📊 Arquitetura

```
romatec-crm-whatsapp/
├── client/                 # Frontend React
│   ├── src/
│   │   ├── pages/         # Páginas principais
│   │   ├── components/    # Componentes reutilizáveis
│   │   ├── lib/           # Utilitários e hooks
│   │   └── index.css      # Tema (verde escuro + dourado)
│   └── public/            # Assets estáticos
├── server/                 # Backend Express + tRPC
│   ├── routers.ts         # Procedures tRPC
│   ├── db.ts              # Query helpers
│   └── _core/             # Configuração interna
├── drizzle/               # Schema e migrações
│   ├── schema.ts          # Definição de tabelas
│   └── migrations/        # Histórico de migrações
├── seed-db.ts             # Script para popular banco
├── DEPLOY_LOCAL.md        # Guia de instalação local
└── package.json           # Dependências
```

## 🗄️ Banco de Dados

### Tabelas Principais

- **users**: Usuários do sistema (autenticação)
- **contacts**: Clientes/contatos para campanhas
- **properties**: Imóveis para venda/aluguel
- **campaigns**: Campanhas de marketing
- **campaignContacts**: Relação entre campanhas e contatos
- **messages**: Histórico de mensagens enviadas
- **companyConfig**: Configurações da empresa
- **interactions**: Respostas e análise de IA

## 🔌 Integração Z-API

### Configuração

1. Acesse **Configurações** no CRM
2. Insira o **Instance ID**: `3F0D313A38C952B7106F6A1199C38405`
3. Insira o **Token** da sua conta Z-API
4. Clique em **Testar Conexão**

### Envio de Mensagens

O sistema envia automaticamente:
- 2 mensagens por hora (conforme configurado)
- Variações de texto para cada contato
- Rastreamento de entrega e erros

## 📱 Fluxo de Campanha

1. **Criar Campanha**: Selecione um imóvel e adicione variações de mensagem
2. **Selecionar Contatos**: Escolha 12 contatos para a campanha
3. **Iniciar**: Clique em "Play" para começar o envio
4. **Monitorar**: Acompanhe o progresso no dashboard
5. **Pausar/Resetar**: Use os botões conforme necessário

## 🎨 Tema Visual

- **Cores Primárias**: Verde escuro (#1a4d3e) + Dourado (#d4a574)
- **Fonte**: Inter
- **Layout**: Responsivo (mobile, tablet, desktop)
- **Componentes**: shadcn/ui + Tailwind CSS

## 🧪 Testes

```bash
# Executar testes
pnpm test

# Testes com coverage
pnpm test:coverage
```

## 📦 Build e Deploy

### Build para Produção

```bash
pnpm build
```

### Deploy em Servidor Local

Veja [DEPLOY_LOCAL.md](./DEPLOY_LOCAL.md) para instruções completas.

## 🔐 Segurança

- Autenticação OAuth integrada
- Senhas criptografadas
- Variáveis de ambiente protegidas
- Validação de entrada em todas as APIs
- Proteção contra SQL injection (Drizzle ORM)

## 📝 Variáveis de Ambiente

```env
DATABASE_URL          # Conexão com banco de dados
ZAPI_INSTANCE_ID      # Instance ID da Z-API
ZAPI_TOKEN            # Token de autenticação Z-API
COMPANY_NAME          # Nome da empresa
COMPANY_PHONE         # Telefone da empresa
JWT_SECRET            # Chave secreta para JWT
NODE_ENV              # Ambiente (development/production)
```

## 🐛 Troubleshooting

### Erro: Banco de dados não conecta
```bash
# Verificar conexão MySQL
mysql -u romatec -p -h localhost -D romatec_crm -e "SELECT 1;"
```

### Erro: Z-API não conecta
- Verifique o Instance ID e Token
- Certifique-se de que a Z-API está ativa
- Teste a conexão manualmente

### Erro: Porta 3000 em uso
```bash
PORT=3001 pnpm dev
```

## 📚 Documentação

- [DEPLOY_LOCAL.md](./DEPLOY_LOCAL.md) - Instalação em servidor local
- [Drizzle ORM](https://orm.drizzle.team/) - Documentação do ORM
- [tRPC](https://trpc.io/) - Documentação do framework RPC
- [Z-API](https://z-api.io/) - Documentação da API WhatsApp

## 🤝 Suporte

Para problemas ou dúvidas, consulte:
1. Os logs em `.manus-logs/`
2. A documentação incluída
3. O suporte da Z-API

## 📋 Checklist de Implementação

- [x] Banco de dados com todas as tabelas
- [x] Backend com APIs tRPC
- [x] Frontend com dashboard
- [x] Autenticação e logout
- [x] Tema visual (verde + dourado)
- [x] Integração Z-API (básica)
- [ ] Envio automático de mensagens
- [ ] Análise de IA
- [ ] Relatórios avançados
- [ ] Backup automático

## 📄 Licença

Desenvolvido para Romatec Consultoria Imobiliária © 2026

---

**Versão:** 1.0.0  
**Última atualização:** Abril 2026  
**Status:** Em desenvolvimento
