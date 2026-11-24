# WhatsApp oficial (API da Meta) no CRM Romatec

O CRM manda e recebe mensagens por dois caminhos: a **Z-API** (WhatsApp Web, QR code) e a **API oficial da Meta** (Cloud API). Com `WHATSAPP_PROVIDER=cloud`, tudo sai pela API oficial: robô, retomada, avisos ao José, avisos aos corretores, documentos e vídeos. A Z-API fica de reserva: basta apagar a variável para voltar a ela.

## Por que a API oficial não cai

- Não usa QR code nem WhatsApp Web: o número fica na nuvem da Meta.
- Aceita **número virtual** (fixo VoIP ou celular sem chip no aparelho): a verificação é por SMS ou ligação, uma vez só.
- A Meta controla o volume por **qualidade** e **limite diário**, em vez de bloquear o número sem aviso. O painel do CRM mostra os dois.

## A regra das 24 horas

- O cliente escreveu nas últimas 24 h: o CRM pode mandar texto, foto, vídeo e documento livremente (o robô funciona igual).
- Passou de 24 h ou o cliente nunca escreveu: só sai **modelo aprovado** pela Meta. Por isso o CRM usa dois modelos:
  - **Retomada** (`WHATSAPP_CLOUD_TEMPLATE_RETOMADA`): a primeira mensagem para os leads importados do celular.
  - **Padrão** (`WHATSAPP_CLOUD_TEMPLATE_PADRAO`): quando um aviso ou lembrete do robô é recusado por estar fora das 24 h, o CRM reenvia o mesmo texto dentro deste modelo.
- Disparo de campanha antigo (tela de Campanhas) **não** usa o modelo padrão: fora das 24 h ele falha e fica registrado como falha. Para campanha, crie um modelo de marketing próprio.

## Passo a passo

### 1. Empresa e conta na Meta

1. Acesse business.facebook.com e entre no portfólio da Romatec (ou crie um com o CNPJ).
2. Em **Configurações › Central de segurança**, faça a **verificação da empresa** (documentos do CNPJ). Leva de 1 a 5 dias úteis. Sem ela o número fica limitado.

### 2. App e número

1. Em developers.facebook.com/apps, **Criar app** › caso de uso **Conectar-se com clientes pelo WhatsApp** › escolha o portfólio da Romatec.
2. Em **WhatsApp › Configuração da API**, crie ou escolha a conta do WhatsApp Business e clique em **Adicionar número de telefone**.
3. Informe o número (pode ser virtual), o nome de exibição ("Romatec Imóveis" ou "Bom Jardims") e confirme o código por SMS ou ligação.
   - O número **não pode** estar ativo no WhatsApp de um celular. Se estiver, apague a conta do WhatsApp nesse aparelho antes.
4. Anote o **Phone Number ID** (aparece em Configuração da API).

### 3. Token permanente

1. business.facebook.com › **Configurações › Usuários do sistema** › **Adicionar** (perfil administrador).
2. **Atribuir ativos**: o app (controle total) e a conta do WhatsApp (controle total).
3. **Gerar token** com as permissões `whatsapp_business_messaging`, `whatsapp_business_management` e `business_management`, validade **nunca expira**.
4. Copie o token. Ele não aparece de novo.

### 4. Webhook (mensagens que chegam)

1. No app, **WhatsApp › Configuração › Webhook › Editar**.
2. URL de retorno: `https://SEU-DOMINIO/api/webhook/whatsapp-cloud`
3. Token de verificação: uma senha qualquer que você inventa (a mesma vai em `WHATSAPP_CLOUD_VERIFY_TOKEN`).
4. Depois de verificar, em **Campos do webhook**, assine **messages**.
5. O **App Secret** fica em **Configurações do app › Básico**. Ele vai em `WHATSAPP_CLOUD_APP_SECRET` (se for o mesmo app do Instagram, o `META_APP_SECRET` já serve).

