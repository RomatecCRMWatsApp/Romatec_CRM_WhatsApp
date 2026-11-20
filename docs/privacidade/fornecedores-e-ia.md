# Fornecedores e inteligência artificial — CRM da Romatec

> Lista montada a partir do código (integrações e variáveis de ambiente). **Contratos, regiões, retenção e opções de treinamento NÃO foram verificados** (sem acesso às contas): tudo marcado "a confirmar" depende do responsável. Não afirmamos que os dados ficam no Brasil.

| Fornecedor | Uso no código | Dados enviados | Ativação | Pontos a confirmar |
|---|---|---|---|---|
| Railway | hospedagem, MySQL, logs | todos os dados do CRM | sempre | região, backups, acesso, DPA, transferência internacional |
| Z-API (WhatsApp) | mensagens, webhooks (`server/zapi-integration.ts`) | telefone, nome, texto, mídias, PDFs | config `companyConfig` | contrato, retenção, região |
| Meta (Instagram/Facebook Lead Ads) | webhook e respostas (`server/meta-integration.ts`, `instagramComentarios.ts`) | nome, usuário, mensagens, dados do formulário | variáveis META_* | termos, transferência internacional |
| Asaas | boletos/Pix (`server/financeiro/asaas.ts`) | nome, CPF/CNPJ, e-mail, telefone, endereço do pagador, valores | ASAAS_API_KEY* | contrato, retenção; webhook com token |
| Cloudinary | mídias de imóveis e materiais (`server/cloudinary.ts`) | fotos, vídeos, PDFs de divulgação | CLOUDINARY_* | não subir documentos pessoais; região |
| Telegram | avisos de leads (`server/_core/telegramNotification.ts`) | nome/telefone do lead em notificações | TELEGRAM_* | **minimizar**: avisos levam dados pessoais para fora do CRM |
| Anthropic (Claude) | qualificação de lead, resumo, agente de cadastro, ZAIRA (`server/leads/iaQualificacao.ts`, `iaResumo.ts`, `zaira-*`) | textos de conversa do lead, dados do imóvel | ANTHROPIC_API_KEY, QUALIFICACAO_IA | retenção/treinamento conforme plano contratado; transferência internacional |
| OpenAI | transcrição/geração (`server/_core/voiceTranscription.ts`, `llm.ts`) | áudio e texto de conversas | OPENAI_API_KEY | idem |
| Spedy | NFS-e da camada SaaS | dados do tomador | SPEDY_* | contrato |
| Google Analytics/Ads | medição nas páginas públicas | id de cookie, página, eventos | GA4_MEASUREMENT_ID etc., **só após aceite** | consent mode, retenção na conta Google |
| AWS S3 (SDK presente) | `server/storage.ts` | arquivos | variáveis de storage | confirmar se em uso |

## IA — controles verificados e riscos
- **ZAIRA** (agente com acesso ao banco, GitHub e Railway): procedimentos `zaira.*` são **só do administrador** (`shared/equipe.ts TRPC_SO_ADMIN`); acesso ao banco é **somente SELECT** com bloqueio de palavras-chave e multi-statement (`server/zaira-db-access.ts`). Risco residual: um SELECT ainda lê dados pessoais e os envia ao provedor de IA; injeção de prompt vinda de conversas pode induzir consultas. **Recomendação:** restringir colunas/tabelas consultáveis, registrar consultas e nunca ligar ferramentas de escrita sem confirmação humana no backend.
- Qualificação de leads por IA: o texto da conversa vai ao provedor. Minimização sugerida: não enviar CPF/documentos; o prompt atual não foi alterado.
- Saída da IA é tratada como texto (respostas no WhatsApp); não há execução automática de ações sensíveis identificada fora da ZAIRA.
- Isolamento: conversas da ZAIRA por usuário (admin); qualificação por lead.
- **Pendente:** confirmar nas contas Anthropic/OpenAI a política de retenção e de uso para treinamento (não prometemos opt-out sem verificar).

## Revogação de cookies — limites
A revogação para novos eventos e apaga `_ga*`/`_gcl_*` do domínio; dados já enviados ao Google seguem a retenção configurada na conta Google (fora do controle do app).
