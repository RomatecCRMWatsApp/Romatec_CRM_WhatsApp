# Pendências jurídicas e de negócio — CRM da Romatec

Separação pedida: **(L)** obrigação legal identificada (a confirmar pelo jurídico) · **(T)** recomendação técnica · **(N/J)** decisão de negócio ou jurídica.

## Dados empresariais que faltam (não inventados; configurar por variável de ambiente)
| Variável | Conteúdo | Situação |
|---|---|---|
| `PRIVACIDADE_CONTROLADOR_RAZAO_SOCIAL` | razão social do controlador | PENDENTE |
| `PRIVACIDADE_CONTROLADOR_CNPJ` | CNPJ | PENDENTE |
| `PRIVACIDADE_CONTROLADOR_ENDERECO` | endereço físico | PENDENTE |
| `PRIVACIDADE_EMAIL` | e-mail de privacidade/atendimento | PENDENTE |
| `PRIVACIDADE_ENCARREGADO` | encarregado (ou canal, se dispensado) | PENDENTE — decisão (L/J) |

## Decisões
1. **(L/J)** Papéis de controlador/operador por operação (Romatec × empreendedora/vendedora × imobiliárias parceiras × corretores credenciados).
2. **(L/J)** Bases legais por categoria (`inventario-dados.md`), inclusive LIA para prospecção B2B e para o score/qualificação por IA.
3. **(L/J)** Prazos de retenção (`retencao-e-direitos.md` §6) e prazos de resposta por tipo de pedido (configurar `PRIVACIDADE_PRAZO_DIAS`).
4. **(J)** Revisão e aprovação das minutas `minutas/termos-de-uso.md` e `minutas/aviso-de-privacidade.md`; só então ligar `PRIVACIDADE_MINUTAS_ATIVAS=on` em produção. A versão (`shared/privacidade.ts DOCUMENTOS_PRIVACIDADE`) deve subir a cada alteração de texto.
5. **(N)** Se o aceite dos termos será exigido de usuários existentes e quando (hoje: fica "pendente", sem bloquear nada).
6. **(L/J)** Dependentes menores em `chacaraDependentes` (art. 14) e decisão automatizada (score) — art. 20.
7. **(N)** Ligar o envio do código por WhatsApp (`PRIVACIDADE_ENVIO_CODIGO=whatsapp`) — envia mensagem externa; precisa de aprovação.
8. **(N)** Achados P3 da auditoria: foto de perfil visível a toda a equipe, imóveis inativos no catálogo público, sessão de 1 ano, MFA do administrador.
9. **(N)** Avisos de lead pelo Telegram levam dados pessoais para fora do CRM — manter, reduzir ou trocar.

## Cobrança e contratação (seção 8 do roteiro) — avaliação
- **Compradores de chácaras:** contrato de compra e venda com boletos/Pix pelo Asaas (cartão não é processado pelo CRM; nenhum número de cartão/CVV armazenado). Cancelamento/distrato seguem o contrato e a legislação imobiliária — **(J)**. Webhook do Asaas com token e tratamento idempotente existentes (`server/financeiro/*`, testes `webhook.test.ts`, `confirmacaoPagamento.test.ts`); não foram alterados.
- **Licença SaaS de corretores/empreendedores (`server/saas`):** há planos, teste de 7 dias e cobrança via Asaas. Se o corretor for pessoa física, pode haver relação de consumo: **(L/J)** avaliar CDC art. 49 (arrependimento em 7 dias na contratação a distância), Decreto 7.962/2013 (identificação do fornecedor, resumo do contrato, confirmação) e clareza de renovação/cancelamento. **Nada foi alterado na cobrança** (sem autorização para mudar preço/plano/fluxo). Item pendente.

## Fora do escopo desta entrega
- AvalieImob (outro repositório, tratado separadamente).
- Revisão de contratos publicados e mudanças de preço.
