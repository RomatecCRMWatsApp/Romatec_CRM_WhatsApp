# Notas de versão — Romatec CRM

Cada versão nova vai no TOPO. Depois rode `npm run release` (valida e atualiza o package.json);
ao subir, o servidor grava a versão no banco e todos recebem o aviso "Novidades da versão".

## 1.24.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Teste da integração com o Asaas

### Novo
- No Financeiro, o quadro "Integração Asaas" (só administrador): situação da conta — chave aceita, produção ou teste, beneficiário dos boletos e webhook
- Boleto de teste em nome do próprio administrador (valor escolhido, padrão R$ 5,00): cria no Asaas, abre o PDF no modelo do CRM com linha digitável, código de barras e PIX, confere o pagamento e cancela — não é cobrança de contrato

## 1.23.4 — 2026-10-25
tipo: patch
obrigatoria: nao
titulo: Chave do Asaas aceita sem o cifrão

### Correções
- A chave do Asaas pode ser cadastrada sem o "$" do começo (alguns painéis apagam o valor por causa dele); espaços e quebras de linha da colagem são ignorados
- O diagnóstico do Asaas mostra como a variável chega ao servidor (tamanho e começo), sem mostrar a chave

## 1.23.3 — 2026-10-25
tipo: patch
obrigatoria: nao
titulo: Carteirinhas automáticas

### Melhorias
- As carteirinhas são emitidas sozinhas: titular e cônjuge quando o contrato é assinado; cada dependente assim que o cadastro dele fica completo, com a foto
- O botão do quadro de carteirinhas passa a ser só para imprimir o PDF da gráfica

## 1.23.2 — 2026-10-25
tipo: patch
obrigatoria: nao
titulo: Conferência da ligação com o Asaas

### Melhorias
- Diagnóstico do Asaas para o administrador: mostra se a chave do empreendimento foi aceita, o ambiente (produção ou teste), o titular da conta e se o webhook está configurado — sem mostrar a chave

## 1.23.1 — 2026-10-25
tipo: patch
obrigatoria: nao
titulo: Cadastro completo dos dependentes e carteirinha com foto

### Melhorias
- Dependentes com cadastro completo: nome, grau de parentesco, CPF, nascimento, telefone/WhatsApp e e-mail (CPF, telefone e e-mail conferidos)
- Foto 3×4 de cada pessoa no quadro de carteirinhas do contrato — sai na frente da carteirinha
- A carteirinha do dependente só é emitida com nome, CPF, telefone, e-mail e foto; a tela mostra o que falta de cada um
- Cada carteirinha ganha número (ex.: BJ-A05-03), validade de 24 meses e QR de autenticidade próprio, que mostra a foto para a portaria conferir
- Dependente retirado da lista tem a carteirinha cancelada (o histórico fica guardado)

## 1.23.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Dependentes e carteirinhas do condomínio

### Novo
- No cadastro do comprador (novo contrato), a opção de incluir até 6 dependentes — nome, parentesco, nascimento e CPF opcional — ou seguir sem dependentes
- Titular e cônjuge recebem carteirinha automaticamente
- Na ficha do contrato, o quadro "Carteirinhas do condomínio": quem recebe, editar os dependentes e baixar o PDF para a gráfica (tamanho cartão, frente e verso), liberado depois do contrato assinado
- O QR do verso abre a conferência para a portaria: mostra se a carteirinha está válida, sem CPF

## 1.22.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Ficha de credenciamento do corretor

### Novo
- No cadastro de cada corretor, a ficha de credenciamento no empreendimento: dados do empreendimento e do corretor, com o Cartão CRECI, a Certidão de Regularidade e a CNH anexados
- Baixar em PDF ou enviar pelo WhatsApp; o QR da ficha abre uma página que mostra, na hora, se o corretor continua credenciado e com o CRECI em dia
- A ficha só sai com o cadastro completo — a tela mostra o que falta (só o CNAI é opcional)

### Melhorias
- Documentos pessoais começam pela CNH, com o aviso de que ela é obrigatória

## 1.21.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Modelos para baixar, agenda com links e cadastro completo de clientes

### Novo
- Contratos: botão "Baixar modelos (PDF)" com o contrato de compra e venda, o contrato de intermediação, o carnê e o recibo — com cliente exemplo e a faixa "modelo", baixam direto
- Contratos: botões em cada contrato para editar e cancelar (administrador, com a senha) ou pedir o cancelamento (corretor e secretária)
- Agenda de visitas: links para divulgar de cada empreendimento — o de agendamento e o da página do empreendimento — para copiar ou compartilhar
- Agenda de visitas: os pedidos que chegam pelo formulário de agendamento aparecem no topo, com os dados do pedido, para confirmar com o cliente
- Clientes: novo cliente e editar cliente com o cadastro completo (CPF, RG, estado civil, profissão, endereço); com o CPF, o contrato desse cliente já sai preenchido

## 1.20.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Materiais organizados em abas

### Novo
- Materiais de divulgação em abas: Todos, Imagens, Vídeos e PDFs, com a quantidade de cada
- Cada arquivo enviado cai sozinho na aba do seu tipo; dentro de uma aba, o botão de envio só aceita aquele tipo
- A aba escolhida fica lembrada no aparelho

## 1.19.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Medição de anúncios e visitas

### Novo
- Página do Bom Jardims e link de agendamento prontos para Google Analytics e Google Ads: agendamento enviado, clique no WhatsApp e chácara escolhida no mapa
- Aviso de cookies nessas páginas (só quando a medição estiver ligada); nada do Google é carregado antes do visitante aceitar
- As telas do sistema nunca carregam a medição

