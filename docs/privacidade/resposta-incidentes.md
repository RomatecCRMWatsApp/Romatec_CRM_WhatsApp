# Roteiro de resposta a incidentes de segurança com dados pessoais — CRM da Romatec

> Responsáveis e canais marcados **PENDENTE** dependem de decisão do proprietário. **Nenhum disparo automático** de comunicação à ANPD ou aos titulares foi configurado: toda comunicação é decidida por pessoa responsável após avaliação.

## Papéis (preencher)
- Coordenador do incidente: **PENDENTE**
- Técnico de plantão (Railway/código): **PENDENTE**
- Jurídico/encarregado: **PENDENTE**
- Comunicação com titulares/clientes: **PENDENTE**

## 1. Identificação (até 1 h após o alerta)
Fontes: alertas do Railway, `/api/saude`, auditoria financeira (`financeiroAuditoria`), auditoria SaaS (`auditoriaAcesso`), trilha de privacidade, relato de usuário/titular. Abrir registro interno com data/hora, quem detectou, sistemas e dados possivelmente afetados.

## 2. Contenção
- Desativar acesso suspeito: Equipe → desativar usuário (a sessão cai na hora); "sair dos outros aparelhos".
- Credencial vazada: rotacionar no provedor (Asaas, Z-API, Cloudinary, Anthropic/OpenAI, Telegram) **com aprovação**, atualizar a variável no Railway e reiniciar. Trocar `JWT_SECRET` invalida todas as sessões e links assinados (impacto: todos deslogam; links de PDF/carnê/exportação antigos param).
- Desligar integrações afetadas por configuração (ex.: `QUALIFICACAO_IA=off`).

## 3. Preservação de evidências
Exportar logs do Railway do período (os logs já saem com telefone/CPF/e-mail/tokens redigidos), snapshot do banco com acesso restrito, registros de auditoria. Não copiar bases inteiras para fora do ambiente controlado; registrar quem acessou as evidências.

## 4. Avaliação de risco
Quais categorias (documentos de identidade, CPF, dados financeiros, dependentes menores são alto risco), quantos titulares, se dados estavam cifrados (`.pfx` dos certificados: AES-256-GCM), probabilidade de dano. Registrar a decisão e seus fundamentos.

## 5. Comunicação (decisão humana)
Avaliar com o jurídico a obrigação de comunicar ANPD e titulares conforme o art. 48 da LGPD e o regulamento de comunicação de incidentes da ANPD **vigente** (prazos e conteúdo devem ser conferidos na data do incidente). Modelo de mensagem: **PENDENTE de aprovação jurídica**.

## 6. Recuperação
Corrigir a causa, restaurar serviço, reaplicar anonimizações após eventual restore (ver `retencao-e-direitos.md` §5), monitorar.

## 7. Pós-incidente
Relatório com linha do tempo, causa raiz, impacto, ações; atualizar este roteiro e o checklist.
