# Guia de Deploy - Romatec CRM WhatsApp em Servidor Local

Este documento fornece instruções completas para instalar e executar o CRM Romatec em seu servidor local ou máquina pessoal.

## Pré-requisitos

Antes de começar, certifique-se de ter instalado:

- **Node.js** versão 18+ (https://nodejs.org/)
- **npm** ou **pnpm** (gerenciador de pacotes)
- **MySQL 8.0+** ou **TiDB** (banco de dados)
- **Git** (opcional, para clonar o repositório)

### Instalação do Node.js

```bash
# No Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# No macOS (com Homebrew)
brew install node

# No Windows
# Baixe o instalador em https://nodejs.org/
```

### Instalação do MySQL

```bash
# No Ubuntu/Debian
sudo apt-get install mysql-server

# No macOS (com Homebrew)
brew install mysql

# No Windows
# Baixe o instalador em https://dev.mysql.com/downloads/mysql/
```

## Configuração Inicial

### 1. Clonar ou Extrair o Projeto

```bash
# Se você tem o arquivo ZIP
unzip romatec-crm-whatsapp.zip
cd romatec-crm-whatsapp

# Ou se estiver usando Git
git clone <seu-repositorio>
cd romatec-crm-whatsapp
```

### 2. Instalar Dependências

```bash
# Com pnpm (recomendado)
pnpm install

# Ou com npm
npm install
```

### 3. Configurar Banco de Dados

#### Criar banco de dados MySQL

```bash
# Conectar ao MySQL
mysql -u root -p

# Executar os comandos SQL
CREATE DATABASE romatec_crm;
CREATE USER 'romatec'@'localhost' IDENTIFIED BY 'sua_senha_segura';
GRANT ALL PRIVILEGES ON romatec_crm.* TO 'romatec'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

#### Executar Migrações

```bash
# No diretório do projeto
pnpm drizzle-kit migrate
```

### 4. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```bash
# Banco de Dados
DATABASE_URL="mysql://romatec:sua_senha_segura@localhost:3306/romatec_crm"

# Autenticação (deixe em branco se não usar OAuth)
VITE_APP_ID=""
OAUTH_SERVER_URL=""
VITE_OAUTH_PORTAL_URL=""
JWT_SECRET="sua_chave_secreta_aleatoria"

# Z-API WhatsApp
ZAPI_INSTANCE_ID="3F0D313A38C952B7106F6A1199C38405"
ZAPI_TOKEN="seu_token_z_api"

# Empresa
COMPANY_NAME="Romatec Consultoria Imobiliária"
COMPANY_PHONE="(99) 999169-0178"
COMPANY_ADDRESS="Seu endereço aqui"
```

### 5. Popular Banco de Dados (Opcional)

```bash
# Executar script de seed para popular com dados de exemplo
npx tsx seed-db.ts
```

## Executar o Projeto

### Desenvolvimento

```bash
# Iniciar servidor de desenvolvimento
pnpm dev

# O servidor estará disponível em http://localhost:3000
```

### Produção

```bash
# Build do projeto
pnpm build

# Iniciar servidor de produção
pnpm start

# O servidor estará disponível em http://localhost:3000
```

## Acessar o CRM

1. Abra seu navegador
2. Acesse `http://localhost:3000`
3. Faça login com suas credenciais
4. Acesse o dashboard

## Configurar Z-API WhatsApp

1. Vá para **Configurações**
2. Insira o **Instance ID** da Z-API: `3F0D313A38C952B7106F6A1199C38405`
3. Insira o **Token** da Z-API
4. Clique em **Testar Conexão**
5. Se conectado com sucesso, o status mudará para **Conectado**

## Gerenciar Clientes

1. Vá para **Gerenciar Clientes**
2. Clique em **Importar Contatos** para adicionar clientes em lote
3. Ou clique em **Novo Contato** para adicionar manualmente

## Gerenciar Imóveis

1. Vá para **Gerenciar Imóveis**
2. Clique em **Novo Imóvel** para adicionar um imóvel
3. Preencha os dados: nome, endereço, preço, descrição e fotos
4. Clique em **Salvar**

## Criar Campanhas WhatsApp

1. Vá para **Campanhas**
2. Clique em **Nova Campanha**
3. Selecione o imóvel
4. Adicione variações de mensagens
5. Selecione os contatos
6. Clique em **Iniciar Campanha**

## Troubleshooting

### Erro: "DATABASE_URL not set"

Certifique-se de que o arquivo `.env` está configurado corretamente e que o banco de dados está rodando.

```bash
# Verificar conexão com MySQL
mysql -u romatec -p -h localhost -D romatec_crm -e "SELECT 1;"
```

### Erro: "Port 3000 already in use"

Se a porta 3000 já está em uso, você pode mudar a porta:

```bash
PORT=3001 pnpm dev
```

### Erro: "Cannot find module"

Reinstale as dependências:

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Z-API não conecta

1. Verifique se o **Instance ID** e **Token** estão corretos
2. Certifique-se de que a Z-API está ativa na sua conta
3. Verifique a conexão com a internet

## Backup e Restauração

### Fazer Backup do Banco de Dados

```bash
mysqldump -u romatec -p romatec_crm > backup_romatec_$(date +%Y%m%d).sql
```

### Restaurar Banco de Dados

```bash
mysql -u romatec -p romatec_crm < backup_romatec_20260406.sql
```

## Atualizar o Projeto

```bash
# Puxar atualizações (se usando Git)
git pull origin main

# Instalar novas dependências
pnpm install

# Executar migrações
pnpm drizzle-kit migrate

# Reiniciar o servidor
pnpm dev
```

## Segurança

1. **Altere a senha padrão** do MySQL
2. **Use HTTPS** em produção (configure SSL/TLS)
3. **Proteja o arquivo `.env`** - nunca compartilhe com terceiros
4. **Faça backups regulares** do banco de dados
5. **Mantenha o Node.js e dependências atualizadas**

## Suporte

Para problemas ou dúvidas:

1. Verifique os logs em `.manus-logs/`
2. Consulte a documentação do Drizzle ORM
3. Verifique a documentação da Z-API

## Próximos Passos

- Configurar integração com Telegram (opcional)
- Implementar análise de IA para respostas
- Configurar notificações por email
- Implementar relatórios avançados
- Configurar backup automático

---

**Versão:** 1.0.0  
**Data:** Abril 2026  
**Desenvolvido para:** Romatec Consultoria Imobiliária
