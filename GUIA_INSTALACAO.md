# 🚀 Guia de Instalação - Romatec CRM WhatsApp

## Início Rápido em 5 Minutos

### Pré-requisitos
- Node.js 18+
- MySQL 8.0+ ou TiDB
- npm ou pnpm

### Passo 1: Instalar Dependências

```bash
cd romatec-crm-whatsapp
pnpm install
```

### Passo 2: Configurar Banco de Dados

```bash
# Conectar ao MySQL
mysql -u root -p

# Executar comandos SQL
CREATE DATABASE romatec_crm;
CREATE USER 'romatec'@'localhost' IDENTIFIED BY 'sua_senha';
GRANT ALL PRIVILEGES ON romatec_crm.* TO 'romatec'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Passo 3: Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com:

```
DATABASE_URL="mysql://romatec:sua_senha@localhost:3306/romatec_crm"
ZAPI_INSTANCE_ID="3F0D313A38C952B7106F6A1199C38405"
ZAPI_TOKEN="seu_token_z_api"
JWT_SECRET="chave_secreta_aleatoria"
COMPANY_NAME="Romatec Consultoria Imobiliária"
COMPANY_PHONE="(99) 999169-0178"
NODE_ENV="development"
PORT="3000"
```

### Passo 4: Executar Migrações

```bash
pnpm drizzle-kit migrate
```

### Passo 5: Iniciar o Servidor

**Desenvolvimento:**
```bash
pnpm dev
```

**Produção:**
```bash
pnpm build
pnpm start
```

### Passo 6: Acessar

Abra seu navegador e acesse: **http://localhost:3000**

---

## Próximos Passos

### 1. Configurar Z-API WhatsApp
1. Vá para **Configurações**
2. Insira o **Instance ID**: `3F0D313A38C952B7106F6A1199C38405`
3. Insira o **Token** da sua conta Z-API
4. Clique em **Testar Conexão**

### 2. Importar Contatos
1. Vá para **Gerenciar Clientes**
2. Clique em **Importar Contatos**
3. Selecione arquivo CSV ou vCard
4. Clique em **Importar**

### 3. Criar Campanhas
1. Vá para **Campanhas**
2. Clique em **Nova Campanha**
3. Selecione um imóvel
4. Adicione variações de mensagem
5. Selecione contatos
6. Clique em **Iniciar**

---

## Troubleshooting

### Erro: Porta 3000 em uso
```bash
PORT=3001 pnpm dev
```

### Erro: Banco de dados não conecta
```bash
# Verificar conexão
mysql -u romatec -p -h localhost -D romatec_crm -e "SELECT 1;"
```

### Erro: Dependências não encontradas
```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Erro: Migrações falharam
```bash
# Verificar status do banco
mysql -u romatec -p -D romatec_crm -e "SHOW TABLES;"
```

---

## Estrutura do Projeto

```
romatec-crm-whatsapp/
├── client/              # Frontend React
├── server/              # Backend Express + tRPC
├── drizzle/             # Schema e migrações
├── DEPLOY_LOCAL.md      # Documentação completa
├── README_ROMATEC.md    # Funcionalidades
└── GUIA_INSTALACAO.md   # Este arquivo
```

---

## Documentação Adicional

- **DEPLOY_LOCAL.md** - Instalação detalhada em servidor local
- **README_ROMATEC.md** - Funcionalidades e arquitetura
- **todo.md** - Tarefas e progresso do projeto

---

## Suporte

Para problemas:
1. Verifique os logs em `.manus-logs/`
2. Consulte a documentação incluída
3. Verifique a documentação da Z-API

---

**Versão:** 1.0.0  
**Data:** Abril 2026  
**Desenvolvido para:** Romatec Consultoria Imobiliária
