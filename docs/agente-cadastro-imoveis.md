# Agente de Cadastro de Imóveis pelo WhatsApp

**Agente:** `property_intake_agent` (Agente de Cadastro de Imóveis Romatec) · **Motor:** `property_intake_engine` (Motor de Cadastro de Imóveis).
Implementação: `server/imoveis/agenteCadastro.ts` (motor), `shared/cadastroImovelAgente.ts` (regras puras e instruções do agente),
`server/routers/agenteImovel.router.ts` (CRM), `client/src/pages/CadastroImovelWhatsApp.tsx` (tela Imóveis › Cadastro pelo WhatsApp).

## Componentes reaproveitados
| Necessidade | Componente real |
|---|---|
| WhatsApp (mesmo número dos leads) | Z-API, webhook `/api/webhook/zapi` (`server/_core/index.ts`), `parseWebhookPayload` (agora lê `image.imageUrl`), envio `leads/zapiClient` |
| Deduplicação de evento | `mensagemNova(messageId)` (antes do agente) + `UNIQUE(vinculoId, messageId)` nas fotos + hash por rascunho |
| Sessão / perfis | cookie JWT com `users.sessaoVersao` (`_core/sdk.ts`), `perfilDe` (`shared/equipe.ts`) |
| Telefone | `users.telefone` + `chaveTelefone` (`leads/numerosDaEquipe.ts`, normalização BR com/sem 9º dígito e 55) |
| IA | Claude (ANTHROPIC_API_KEY, structured outputs) com reserva OpenAI/Forge (`_core/llm.ts`) |
| Transcrição | `_core/voiceTranscription.ts` (Whisper, OPENAI_API_KEY/BUILT_IN_FORGE_API_KEY) |
| Fotos | `cloudinary.ts` (pasta `romatec_imoveis_whatsapp`), `sharp` para conferir e tirar EXIF/GPS |
| Imóvel | `server/imoveis/servico.ts › criarImovel` — o MESMO serviço da tela Imóveis (`properties.create`): ID, código IMV, acesso do corretor, campanha pausada |

## Acesso
- Perfis: administrador, secretária e corretor (`podeUsarAgenteImovel`). Empreendedor bloqueado na tela, nas rotas (`exigir`) e no webhook.
- Vínculo: no CRM logado, "Vincular meu WhatsApp" gera código de uso único (10 min); o usuário manda `VINCULAR 123456` **do número do cadastro**. Outro número com o código é recusado.
- Autorização do canal: presa a `users.sessaoVersao` e ao acesso ao CRM. Administrador e secretária: sem prazo. Corretor: acompanha o plano (teste/assinatura, `resumoLicenca` em `server/saas/servico.ts`) e renova junto com ele; plano vencido/bloqueado bloqueia o canal e o agente manda o link de `/assinatura`. Sair do CRM (logout), trocar a senha, "sair de todos os aparelhos", "Desligar", desativar o usuário ou mudar o perfil derrubam a autorização; o rascunho fica.
- Excluir rascunho: tira o rascunho e as fotos da lista (o imóvel já gravado continua em Imóveis). Excluir o imóvel em Imóveis apaga o rascunho que o gerou (`aoExcluirImovel`). O "Imóvel cadastrado!" leva a `/properties?imovel=ID`, que abre o detalhe.
- WhatsApp do CEO (ZAYRA): o agente só entra com pedido explícito ("cadastrar imóvel", "continuar cadastro") ou fluxo em andamento.

## Fluxo
`menu` → 1 Cadastrar / 2 Continuar / 3 Outras → rascunho privado + checklist (por tipo) → áudio/texto (transcrito; IA extrai só o que foi dito, com trecho de origem; conflito vira pergunta; nada vira zero) → fotos (lote, uma resposta por lote) → `CONCLUIR` (espera as fotos em processamento) → pendências ou revisão versionada (hash de dados + fotos + capa + textos) → `1` Confirmar / `2` Corrigir / `3` Cancelar → gravação única (reserva atômica `saving`, chave `-rascN` no slug para reconciliar queda) → imóvel **Inativo** em Imóveis, com código, galeria (capa primeiro) e campanha pausada.
Foto nova ou correção depois da revisão invalida a versão. Nada é publicado, anunciado, disparado, contratado ou vendido.

## Estados
`collecting`, `awaiting_information`, `awaiting_review`, `saving`, `saved`, `failed`, `cancelled` (modo da conversa: `escolhendo` / `cadastro`, expira em 2 h sem mensagem).

## Configuração (Railway)
- Obrigatório para organizar por IA: `ANTHROPIC_API_KEY` (ou `OPENAI_API_KEY`). Modelo opcional: `ANTHROPIC_MODEL_CADASTRO_IMOVEL`.
- Áudio: `OPENAI_API_KEY` ou `BUILT_IN_FORGE_API_KEY` (transcrição).
- Fotos: credenciais Cloudinary já usadas pelos Materiais.

## Limitações conhecidas (v1)
- Fila em memória por usuário (serializa as mensagens); se o servidor reiniciar no meio do processamento de uma mensagem, ela precisa ser reenviada. A gravação do imóvel é reconciliada.
- Sem análise de imagem: a capa e a ordem das fotos são escolhidas na tela.
- Z-API não tem janela de 24 h da API oficial; o agente só responde mensagens recebidas e não envia lembretes.
- As fotos ficam no Cloudinary em endereço não listado (mesmo armazenamento das demais fotos de imóveis), não em armazenamento privado.
