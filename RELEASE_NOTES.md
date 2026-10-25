# Notas de versão — Romatec CRM

Cada versão nova vai no TOPO. Depois rode `npm run release` (valida e atualiza o package.json);
ao subir, o servidor grava a versão no banco e todos recebem o aviso "Novidades da versão".

## 1.13.1 — 2026-10-24
tipo: patch
obrigatoria: nao
titulo: Mapa da unidade no contrato igual ao do sistema

### Melhorias
- Anexo V do contrato com a planta real do empreendimento, a mesma do mapa do sistema: ruas com os nomes, portal de entrada, rio, APP de 30 m, trilha ecológica, área de vivência e todas as chácaras, com a chácara do contrato em destaque
- Detalhe da chácara em página própria: vértices V1, V2… com coordenadas (UTM SIRGAS 2000 e latitude/longitude), azimute e distância de cada lado, área e perímetro

## 1.13.0 — 2026-10-24
tipo: minor
obrigatoria: nao
titulo: Carnê digital do comprador

### Novo
- Carnê digital pelo QR Code do carnê: o comprador vê as parcelas, quanto já pagou e o saldo devedor
- Boleto e PIX de cada parcela, 2ª via atualizada (até 59 dias de atraso) e "Meus recibos" direto no celular
- Carnês de cada ano para baixar, assim que as cobranças forem emitidas

### Melhorias
- A página mostra só o primeiro nome do comprador e os documentos abrem por links que expiram em 7 dias

## 1.12.0 — 2026-10-24
tipo: minor
obrigatoria: nao
titulo: Assinatura eletrônica do contrato

### Novo
- Contrato › Assinaturas: escolha como cada um assina (eletrônica avançada, gov.br ou certificado ICP-Brasil) e envie os links pelo WhatsApp
- Página de assinatura para o cliente: lê o contrato até o fim e assina com código enviado ao WhatsApp, certificado digital ou gov.br
- Posicionar as assinaturas no PDF (ou deixar o quadro de assinaturas automático no fim)
- Manifesto de assinaturas (Anexo VII) e verificação pública do contrato pelo QR Code, com conferência do arquivo
- Quando todos assinam, o contrato fica ativo sozinho: chácara vendida e plano de cobranças gravado

### Melhorias
- Lembretes automáticos por WhatsApp 1 e 3 dias depois do envio para quem ainda não assinou
- Certificado digital do cliente nunca fica guardado: é usado só na hora da assinatura

## 1.11.0 — 2026-10-24
tipo: minor
obrigatoria: nao
titulo: Contratos e financeiro do contrato

### Novo
- Menu Vendas › Contratos: lista, novo contrato (chácara e plano → comprador e cônjuge → revisão) e ficha do contrato
- Gerar minuta e contrato definitivo com todos os anexos; cada geração vira uma versão guardada
- A ficha mostra o que falta e o que bloqueia o contrato definitivo (registro do parcelamento, licença, credenciais)
- Registrar o contrato assinado: a chácara passa a vendida e o plano de cobranças é gravado
- Aba Financeiro: carnê anual de 12 parcelas ou completo, boleto A4, 2ª via, recibos, link do carnê para o comprador e planilha do plano

### Melhorias
- Criar o contrato já reserva a chácara, sem risco de duas vendas da mesma unidade
- Corretor cria contrato só a partir de lead dele; definitivo, ativação e cobrança ficam com o administrador e a secretaria

## 1.10.1 — 2026-10-24
tipo: patch
obrigatoria: nao
titulo: Memorial e mapa do lote no contrato; beneficiário pela conta Asaas

### Melhorias
- Contrato com o memorial descritivo da chácara (Anexo I) e o mapa individual da unidade (Anexo V), gerados da planta georreferenciada
- Licença de Operação e certidão do registro (Anexo VI) entram quando o administrador anexar; até lá, página "a anexar"
- Beneficiário de boletos, carnê e recibo vem do titular da conta Asaas configurada para o empreendimento

## 1.10.0 — 2026-10-24
tipo: minor
obrigatoria: nao
titulo: Boletos e carnê com a identidade do Bom Jardims