### 5. Modelos para aprovar (Gerenciador do WhatsApp › Modelos de mensagem)

**Retomada** — nome `retomada_bom_jardims`, categoria **Marketing**, idioma **Português (BR)**:

> Olá, {{1}}! Aqui é o José Romário, do Condomínio de Chácaras Bom Jardims, em Açailândia. Você falou com a gente sobre as chácaras e quero te mostrar as novidades. Você pensa em morar, investir ou ter um lugar de lazer?

Exemplo para {{1}}: `Maria`. Adicione dois botões de resposta rápida: **Quero saber mais** e **Não quero receber**. O "Não quero receber" chega como mensagem e o robô já trata como pedido para sair (tira da lista e para de mandar).

**Padrão** — nome `aviso_romatec`, categoria **Marketing**, idioma **Português (BR)**:

> Romatec Imóveis: {{1}}

Exemplo para {{1}}: `Sua visita ao Bom Jardims está confirmada para sábado às 9 h.` Ele carrega avisos e lembretes do robô que caem fora das 24 h. Fica em Marketing de propósito: parte desses lembretes é de venda, e modelo de Utilidade com conteúdo de venda é reclassificado pela Meta.

A aprovação costuma sair em minutos ou em até 24 h.

### 6. Variáveis no Railway

| Variável | Valor |
|---|---|
| `WHATSAPP_CLOUD_TOKEN` | o token permanente do passo 3 |
| `WHATSAPP_CLOUD_PHONE_NUMBER_ID` | o Phone Number ID do passo 2 |
| `WHATSAPP_CLOUD_VERIFY_TOKEN` | a senha inventada no passo 4 |
| `WHATSAPP_CLOUD_APP_SECRET` | o App Secret (ou use `META_APP_SECRET`) |
| `WHATSAPP_CLOUD_TEMPLATE_RETOMADA` | `retomada_bom_jardims` |
| `WHATSAPP_CLOUD_TEMPLATE_PADRAO` | `aviso_romatec` |
| `WHATSAPP_CLOUD_TEMPLATE_IDIOMA` | `pt_BR` (padrão) |
| `WHATSAPP_CLOUD_GRAPH_VERSION` | `v23.0` (padrão) |
| `WHATSAPP_PROVIDER` | `cloud` — **por último**, quando o resto estiver certo |

### 7. Conferir no CRM

Em **Configurações › WhatsApp oficial**:

1. Os quatro itens da lista ficam verdes.
2. **Teste com modelo** para o seu celular. Se chegar, responda a mensagem e faça o **Teste com texto**.
3. **Salvar atalhos no número oficial**: os botões que o cliente vê ao abrir a conversa (conhecer as chácaras, preços, visita, como chegar).
4. O painel inicial passa a mostrar "WhatsApp oficial", a qualidade e o limite de clientes novos por dia.

## Custos (referência; confira a tabela atual da Meta para o Brasil)

- Responder quem escreveu (dentro das 24 h): sem custo por mensagem.
- Modelo de marketing (retomada e padrão): cobrado por mensagem entregue, alguns centavos de real cada.
- O pagamento é no cartão cadastrado em **Gerenciador do WhatsApp › Pagamentos**.

## Limites que continuam valendo

- Número novo começa com limite de **250 clientes novos por dia** e sobe sozinho com boa qualidade. O ritmo da retomada (30 por dia) cabe com folga.
- Se muita gente bloquear ou denunciar, a qualidade cai e o limite diminui. Por isso a retomada continua devagar e só para quem já falou com a Romatec.
- Áudio e foto que o cliente manda chegam ao robô e ao agente de imóveis como antes (o CRM baixa o arquivo da Meta).
- O que só existe na Z-API (ler a agenda de contatos do celular, status de "conectado" do aparelho) não funciona no modo oficial: a importação de contatos segue pelo arquivo .vcf/.csv.
