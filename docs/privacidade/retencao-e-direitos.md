# Retenção, descarte e direitos dos titulares — CRM da Romatec

> **Prazos abaixo são propostas técnicas para validação jurídica.** Nenhuma rotina automática de exclusão foi ligada.

## 1. Separação de "excluir" (não confundir)
| Ação | Onde | O que faz | O que NÃO faz |
|---|---|---|---|
| Desativar/excluir **login** de colaborador | Equipe (`ativo=false`) | encerra o acesso na hora | não apaga leads, contratos, carteira nem a empresa |
| Excluir **contato** | Contatos (`contacts.delete`, escopo do corretor) | remove o contato e suas mensagens de campanha | não mexe em lead, contrato, cobrança |
| Atender **pedido de titular** (anonimizar) | `/privacidade/pedidos` (admin) | anonimiza lead, contato, mensagens, eventos, fila, prospecção, convidados e cadastros de pessoa **sem** contrato | não altera partes de contrato, cobranças, assinaturas, auditoria financeira (retenção legal) |
| Excluir **empresa/empreendimento** | não existe rotina; fora do escopo | — | — |

## 2. Fluxo do pedido de titular (implementado)
1. Pessoa (com ou sem conta) abre `/privacidade`, escolhe o tipo (acesso, correção, eliminação, portabilidade, compartilhamento, revogação, oposição…), informa nome e o celular/e-mail usado com a Romatec. Limite: 5 pedidos/h por IP, 3/dia por contato; honeypot.
2. Recebe protocolo `LGPD-AAAA-XXXXXXXX` (aleatório). A resposta pública é igual exista ou não a pessoa na base.
3. **Verificação proporcional:** código de 6 dígitos (30 min, 5 tentativas, guardado só como HMAC) enviado ao contato **informado** (prova controle do canal). O envio só ocorre com `PRIVACIDADE_ENVIO_CODIGO=whatsapp` (Z-API do escritório); sem isso, o administrador confirma a identidade por outro meio e registra a justificativa (obrigatória, vai para a trilha). Representante legal: tratar na verificação manual (procuração) — **procedimento a definir**.
4. Prazo interno (`PRIVACIDADE_PRAZO_DIAS`, padrão 15) conta da verificação. O prazo legal aplicável a cada tipo de pedido **deve ser validado** (o art. 19 prevê prazos específicos para confirmação/acesso; regulamentação da ANPD pode alterar).
5. Admin atribui responsável, muda a situação, registra a resposta (obrigatória para concluir/indeferir), exporta ou anonimiza. Tudo vai para `privacidadePedidoEventos`.
6. A pessoa acompanha pelo protocolo (só tipo, situação e datas).

## 3. Exportação (acesso/portabilidade)
- Só administrador, só com pedido verificado; critérios explícitos (telefone, CPF/CNPJ, e-mail) conferidos linha a linha (últimos 11 dígitos do telefone; doc só dígitos; e-mail exato) — **teste garante que o vizinho de telefone parecido não entra**.
- JSON ou CSV (`secao;id;campo;valor`, UTF-8 com BOM, **células com =,+,-,@ neutralizadas**).
- Link `/api/privacidade/exportacao/<token>` assinado (HMAC), **15 minutos**, e ainda exige sessão de administrador; download registrado na trilha.
- Limites: não inclui arquivos binários (documentos de identidade, PDFs de contrato), conversas guardadas no WhatsApp/Z-API, nem cópias em fornecedores. Dados de terceiros no mesmo registro (ex.: cônjuge numa ficha) **exigem revisão humana** antes do envio. "Portabilidade" em sentido regulatório depende de regulamentação — avaliar.

## 4. Anonimização
- Simulação obrigatória na tela (contagem por tabela + o que fica retido e por quê); execução exige pedido verificado, senha do admin (`exigirAdminComSenha`, com bloqueio após falhas) e digitar `ANONIMIZAR`.
- Idempotente: rodar de novo não encontra o titular (telefone vira `anon-<hash>`).
- **Retidos** (não alterados): `pessoas` ligadas a `contratoPessoas`, `contratos`, `cobrancas`, `recibos`, `pagamentosManuais`, `assinatura*`, `financeiroAuditoria`, `saasNfse`, `autorizacoesVenda` — base: execução de contrato, obrigações legais/fiscais e exercício regular de direitos (**prazos a validar**).
- Fora do alcance da rotina (documentado na própria simulação): backups do banco, histórico no WhatsApp/Z-API e Meta, arquivos no Cloudinary, mensagens já enviadas ao Telegram, dados no Asaas.

## 5. Backups e reaplicação após restore (procedimento proposto — não testado em ambiente real)
- Backups do MySQL do Railway: confirmar ciclo de retenção e acesso restrito (**pendente — sem acesso**).
- Após qualquer restore: reaplicar as anonimizações registradas em `privacidadePedidoEventos` (evento `anonimizacao_executada`) — os critérios ficam no pedido; o administrador repete a execução (idempotente) para cada pedido concluído depois da data do backup. Automação: pendente.
- Soft delete: o CRM usa colunas `excluidoEm` em alguns módulos (ex.: relatórios fotográficos); isso **não** é eliminação. Eliminação efetiva só pela anonimização acima ou exclusão física aprovada.

## 6. Tabela de retenção proposta
| Categoria | Proposta | Fundamento a validar |
|---|---|---|
| Leads sem contrato | 24 meses sem interação → anonimizar | necessidade/finalidade |
| Cookie `rmt_vid` | 180 dias (já no código) | consentimento |
| Partes de contrato, cobranças | duração do contrato + prazo prescricional/fiscal | obrigação legal / defesa |
| Documentos de credenciamento | duração do vínculo + prazo legal | obrigação legal |
| Logs do servidor (Railway) | conforme plano do Railway — confirmar | segurança |
| Pedidos de titular e trilha | 5 anos após conclusão | prova de atendimento |
| Aceites/consentimentos | enquanto a conta existir + prazo prescricional | prova |