### Novo
- Boleto avulso A4, carnê anual (12 parcelas) e carnê completo com a identidade do Bom Jardims, prontos para a cobrança pelo Asaas
- 2ª via atualizada de parcela vencida (até 59 dias), com IPCA, multa de 2% e juros de 1% ao mês
- Recibo automático a cada pagamento confirmado, com verificação pública pelo QR Code
- Declaração anual de quitação de débitos (Lei 12.007/2009)

### Avisos
- A cobrança fica desligada até a chave do Asaas ser configurada: nada é emitido, cobrado ou enviado ao cliente
- Linha digitável, código de barras e PIX vêm sempre do Asaas

## 1.9.0 — 2026-10-24
tipo: minor
obrigatoria: nao
titulo: Base do módulo de contratos

### Novo
- Base dos contratos do Bom Jardims: cadastro jurídico do empreendimento, compradores, versões do contrato, assinaturas e cobranças (telas nas próximas versões)
- Geração do contrato (CPCV) em PDF com a identidade do Bom Jardims, tabela de pagamento, Estatuto e Diretrizes de Uso anexados

### Avisos
- Antes do registro do parcelamento, o sistema só gera minuta (sem valor contratual), conforme a Lei 6.766/1979, art. 37

## 1.8.1 — 2026-10-24
tipo: patch
obrigatoria: nao
titulo: Botão para testar as notificações

### Novo
- Configurações › Testar notificações (administrador): envia um aviso de teste só para você, com o som de cada tipo e a notificação no celular, sem mexer em nenhum lote

## 1.8.0 — 2026-10-24
tipo: minor
obrigatoria: nao
titulo: Zoom no mapa, à vista total e notificações com som

### Novo
- Zoom no mapa dos lotes: botões + / −, roda do mouse, pinça no celular e arrastar; o clique abre o lote certo em qualquer zoom
- Simulador: opção "À vista (total)" — o lote pago de uma vez com R$ 10.000,00 de desconto, também na proposta e no WhatsApp
- Notificações no sininho: reserva, venda/contrato, lote liberado e sistema atualizado, cada uma com um som
- Notificações no celular mesmo com o CRM fechado (ative no sininho ou em Meu cadastro › Preferências)

### Melhorias
- Corretor só recebe avisos dos empreendimentos habilitados para ele
- Tocar na notificação abre o CRM direto no lote
- Comissão do à vista total: 100% no ato, sobre o valor à vista

### Avisos
- iPhone: para receber notificações com o CRM fechado, adicione o CRM à Tela de Início (iOS 16.4 ou mais novo)

## 1.7.0 — 2026-10-24
tipo: minor
obrigatoria: nao
titulo: Avisos de atualização e tela de descanso

### Novo
- Aviso de nova versão: quando sair uma atualização, aparece a faixa "Nova versão disponível — Atualizar agora"
- "Novidades da versão" ao entrar, uma vez por pessoa, com o que mudou
- Sino de Novidades com o histórico das versões e o número de não lidas
- Tela de descanso depois de 3 minutos parado, com a hora e o selo Romatec (cobre os dados da tela)
- Aviso de lead novo na tela de descanso

### Melhorias
- Tempo da tela de descanso ajustável em Meu cadastro › Preferências (1, 3, 5, 10, 15 min ou desativada)
- Versão do CRM no rodapé do menu

## 1.6.0 — 2026-10-23
tipo: minor
obrigatoria: nao
titulo: Cadastro completo do usuário e credenciais CRECI/CNAI

### Novo
- Foto de perfil por selfie ou upload, com recorte
- Perfis de acesso: Administrador, Secretário(a), Corretor(a) e Empreendedor
- Dados do cônjuge no cadastro quando casado(a) ou em união estável
- Cartão e Certidão de Regularidade CRECI e Certificado CNAI no cadastro, com alerta de vencimento no WhatsApp
- Meu cadastro: cada pessoa mantém os próprios dados e documentos

### Melhorias
- Máscaras automáticas de CPF, RG, telefone e CEP (com busca de endereço)
- Corretor vê só os leads em que é o responsável

### Correções
- Login aceita CRECI, CPF ou e-mail
