# Notas de versão — Romatec CRM

Cada versão nova vai no TOPO. Depois rode `npm run release` (valida e atualiza o package.json);
ao subir, o servidor grava a versão no banco e todos recebem o aviso "Novidades da versão".

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