### Melhorias
- Página do Bom Jardims mais leve no celular (imagem do topo e logotipo no tamanho certo) e com mais texto para quem busca chácara ou terreno em Açailândia
- Endereços que não existem ficam fora do Google

## 1.18.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Bom Jardims no Google

### Novo
- Página do Bom Jardims preparada para o Google: título, descrição e texto sobre o condomínio de chácaras em Açailândia/MA, localização, infraestrutura e documentação
- Perguntas frequentes ampliadas (preço, formas de pagamento, documentação) e dados estruturados para o Google mostrar o empreendimento em destaque
- Botão "Agendar visita" no topo e no fim da página, levando ao formulário de agendamento
- Prévia mais bonita ao compartilhar o link no WhatsApp, Instagram e Facebook

### Melhorias
- Site público abre mais rápido no celular: carrega só a página aberta, não o sistema inteiro
- Mapa do site (sitemap) com a página do Bom Jardims e o agendamento; telas internas, contratos e carnês fora da busca

## 1.17.2 — 2026-10-25
tipo: patch
obrigatoria: nao
titulo: Cloudinary com uma credencial só

### Correções
- A abertura de PDFs do armazenamento passa a usar a mesma credencial do Cloudinary já conferida dos envios de fotos e vídeos
- A mensagem de credencial inválida no envio de materiais indica onde o administrador confere a configuração

## 1.17.1 — 2026-10-25
tipo: patch
obrigatoria: nao
titulo: Escolha da chácara no mapa do agendamento

### Melhorias
- No link de agendamento, o cliente escolhe a chácara de interesse tocando no mapa do empreendimento (o mesmo do sistema, com zoom e o portal de entrada)
- A chácara escolhida fica destacada e preenche o campo; as indisponíveis aparecem em cinza e avisam ao tocar
- Quem preferir ainda pode digitar a unidade ou a quadra

## 1.17.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Aviso de novo lead

### Novo
- Notificação "Novo lead" com som próprio: aviso na tela, sininho e celular sempre que um lead entra (formulário, link de agendamento, WhatsApp e bot)
- Mostra o nome, o empreendimento e, se houver, a cidade e a unidade de interesse

### Melhorias
- Administrador e secretária recebem; o corretor recebe só o lead que é dele; o empreendedor, só os do empreendimento dele

## 1.16.1 — 2026-10-25
tipo: patch
obrigatoria: nao
titulo: Credencial do armazenamento conferida antes do envio

### Correções
- Envio de vídeos e imagens usa só a credencial do Cloudinary que o próprio Cloudinary aceita (CLOUDINARY_URL ou as variáveis separadas), conferida antes de cada envio
- Credencial inválida agora aparece com mensagem clara, e o administrador tem um diagnóstico que mostra qual variável está errada

## 1.16.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Link de agendamento com formulário

### Novo
- Link de agendamento por empreendimento: página com as condições e um formulário (nome, WhatsApp, cidade, unidade de interesse, melhor dia e horário, forma de pagamento e número de pessoas)
- O envio vira lead e pedido de agendamento na agenda, com aviso no sininho, no celular e no WhatsApp de quem recebeu
- Botões "Copiar link de agendamento" e "Compartilhar" nos Materiais do empreendimento e na Área do corretor

### Melhorias
- O link sai com os seus dados e a sua foto, e o lead cai com você; sem link de corretor, fica com o administrador
- Na agenda, o pedido aparece como "Pedido do cliente" com o botão "Confirmar agendamento"

## 1.15.1 — 2026-10-25
tipo: patch
obrigatoria: nao
titulo: Envio de vídeos grandes nos materiais

### Correções
- Vídeos grandes nos Materiais de divulgação voltam a subir: o arquivo vai direto para o armazenamento, em partes, com a porcentagem na tela
- O limite mostrado é o real do plano de armazenamento, e o erro diz exatamente o que aconteceu

## 1.15.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Tabelas de financiamento no Financeiro

### Novo
- Financeiro › Tabelas de financiamento: escolha o empreendimento e veja as condições (à vista total, entrada à vista ou parcelada, saldo em 12 a 120×, juros de 6% a.a.)
- Evolutivo mês a mês (vencimento, parcela, juros, amortização e saldo devedor), igual ao do simulador, por chácara, por área ou por valor
- Baixar PDF da tabela com a marca do empreendimento e "Baixar tabela geral" com todas as chácaras

### Melhorias
- Só aparecem os empreendimentos que você acessa; o PDF sai com os seus dados de contato

## 1.14.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Cancelamento só do administrador, contrato modelo e materiais com a sua foto

### Novo
- Contratos › Baixar contrato modelo (PDF): minuta completa com cliente fictício e todos os anexos, sem criar contrato
- Cancelar contrato, cobrança ou recibo é só do administrador, confirmando com a senha de login
- Corretor e secretária: botão "Solicitar cancelamento do contrato" — o pedido chega ao administrador no sininho e no celular
- Contrato de Intermediação Imobiliária assinado pelo cliente junto com o contrato (ciência dos 2% do corretor, pagos no sinal e não restituíveis)
- Contrato de comissão Empreendedora × Romatec (5%), visível só para o administrador

### Melhorias
- Propostas, folders, links e mensagens saem com o nome, CRECI, telefone, e-mail e foto de quem gera (empreendedor sai com os dados do administrador)
- Quem abre um link compartilhado vê o contato de quem compartilhou
- Cancelar contrato libera a chácara (com o aviso de lote liberado) e cancela as cobranças futuras; tudo fica registrado
- Recibo cancelado aparece como cancelado na verificação pública

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
