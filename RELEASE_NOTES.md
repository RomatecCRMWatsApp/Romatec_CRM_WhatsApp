# Notas de versão — Romatec CRM

Cada versão nova vai no TOPO. Depois rode `npm run release` (valida e atualiza o package.json);
ao subir, o servidor grava a versão no banco e todos recebem o aviso "Novidades da versão".

## 1.72.0 — 2026-10-29
tipo: minor
obrigatoria: nao
titulo: Atender agora

### Novo
- Leads › Atender agora: seus leads em ordem de prioridade, cada um com o motivo — esperando corretor (com o tempo), chácara da fila de espera livre, visita hoje ou amanhã, mensagem do cliente sem resposta, lead novo sem atendimento, quente e esfriando
- Marcação Agora / Hoje / Quando der; botão do WhatsApp (conta como atendido) e "Já atendi" direto na lista
- Atualiza sozinha a cada 30 segundos; o corretor vê só os leads dele, o escritório vê todos

## 1.71.0 — 2026-10-29
tipo: minor
obrigatoria: nao
titulo: Fila de espera por chácara

### Novo
- Na tela do lead, "Fila de espera": o corretor põe o cliente na fila de uma chácara já reservada e vê a posição dele (1º, 2º…)
- Quando a reserva cai (liberada pelo escritório, contrato cancelado ou mudança no mapa), o 1º da fila recebe a mensagem no WhatsApp e o corretor dele recebe o aviso no sininho, no celular e no WhatsApp
- Se o avisado desistir, o próximo é avisado na hora (enquanto a chácara continuar livre)
- Fila de reservas › "Fila de espera": o escritório vê todas as filas, quem já foi avisado, e marca "Reservou" ou "Tirar da fila"

## 1.70.0 — 2026-10-29
tipo: minor
obrigatoria: nao
titulo: Retorno por campanha

### Novo
- Leads › Campanhas de captação: cada campanha mostra o funil completo — visitas realizadas, vendas (contrato assinado) e contratos em andamento — com custo por lead, por visita e por venda, conversão lead → venda, valor vendido e retorno sobre a comissão
- Quadro "Retorno das campanhas" no topo, com o total de todas
- Atribuição pelo 1º toque do lead (a campanha que trouxe o contato)

## 1.69.4 — 2026-10-29
tipo: patch
obrigatoria: nao
titulo: Rastreio dos links de documentos

### Melhorias
- Cada página dos documentos lidos pelo cliente sai carimbada com "Enviado por" — nome, CRECI, código do link e data — no topo e em marca d'água discreta: um print que vazar mostra de qual link saiu
- Cada abertura fica registrada; na aba Contratos › Links para o cliente cada documento mostra quantas vezes foi aberto e quando, e a lista das últimas aberturas (o escritório vê de todos os corretores)

## 1.69.3 — 2026-10-29
tipo: patch
obrigatoria: nao
titulo: Documentos do cliente protegidos contra impressão

### Melhorias
- Páginas de leitura dos documentos: imprimir ou "salvar como PDF" sai em branco; Ctrl/Cmd + P, S, C, A e U bloqueados
- O documento é coberto pela tela "Documento protegido" quando a página perde o foco, vai para segundo plano ou quando se aperta Print Screen (como o ocultar dos apps); um toque volta à leitura

## 1.69.2 — 2026-10-29
tipo: patch
obrigatoria: nao
titulo: Links para o cliente dentro da tela de Contratos

### Melhorias
- Os links de leitura para o cliente agora ficam na própria tela de Contratos, na aba "Links para o cliente" (o atalho do menu abre direto nela)
- Novo link do Contrato de Intermediação Imobiliária (modelo), com os principais pontos da corretagem
- As Diretrizes de Uso aparecem como "Checklist de restrições — Diretrizes de Uso"

## 1.69.1 — 2026-10-29
tipo: patch
obrigatoria: nao
titulo: Água do Bom Jardims — reservatório de 10.000 litros com bombeamento automático

### Correções
- Página do Bom Jardims, buscadores e resposta automática do WhatsApp agora dizem o mesmo: poço artesiano com bombeamento automático e reservatório elevado de 10.000 litros (antes 50 m³ na página e 150 m³ no WhatsApp)

### Avisos
- Memorial de cálculo da reservação e do bombeamento em docs/agua (demanda de 98,4 m³ no dia de maior consumo; bomba e poço de no mínimo 6,2 m³/h)

## 1.69.0 — 2026-10-29
tipo: minor
obrigatoria: nao
titulo: Documentos para o cliente — links só de leitura

### Novo
- Nova tela Vendas › Documentos para o cliente: contrato (minuta), Estatuto, Diretrizes de Uso, tarifa da água, tabela de pagamento, carnê, carteirinha e crachá de visitante, cada um com link para mandar ao cliente
- O link e o texto do WhatsApp saem com o seu código, nome, CRECI e WhatsApp; a página mostra o seu contato
- Página pública no padrão do Bom Jardims: principais pontos em cima e o documento completo embaixo, só para leitura — páginas como imagem com a tarja "somente leitura", sem copiar texto, baixar ou editar, com zoom próprio
- Link único com a lista de todos os documentos

## 1.68.2 — 2026-10-29
tipo: patch
obrigatoria: nao
titulo: Estatuto v1.2 e página do Bom Jardims alinhados ao contrato

### Melhorias
- Estatuto da associação v1.2: Quadra F como área privada e reserva de preservação (fora da doação ao Município), espaços exclusivos de 100 m² só com estruturas removíveis, proibições ambientais e penalidades
- Estatuto: contribuição de R$ 100,00, água faturada pela média CAEMA × SAAE com hidrômetro por conta do associado e reimpressão de carteirinha a R$ 25,00 (1ª via grátis)
- Página do Bom Jardims: textos da água (medição individual por hidrômetro) e da área de vivência (reserva de mata nativa e espaço exclusivo de 100 m²) atualizados

### Correções
- O regime padrão da Quadra F, que ainda dizia "área pública doada ao Município", foi corrigido nos empreendimentos que usavam o texto antigo

## 1.68.1 — 2026-10-29
tipo: patch
obrigatoria: nao
titulo: Contrato v3.1 — Quadra F como reserva de preservação

### Melhorias
- Contrato do Bom Jardims: a área de vivência (Quadra F) passa a constar como área privada do empreendimento, fora da doação ao Município, e reserva de preservação do condomínio
- Espaços exclusivos de 100 m² só em área já aberta, sem desmatar e fora da faixa de preservação do córrego; benfeitorias só leves e removíveis (proibidos casa e chalé); banheiro só com fossa e sumidouro a 15 m do córrego
- Nova cláusula 15.3: flora e fauna intactas (sem desmatar, caçar, pesca predatória, fogo fora das churrasqueiras, sabão ou lixo no córrego), córrego só para banho e lazer de baixo impacto, averbado na matrícula

## 1.68.0 — 2026-10-29
tipo: minor
obrigatoria: nao
titulo: Contrato do Bom Jardims v3 (energia, água, esgoto, venda na planta, recreação e carteirinha)

### Novo
- Contrato CPCV do Bom Jardims na versão 3, no PDF que o corretor gera e no contrato modelo
- Energia: o empreendimento executa a rede, os postes e a iluminação pelo projeto aprovado na Equatorial e entrega a rede; ligação, tipo (monofásico/trifásico) e consumo ficam entre o comprador e a Equatorial
- Água: poço, reservatório e rede em todas as ruas com ponto na frente de cada chácara; hidrômetro e cavalete por conta do comprador; fatura impressa com a tarifa pela média CAEMA × SAAE (novo Anexo VIII, com as tabelas de origem)
- Esgoto: sistema individual obrigatório em cada chácara (fossa séptica + sumidouro ou filtro anaeróbio, ABNT NBR 7229/13969), afastamentos mínimos, projeto-padrão com anuência do SAAE e vistoria antes de ocupar
- Venda na planta: cada aprovação (Equatorial com os ofícios, matrículas individuais, licenças, vistoria) gera termo aditivo
- Espaço de recreação de uso exclusivo de 100 m² por chácara na área de vivência, com tenda e churrasqueira
- Contribuição associativa fixada em R$ 100,00; carteirinhas com 1ª via grátis e reimpressão de R$ 25,00
- Liberação para cercar e construir depois da entrada e da 3ª parcela, com vistoria de medição (1ª grátis; as seguintes pagas ao agrimensor credenciado)

### Avisos
- Contratos já emitidos ou assinados continuam com o PDF da versão deles (v2); só os novos saem na v3
- Valor da contribuição, da reimpressão da carteirinha e do espaço de recreação ficam na configuração do empreendimento
- Reajustou a CAEMA ou o SAAE: troca-se o Anexo VIII (média recalculada), sem aditivo

## 1.67.1 — 2026-10-29
tipo: patch
obrigatoria: nao
titulo: Telas internas com o título certo na aba do navegador

### Correções
- Ranking de vendas, Convites de reunião, Recrutamento, Reuniões, Talonários, Assinatura e SaaS apareciam como "Página não encontrada" no título da aba e no link compartilhado; agora mostram "Romatec CRM"

## 1.67.0 — 2026-10-29
tipo: minor
obrigatoria: nao
titulo: Girar o mapa (como no Google Maps)

### Novo
- Mapa de vendas (site) e mapa temático do empreendimento (CRM) agora giram: dois dedos girando no celular, botões de girar para a esquerda e para a direita, ou Shift + roda do mouse no computador
- Bússola no canto do mapa mostra para onde fica o norte; um toque volta o mapa ao norte
- Códigos das chácaras e nomes ficam sempre de pé, mesmo com o mapa girado
- Girado, dá para afastar até o empreendimento inteiro caber na tela

### Avisos
- O botão "Mapa inteiro" volta ao zoom normal com o norte para cima

## 1.66.1 — 2026-10-29
tipo: patch
obrigatoria: nao
titulo: Alerta de 5 minutos com o link que marca o atendimento

### Correções
- Alerta "está esperando atendimento há 5 min": o link do WhatsApp agora passa pelo CRM e já marca o lead como atendido (antes ia direto para o wa.me e não contava)
- Origem do lead: link com utm_medium=paid (anúncio pago do Instagram/Facebook) entra como "Anúncio", não mais como "Instagram orgânico"
- Aviso de lead novo mostra o nome do empreendimento ("Condomínio de Chácaras Bom Jardims") em vez do código "bom-jardims"

## 1.66.0 — 2026-10-29
tipo: minor
obrigatoria: nao
titulo: Abriu o WhatsApp do lead = atendido; encaminhou para o corretor = em atendimento

### Novo
- Aviso de lead novo (Telegram/WhatsApp): o link "💬 Atender no WhatsApp" abre a conversa com o cliente e já marca o lead como atendido — acaba o alerta de 5 minutos e o card sai de "Novo"
- Dentro do CRM, os botões de WhatsApp da ficha do lead, da lista de leads, do Painel e da Agenda de visitas também marcam o atendimento; mensagem enviada ao cliente pelo CRM também conta
- Secretária pode encaminhar o lead para um corretor (campo Responsável na ficha). Encaminhado conta como "em atendimento" e o corretor recebe o aviso no sininho/push e no WhatsApp, com o link de atender
- Ficha do lead mostra "✅ Atendido" ou "✅ Encaminhado para atendimento" com data e hora

### Avisos
- A pré-visualização automática do link (robôs do WhatsApp/Telegram) não marca atendimento — só o toque de uma pessoa
- Corretor continua sem poder trocar o responsável do lead

## 1.65.0 — 2026-10-29
tipo: minor
obrigatoria: nao
titulo: Simulador de financiamento nos Links de divulgação

### Novo
- Links de divulgação: novo link "Simulador de financiamento (com valores)" — a página em que o cliente escolhe a chácara livre, arrasta a barra da entrada e vê na hora a entrada, as parcelas e o à vista
- O link sai com o código do corretor: a página mostra o cartão dele (foto, nome, CRECI e telefone) e o botão "Quero a chácara" abre o WhatsApp dele com a simulação escolhida (chácara, entrada e parcelas)
- Texto pronto do WhatsApp com a assinatura do corretor, como nos outros links

### Avisos
- O link pessoal que o robô manda para o lead continua igual (atendimento pelo número do sistema)

## 1.64.0 — 2026-10-29
tipo: minor
obrigatoria: nao
titulo: "Quero saber o valor" só depois da ficha completa

### Melhorias
- /obras-bom-jardim (o mesmo link da campanha): "Quero saber o valor" não abre mais o WhatsApp direto — leva à ficha completa (nome e sobrenome, WhatsApp, e-mail, cidade, finalidade, forma de pagamento, prazo e autorização LGPD)
- Só depois da ficha enviada o WhatsApp do corretor abre, com a mensagem já dizendo quem é o cliente, de onde é e o que procura
- O lead entra no CRM com todos esses dados e com a nota calculada (prazo, pagamento e cidade), pronto para o corretor mandar a tabela

### Avisos
- O servidor também recusa o atalho antigo: sem ficha completa não sai link de WhatsApp
- Os links já divulgados continuam valendo, sem precisar trocar nada

## 1.63.0 — 2026-10-29
tipo: minor
obrigatoria: nao
titulo: Tudo que o corretor divulga sai com os dados dele

### Novo
- Materiais: Baixar e Enviar agora geram a peça com os dados de quem está logado — banner com faixa (nome, CRECI, WhatsApp, Instagram e QR do link dele), vídeo com a faixa do corretor e PDF com rodapé em todas as páginas
- O texto que acompanha o material (e o botão de copiar) leva o link com o código do corretor e a assinatura dele
- Links de divulgação: o texto do WhatsApp termina com nome, CRECI, WhatsApp e Instagram do corretor
- /obras-bom-jardim: link de corretor mostra o cartão "Seu corretor" (foto, nome, CRECI e telefone)

### Correções
- /bom-jardims: o cadastro pelo link de um corretor agora vai para ele (antes caía no rodízio)
- /bom-jardims e página da chácara: o topo e a confirmação mostram o corretor do link, não mais o José fixo

### Avisos
- O CRECI só aparece se estiver em Meu cadastro — corretor sem CRECI cadastrado sai só com nome e telefone
- Administrador e secretária têm o botão "Original" para baixar a peça sem os dados do corretor
- Vídeo: se o servidor de mídia não gerar a faixa, o vídeo vai sem ela, mas o texto leva os dados do corretor

## 1.62.0 — 2026-10-29
tipo: minor
obrigatoria: nao
titulo: Links de divulgação com o texto pronto do WhatsApp

### Novo
- Campanhas de captação ganhou a aba "Links de divulgação" (também no menu Leads): cada link com o texto do WhatsApp pronto, botões Enviar no WhatsApp, Copiar texto, Copiar link, Compartilhar, QR para baixar e Abrir
- Os links já saem com o código de quem está logado: o cliente que se cadastra por eles cai com aquele corretor, e a campanha (UTM) fica marcada no lead
- Links prontos: Obras iniciadas (campanha do Instagram), página do Bom Jardims, agendamento de visita e localização no Google Earth (KML)
- Administrador e secretária cadastram, editam, pausam e excluem links e textos novos, sem precisar de atualização do sistema

### Melhorias
- Página /obras-bom-jardim: o link compartilhado por um corretor leva o lead e o "Quero saber o valor" para ele; sem código no link, continua o rodízio

## 1.61.0 — 2026-10-29
tipo: minor
obrigatoria: nao
titulo: Página da campanha das obras do Bom Jardim (/obras-bom-jardim)

### Novo
- Página pública romateccrm.com/obras-bom-jardim com o vídeo das obras no topo (autoplay mudo, botão de som), lançamento oficial em 14 de novembro e os destaques do empreendimento
- Cadastro curto (nome + WhatsApp): o lead entra no CRM com origem Instagram e campanha IG-OBRAS-NOV26, com corretor do rodízio e o aviso de lead novo (sininho, som e push)
- "Quero saber o valor" abre o WhatsApp do corretor da vez com a mensagem pronta; "Agendar visita" leva ao agendamento do Bom Jardims já com o corretor da vez
- Prévia bonita ao compartilhar o link (título, descrição e imagem do vídeo) e botão do Instagram @avalieimob

### Melhorias
- Agendamento público: o link com UTM (ex.: utm_source=instagram) grava a origem e a campanha no lead, em vez de "site"

### Avisos
- Cliques e cadastros da campanha ficam registrados por corretor (tabela campanhaCliques) para medir o resultado

## 1.60.0 — 2026-10-29
tipo: minor
obrigatoria: nao
titulo: Ranking de vendas por corretor e campanha Bonificação Surpresa

### Novo
- Ranking de vendas (menu Vendas › Ranking de vendas): classificação dos corretores por chácaras vendidas, em tempo real
- Seletor de empreendimento no topo (padrão: por empreendimento) e opção "Todos os empreendimentos"
- Campanha Bonificação Surpresa: prêmio ao 1º lugar — Honda Biz 125 EX 2026 0km ou R$ 19.265,00 (FIPE), além dos 2% de comissão
- Prazo da campanha por empreendimento, definido pelo administrador (com a senha): tempo indeterminado (padrão), data de encerramento (editável) ou esgotamento do estoque
- Envio da classificação pelo WhatsApp (administrador e secretária) e botão para copiar a mensagem

### Avisos
- Venda válida = contrato assinado + sinal pago. Empate: vence quem chegou primeiro ao total
- Quando a data chega ou o estoque esgota, a campanha encerra sozinha e o ranking congela para a apuração do vencedor
- Corretor e empreendedor veem só os empreendimentos que acessam; administrador e secretária veem todos

## 1.59.0 — 2026-10-28
tipo: minor
obrigatoria: nao
titulo: Excluir de vez convites, leads e usuários desativados (só o administrador, com senha)

### Novo
- Recrutamento: convite cancelado sai da lista (botão "Cancelados" para ver) e o administrador pode excluir o convite de vez, com a lixeira
- Leads: o administrador exclui de vez os leads descartados e os que vieram de número da equipe (sai também a conversa, os interesses e as visitas)
- Equipe: usuário desativado ganha o botão "Remover". Sem histórico, o cadastro é apagado; com contrato, lead ou lançamento, fica arquivado (sai da lista, botão "Arquivados" para ver) e os contratos e relatórios continuam com o nome dele

### Melhorias
- Recrutamento: convidar de novo o mesmo WhatsApp atualiza o convite que já existe (o cancelado volta a valer) em vez de criar outro; os duplicados antigos aparecem marcados como "duplicado"

### Avisos
- Toda exclusão pede a senha de login do administrador e fica registrada na auditoria. Corretor e secretária não excluem
- Contratos não têm exclusão: continuam como "cancelado" pela retenção legal
- Lead com contrato ou chácara vinculada não pode ser excluído (só descartado)

## 1.58.2 — 2026-10-28
tipo: patch
obrigatoria: nao
titulo: Mensagem de corretor, secretária e equipe no WhatsApp não vira mais lead

### Correções
- WhatsApp: quando alguém da equipe (corretor, corretora, secretária, administrador, empreendedor, corretor externo) ou o próprio número da empresa manda mensagem, o sistema não cria lead nem dispara o aviso de "Novo lead", e o robô de captação não responde. O número é reconhecido com ou sem 55, com ou sem o 9 e com qualquer máscara

### Avisos
- Na tela de Leads, o administrador vê a lista dos leads que já tinham sido criados por engano a partir de número da equipe, com o nome de quem é, e pode descartar cada um (nada é apagado sozinho)

## 1.58.1 — 2026-10-28
tipo: patch
obrigatoria: nao
titulo: Formulário de cadastro do corretor não apaga mais o que foi digitado ao anexar documento

### Correções
- Formulário de cadastro do recrutamento: ao anexar ou remover uma certidão ou documento, os campos já preenchidos (e ainda não salvos) eram apagados. Agora o anexo entra sem mexer no resto do formulário

## 1.58.0 — 2026-10-28
tipo: minor
obrigatoria: nao
titulo: Convites de reunião com link de confirmação de presença

### Novo
- Convites de reunião (menu Leads): o escritório cria a reunião com título, empreendimento, data, hora, local ou link de videochamada, descrição e um folder (imagem ou PDF), e vê quem confirmou, quem não pode ir e quem ainda não respondeu, com a contagem
- Cada convidado da lista (nome e WhatsApp) recebe um link próprio, e o sistema já sabe quem respondeu. Há também um link geral para mandar em grupos: quem abre informa nome e WhatsApp antes de responder
- O convite sai pelo WhatsApp com um clique, para todos os pendentes ou para uma pessoa só (reenviar), e cada link pode ser copiado
- Quando alguém confirma presença, o administrador e a secretária recebem a notificação no sininho e no celular
- Corretor e empreendedor veem as reuniões dos empreendimentos deles e quem confirmou, sem editar. O empreendedor abre pelo botão "Reuniões" no portal

## 1.57.1 — 2026-10-28
tipo: patch
obrigatoria: nao
titulo: Diretrizes de Uso em documento digital com a marca Bom Jardims

### Melhorias
- As Diretrizes de Uso que vão em cada contrato agora são um documento digital, com o timbre do Bom Jardims e uma tabela organizada: as 45 atividades com a opção escolhida pela proprietária (Permitido, Com condições ou Proibido), a regra de cada uma e os parâmetros (R$ 100,00 por chácara, rateio igual por unidade, 3 veículos, recuos de 10 m e 5 m, ocupação de 30%, até 2 pavimentos). Antes ia a cópia escaneada

## 1.57.0 — 2026-10-28
tipo: minor
obrigatoria: nao
titulo: Contratos: Diretrizes de Uso da proprietária, Estatuto e todos os modelos na aba Contratos

### Novo
- Aba Contratos: além do CPCV, da intermediação, do carnê e do recibo, agora também dá para baixar as Diretrizes de Uso, o Estatuto da associação, a tabela de pagamento (Anexo II) e o modelo de boleto

### Melhorias
- Todo contrato novo leva as Diretrizes de Uso marcadas e preenchidas pela proprietária, no lugar do checklist em branco
- Contribuição associativa: R$ 100,00 por mês por chácara, com valor igual para todas, seja qual for a área (antes o texto dizia "proporcional à área"). Mudou no contrato e no Estatuto
- Estatuto (versão 1.1): cada chácara pode cadastrar até 3 veículos na portaria. O texto pode ser ajustado ao longo do tempo, e os contratos seguintes já saem com a versão nova

### Avisos
- Contratos já gerados continuam com os documentos da época em que foram feitos

## 1.56.1 — 2026-10-28
tipo: patch
obrigatoria: nao
titulo: WhatsApp: descadastro respeitado, sem resposta em dobro e alertas de atendimento

### Correções
- Campanhas: quem pede para sair ("sair", "parar", "não me mande") sai da fila de vez, e o disparo pula quem está descadastrado. Antes, qualquer resposta, até o "parar", recolocava o contato na campanha
- O robô não responde mais duas vezes à mesma mensagem quando o WhatsApp reenvia (resposta demorada) ou quando há duas cópias do sistema no ar
- Alerta de lead sem atendimento: os leads esquecidos que já receberam os 3 avisos não travam mais a fila; o lead novo sempre é avisado, do mais antigo para o mais novo

## 1.56.0 — 2026-10-27
tipo: minor
obrigatoria: nao
titulo: Cobrança mais segura e acesso à ficha do cliente

### Correções
- Assinatura do corretor: o aviso de acesso suspenso no WhatsApp não sai mais de madrugada — quem é bloqueado fora do horário recebe às 9h, e se pagar antes disso o aviso é descartado
- Pix ou boleto estornado/contestado no Mercado Pago agora marca a fatura como estornada (antes o aviso do estorno era ignorado). O sistema também confere de hora em hora as faturas pagas nos últimos 6 meses
- Trocar de plano, ciclo ou forma de pagamento só vale depois que o pagamento é aprovado. Checkout abandonado não muda mais nada na assinatura; ao trocar de cartão, a recorrência antiga é cancelada
- Portal do empreendedor (vendas e financeiro dos compradores): só a empreendedora e o administrador abrem
- Clientes: a ficha completa (CPF, RG, endereço), editar e excluir ficam com o escritório; o corretor só abre o cliente de um lead em que é o responsável. Cadastrar cliente novo continua liberado. Importar contatos em lote é do escritório

## 1.55.1 — 2026-10-27
tipo: patch
obrigatoria: nao
titulo: Corrigir nomes: sugestão pela grafia

### Melhorias
- Corrigir nomes com "?": quem não está na agenda ganha a "Sugestão pela grafia" — o nome é reconstruído pelo que restou ("Alana Vit??ria" → Alana Vitória, "Bruno Le??o" → Bruno Leão) e os emojis, que não dá para recuperar, saem. Acento de palavra conhecida vem marcado; palpite vem desmarcado para você conferir

## 1.55.0 — 2026-10-27
tipo: minor
obrigatoria: nao
titulo: Corrigir nomes de contatos com "?"

### Novo
- Clientes (administrador): aviso com quantos contatos estão com o nome estragado ("?" no lugar de acentos e emojis, da carga inicial dos contatos) e o botão "Corrigir nomes"
- O nome original é buscado pelo telefone na agenda do celular conectado ao WhatsApp do sistema ou num arquivo .vcf (contatos exportados do celular ou do Google). Vem marcado só o nome que bate com o que restou (ex.: "Zez??o" aceita "Zezão"); os diferentes ficam para você conferir. Só muda contato que ainda está com "?"

## 1.54.0 — 2026-10-27
tipo: minor
obrigatoria: nao
titulo: Cabeçalho do empreendimento para o escritório e ficha do cliente arrumada

### Melhorias
- Painel do administrador e da secretária e a tela Empreendimentos ganharam o mesmo cabeçalho dos portais: imagem do portal de entrada ao fundo, logo do empreendimento, cidade e chácaras disponíveis, com o botão para abrir o mapa
- Clientes → Novo cliente / Editar: a ficha abre larga no computador (4 colunas), com 2 colunas no tablet e 1 no celular, sem campos cortados. Órgão e UF do RG ficam lado a lado
- As janelas de credenciais, cadastro de usuário e imóvel também abrem na largura certa no computador

## 1.53.1 — 2026-10-27
tipo: patch
obrigatoria: nao
titulo: Novos preços dos planos do corretor

### Avisos
- Corretor Essencial: R$ 149,90 por mês ou R$ 1.499,00 por ano. Corretor Pro: R$ 299,90 por mês ou R$ 2.999,00 por ano
- O teste grátis continua de 7 dias. Quem já assina passa ao valor novo na próxima cobrança (Pix, boleto e cartão recorrente). Preço negociado e cupom FUNDADOR em vigor continuam valendo até o fim

## 1.53.0 — 2026-10-27
tipo: minor
obrigatoria: nao
titulo: Mudança de preço vale também para o cartão recorrente

### Melhorias
- Admin → SaaS → Planos e cupons: ao mudar o preço de um plano, o sistema pede confirmação e atualiza também as assinaturas pagas no cartão recorrente do Mercado Pago, que passam a cobrar o valor novo na próxima cobrança. Pix e boleto já saem com o valor novo na próxima fatura. Preço negociado e cupom em vigor continuam valendo

## 1.52.0 — 2026-10-27
tipo: minor
obrigatoria: nao
titulo: Ver como (corretor, secretária e empreendedora)

### Novo
- Administração → "Visão portal do corretor", "Visão da secretária" e "Visão do empreendedor" (só o administrador): escolha a pessoa e clique em "Ver como". O sistema abre exatamente como ela vê, com o menu, os empreendimentos e imóveis liberados, os módulos e os dados dela. Serve para conferir na hora se o que você liberou apareceu para a pessoa
- É só visualização: nada pode ser alterado em nome dela (o servidor recusa qualquer ação). Uma faixa embaixo da tela mostra quem está sendo visto e o botão "Sair" para voltar. Vale só na aba aberta, e cada visualização fica registrada

## 1.51.1 — 2026-10-27
tipo: patch
obrigatoria: nao
titulo: Nome "Visão portal do corretor"

### Melhorias
- O item do menu e o aviso da tela passam a se chamar "Visão portal do corretor"

## 1.51.0 — 2026-10-27
tipo: minor
obrigatoria: nao
titulo: Visão do corretor e volta da Visão do empreendedor

### Novo
- Administração → "Visão do corretor" (administrador e secretária): mostra a página inicial como o corretor vê, com o mapa, os atalhos e o painel da chácara só leitura, e o botão "Voltar ao CRM"

### Melhorias
- Visão do empreendedor: botão "Voltar ao CRM" no topo para o administrador e a secretária (a empreendedora não vê)
- Rodapé do portal: o site do responsável técnico agora é romatecavalieimob.com.br

## 1.50.0 — 2026-10-27
tipo: minor
obrigatoria: nao
titulo: NFS-e pela Spedy (homologação)

### Novo
- Admin → SaaS → NFS-e: botão "Emitir NFS-e" em cada nota da fila. A nota vai para a Spedy, fica "enviada · aguardando" e muda sozinha para emitida (com número e os links do PDF e do XML) ou rejeitada (com a mensagem da prefeitura). A rejeitada pode ser corrigida e reenviada sem duplicar
- Painel da integração na mesma aba: ambiente (sandbox ou produção), ambiente da NFS-e na empresa, alíquota de ISS e o webhook, com botão para cadastrar o webhook na Spedy
- Começa em homologação (sandbox). Em sandbox, o CRM recusa emitir se a empresa na Spedy estiver configurada para produção. A chave fica só no servidor
- Nota enviada pela Spedy é cancelada no painel da Spedy; o cancelamento volta para cá sozinho

## 1.49.0 — 2026-10-27
tipo: minor
obrigatoria: nao
titulo: Menu lateral novo

### Melhorias
- Ícones coloridos por grupo para achar mais rápido: geral em rosa, Leads em laranja, Vendas em verde, Financeiro em dourado e Administração em azul
- Os grupos (Leads, Vendas, Administração) abrem e fecham na setinha do título. O grupo da tela em que você está fica sempre aberto
- No computador, "Recolher menu" (embaixo do menu) deixa só os ícones e libera espaço na tela. Passando o mouse, aparece o nome. As escolhas ficam guardadas no seu navegador

## 1.48.0 — 2026-10-27
tipo: minor
obrigatoria: nao
titulo: Despesas no fluxo de caixa

### Novo
- Financeiro → nova aba "Despesas" (administrador e secretária): lance as saídas com descrição, categoria (obras, comissões, marketing, cartório, impostos, projetos, pessoal, administrativo, outros), empreendimento ou escritório, fornecedor, valor e vencimento
- Despesa fixa: "Repetir todo mês por N meses" lança uma por mês no mesmo dia. Dá para lançar já paga
- Pagar (data, valor pago e forma), desfazer o pagamento, editar a que está em aberto, anexar o comprovante (PDF ou foto) e cancelar. Cancelada não some: fica no histórico com o motivo. Na recorrente, dá para cancelar também as próximas
- Filtro por vencimento, empreendimento, categoria e situação (a pagar, vencida, paga, cancelada), totais e planilha
- Fluxo de caixa agora mostra entradas, saídas e o saldo de cada mês, as saídas por categoria e a previsão de cada mês (a receber − a pagar). Filtra por empreendimento ou só o escritório

## 1.47.1 — 2026-10-27
tipo: patch
obrigatoria: nao
titulo: Folder da chácara sem símbolo quebrado

### Correções
- No folder da chácara, a estrela do prazo mais escolhido aparecia como um quadradinho. Agora está escrito "o mais escolhido"

## 1.47.0 — 2026-10-27
tipo: minor
obrigatoria: nao
titulo: Página de oferta, folder por chácara e régua do robô

### Novo
- Página de oferta (romateccrm.com/o/bom-jardims): o cliente simula a chácara que quiser entre as livres, vê quantas restam (atualiza sozinho) e o corretor dele, e toca em "Quero a chácara…" para chamar no WhatsApp
- O robô manda um link pessoal da oferta para cada cliente, e a tela "Respostas automáticas" mostra quem abriu e quantas vezes
- Quando o cliente pergunta por uma chácara livre, o robô manda também o folder dela, gerado na hora com os valores do simulador e o aviso legal
- Régua do robô para quem parou de responder: 24 h (escassez + story), 3 dias (follow-up) e 7 dias (três chácaras livres). No máximo 3 mensagens seguidas, só das 8 h às 20 h. Para sozinha quando o cliente responde, quando o corretor assume ou quando ele pede para sair
- "Respostas automáticas" ganhou os números do robô (conversas, respostas, régua, links abertos, pedidos de fechamento e de visita, descadastros) em 7, 30 ou 90 dias
- Tudo isso só funciona com o robô ligado (continua desligado)

## 1.46.0 — 2026-10-27
tipo: minor
obrigatoria: nao
titulo: Respostas automáticas no WhatsApp (desligadas até a aprovação)

### Novo
- Administração → "Respostas automáticas" (administrador e secretária): o robô responde no WhatsApp os leads do empreendimento com os valores do simulador, os folders e o aviso legal. Ele vem DESLIGADO, e nada muda no atendimento até alguém clicar em "Ligar robô"
- O robô entende a pergunta (valores, à vista, mapa, visita, juros, documentação, uma chácara específica, quero fechar, sair da lista). Se a chácara pedida já saiu, ele oferece as livres mais perto. Se não entender, passa a conversa para o corretor do lead e avisa no sininho
- Pedido de fechamento ou de visita: o corretor do lead é avisado na hora ("Cliente aguardando"). Fora das 8 h às 20 h, o robô só responde o primeiro contato
- Na tela dá para editar o texto de cada intenção, trocar os folders (PNG, JPG ou PDF) e testar na prévia o que o robô responderia, sem enviar nada
- O botão "Assumir conversa" do lead cala o robô para aquele cliente; "Devolver ao bot" volta

## 1.45.0 — 2026-10-27
tipo: minor
obrigatoria: nao
titulo: Carteirinhas oficiais só pelo escritório e pela empreendedora

### Novo
- O corretor continua vendo a prévia dos modelos (carteirinha e crachás), mas o que ele baixa ou imprime sai com a tarja "RASCUNHO · SEM VALIDADE". Isso vale para os modelos, o crachá dele e o PDF das carteirinhas dos contratos dele
- As carteirinhas oficiais, sem tarja, são baixadas pelo administrador, pela secretária e pela empreendedora
- Portal da empreendedora: nova parte "Carteirinhas", com os modelos e a lista dos compradores, cônjuges e dependentes do empreendimento dela, para baixar o PDF oficial (gráfica ou A4)

## 1.44.0 — 2026-10-27
tipo: minor
obrigatoria: nao
titulo: Crachá do corretor

### Novo
- Aba Carteirinhas → Modelos → "Crachá do corretor": crachá vertical (54 × 86 mm) com a marca Romatec, foto, nome, função, CRECI, telefone e um QR que abre o WhatsApp do corretor. É só o cliente apontar a câmera
- Já vem preenchido com o cadastro de quem está logado (nome, CRECI, telefone e foto). Dá para ajustar antes e "Imprimir no tamanho real"

## 1.43.0 — 2026-10-27
tipo: minor
obrigatoria: nao
titulo: Fila de reservas do escritório

### Novo
- Vendas → "Fila de reservas" (administrador e secretária): as reservas que precisam do escritório, ou seja, vencidas (as 72 horas passaram), de corretor sem acesso (pausado, cancelado ou desativado) ou sem corretor. A aba "Todas as reservas" mostra o prazo de cada uma
- Ações em cada chácara: passar para outro corretor habilitado no empreendimento (o lead do cliente vai junto), assumir pelo escritório, prorrogar por 72 horas e liberar para venda. Se houver contrato ligado, cancele pela tela do contrato. Tudo fica no histórico da chácara

### Correções
- Ao pausar o acesso de um corretor, as reservas com entrada também entram no aviso ao escritório (antes só as reservadas). O aviso traz o link da fila

## 1.42.0 — 2026-10-27
tipo: minor
obrigatoria: nao
titulo: Modelos da carteirinha e do crachá

### Novo
- Aba Carteirinhas: quadro "Modelos para apresentar ao cliente" com a carteirinha do condomínio (frente e verso, igual à impressa) e o crachá de visitante, convidado ou prestador da portaria
- Prévia ao vivo: conforme se digita o nome, o vínculo, a chácara (ou o evento e o nº do crachá) e se escolhe a foto, o cartão se monta na tela. A foto fica só no aparelho e não é gravada
- "Baixar modelo em PDF": a carteirinha preenchida, no mesmo formato que vai para a gráfica

## 1.41.0 — 2026-10-27
tipo: minor
obrigatoria: nao
titulo: Upgrade do Essencial para o Pro

### Novo
- Quem tem o Corretor Essencial pago e em dia vê em "Sua assinatura" o cartão "Fazer upgrade para o Corretor Pro", com o AvalieImob incluído
- Paga hoje só a diferença proporcional aos dias que faltam do período já pago (por exemplo, 15 dias restantes = metade da diferença do mês), por Pix ou boleto. O vencimento não muda e da próxima cobrança em diante vale o preço do Pro. Cupom em vigor (como o FUNDADOR) entra no cálculo
- Confirmado o pagamento, o plano vira Pro na hora, o acesso ao AvalieImob é liberado, a recorrência do cartão passa para o valor do Pro, chega o aviso no WhatsApp e a NFS-e entra na fila como "upgrade de plano"

## 1.40.0 — 2026-10-27
tipo: minor
obrigatoria: nao
titulo: Portal da empreendedora de cara nova

### Novo
- Portal da empreendedora começa como o Painel do corretor: logo e portal do empreendimento em destaque, total vendido e o mapa de vendas logo no início. O mapa se atualiza sozinho a cada minuto e tem tela cheia para apresentar
- Clicando numa chácara, a empreendedora vê e atualiza a situação (reservada, vendida, bloqueada), o cliente e os valores. O lead e o corretor da chácara continuam como estão
- Abaixo do mapa, na mesma tela: Vendas (chácaras vendidas, valores, entrada e parcelas), Financeiro e boletos (contratado, recebido, a receber, vencido, contratos e boletos expedidos), Leads e divulgação (gráficos e campanhas), Tabelas de financiamento e Artes. Atalhos no topo levam a cada parte
- Tudo só do empreendimento dela. O telefone dos interessados continua com o corretor (LGPD)

## 1.39.0 — 2026-10-26
tipo: minor
obrigatoria: nao
titulo: Tabela de financiamento por chácara e mapa em tela cheia

### Novo
- Financeiro › Tabelas de financiamento: seletor de chácara sempre à mão, com as setas ‹ › para passar uma a uma e ver o preço, a entrada, as parcelas e o evolutivo de cada chácara
- Quadro "O que é a Tabela Price?", com uma explicação simples para o corretor e o cliente: parcelas iguais, juros sobre o saldo e amortização crescendo mês a mês
- Painel do corretor: mapa de vendas maior e botão "Tela cheia" para apresentar ao cliente

### Correções
- Disparos WhatsApp só para o administrador e a secretária. Some do menu do corretor e da empreendedora e o sistema também recusa o acesso

## 1.38.0 — 2026-10-26
tipo: minor
obrigatoria: nao
titulo: Painel do corretor de cara nova

### Novo
- Painel do corretor redesenhado, no computador e no celular: cabeçalho com a foto do portal e o logo do empreendimento em destaque, "Novo contrato" em dourado e atalhos com ícones coloridos (Leads, Agenda, Simulador, Contratos, Materiais e Novo cliente)
- Quem trabalha em mais de um empreendimento troca de um para outro pelas abas com o logo de cada um
- Mapa de vendas num quadro próprio, com a legenda das situações. No celular, ao tocar numa chácara a tela desce até ela, com o botão "Fazer contrato"

### Correções
- A situação da chácara (disponível, reservada, vendida, bloqueada) só pode ser mudada pelo administrador, pela secretária e pela empreendedora. O corretor vê a chácara e faz o contrato, que reserva por 72 h

## 1.37.4 — 2026-10-26
tipo: patch
obrigatoria: nao
titulo: Empreendimentos: corretor vê só os liberados

### Correções
- Área do corretor e tela Empreendimentos: o corretor vê só os empreendimentos liberados para ele. Os bloqueados não aparecem mais. Administrador e secretária continuam vendo todos

## 1.37.3 — 2026-10-26
tipo: patch
obrigatoria: nao
titulo: Área do corretor: só imóveis liberados

### Correções
- Área do corretor: a lista de imóveis mostra só os liberados para o corretor, igual à tela Imóveis. Os bloqueados não aparecem mais

## 1.37.2 — 2026-10-26
tipo: patch
obrigatoria: nao
titulo: Imóveis: corretor vê só os liberados

### Correções
- Tela Imóveis: o corretor vê apenas os imóveis que o administrador liberou para ele e os que ele mesmo cadastrou. Os demais não aparecem mais

## 1.37.1 — 2026-10-26
tipo: patch
obrigatoria: nao
titulo: Sistema mais rápido: sair e troca de telas

### Correções
- Sair: encerra a sessão e vai direto para o login, sem a tela ficar parada
- Troca de telas sem travar: o carregamento das informações aparece só na barra fina do topo. A tela inteira só é coberta em ações demoradas (salvar, gerar documento) depois de 1 segundo
- Cada informação da tela chega assim que fica pronta, sem esperar a mais lenta. Voltar para a janela do navegador não recarrega tudo de novo

## 1.37.0 — 2026-10-26
tipo: minor
obrigatoria: nao
titulo: Documentos anexados ao contrato

### Novo
- Novo contrato, passo "Comprador": seção "Documentos — anexos do contrato" com documento com foto (frente e verso), CPF, comprovante de endereço, comprovante de renda (se precisar), certidão de casamento e documento do cônjuge (quando casado) e o documento de cada dependente. Aceita PDF ou foto (até 10 MB); os arquivos sobem assim que o contrato é criado
- Tela do contrato: quadro "Documentos anexados" mostra o que já veio e o que falta, e permite enviar, abrir e remover depois. Só o escritório e o corretor do contrato veem os documentos

## 1.36.0 — 2026-10-26
tipo: minor
obrigatoria: nao
titulo: Painel do corretor: mapa do empreendimento e atalhos

### Novo
- O Painel do corretor agora abre direto no mapa do empreendimento em que ele está habilitado. Clicando numa chácara, aparecem a situação e o valor, e um botão "Fazer contrato" quando ela está disponível
- Atalhos no topo: Leads, Novo contrato, Meus contratos, Simulador, Agenda de visitas, Materiais e Novo cliente. Logo abaixo, os links para o cliente (divulgação, agendamento, KML e folder)
- Quem está em mais de um empreendimento escolhe qual ver, e o painel lembra a escolha. Os números e gráficos continuam no painel do escritório

## 1.35.3 — 2026-10-26
tipo: patch
obrigatoria: nao
titulo: Contrato com cliente próprio, sem lead

### Melhorias
- Novo contrato: o lead passou a ser opcional também para o corretor. Com cliente próprio, escolha "Cliente próprio (sem lead)" e faça a reserva e a venda normalmente. O contrato e a comissão ficam com o corretor que criou, e ele continua vendo só os contratos dele

## 1.35.2 — 2026-10-26
tipo: patch
obrigatoria: nao
titulo: Imóveis: mesmo acesso da Área do corretor

### Correções
- Tela Imóveis: o corretor vê "sem acesso" nos imóveis que o administrador ainda não habilitou para ele, igual à Área do corretor. Editar, excluir, QR e link ficam só nos imóveis liberados (o sistema já recusava a ação; agora o botão nem aparece)

## 1.35.1 — 2026-10-26
tipo: patch
obrigatoria: nao
titulo: Pagamentos Pix/boleto conferidos direto no Mercado Pago

### Correções
- Pix e boleto pagos são conferidos direto no Mercado Pago a cada 10 minutos e liberam o acesso mesmo que o aviso automático não chegue. Em Admin › SaaS, o botão "Conferir pagamentos agora" faz a conferência na hora
- Admin › SaaS: se o painel de números falhar, a tela mostra o motivo, e os quadros do Mercado Pago e do AvalieImob continuam disponíveis

## 1.35.0 — 2026-10-26
tipo: minor
obrigatoria: nao
titulo: Assinaturas: NFS-e em fila e AvalieImob no plano Pro

### Novo
- Admin › SaaS → aba "NFS-e": cada fatura paga (Mercado Pago ou registrada à mão) vira uma nota pendente com os dados do cliente do momento do pagamento (nome, CPF, e-mail, endereço) e a descrição pronta. Emita no portal da prefeitura e marque como emitida com o número; exporta CSV para a contabilidade. Pagamento estornado cancela a nota pendente ou avisa para cancelar a já emitida
- Plano Corretor Pro: botão "Abrir AvalieImob" na tela "Sua assinatura" entra no AvalieImob com a mesma conta, sem outra senha (link de uso único, válido por 60 segundos). O acesso é liberado e suspenso sozinho conforme a assinatura, sem mexer em quem já tem plano próprio no AvalieImob
- Admin › SaaS: quadro da integração com o AvalieImob (fica desligada até o segredo compartilhado ser configurado nos dois sistemas)

## 1.34.0 — 2026-10-26
tipo: minor
obrigatoria: nao
titulo: Assinaturas: pagamento pelo Mercado Pago (fase 2)

### Novo
- Tela "Sua assinatura": assinar com cartão (cobrança recorrente no Mercado Pago), Pix (QR Code e copia e cola na hora) ou boleto. O acesso é liberado sozinho assim que o pagamento é confirmado
- Cupom (inclusive o FUNDADOR) conta o uso no 1º pagamento e, acabados os ciclos do desconto, a recorrência volta ao preço normal
- Empreendedor avulso: a 1ª fatura inclui a implantação (Pix ou boleto)
- "Cancelar assinatura": o acesso continua até o fim do período já pago
- Pix/boleto mensal: a fatura do próximo mês sai 5 dias antes do vencimento e o link vai pelo WhatsApp
- Admin › SaaS: quadro do Mercado Pago com o modo (TESTE por padrão, sem dinheiro real), as credenciais e os avisos recebidos. A cobrança real só liga quando o administrador muda para produção
- Segurança: avisos do Mercado Pago só são aceitos com a assinatura secreta; cada pagamento é conferido direto no Mercado Pago; aviso repetido não estende o período duas vezes; estorno só derruba o acesso se não houver pagamento posterior

## 1.33.0 — 2026-10-26
tipo: minor
obrigatoria: nao
titulo: Assinaturas do CRM (fase 1) e talonários

### Novo
- Administração → "SaaS e assinaturas" (administrador): planos com valores editáveis (Corretor Essencial, Corretor Pro, Empreendedor avulso, pacote de gestão e implantação), cupons (inclusive o FUNDADOR para os 20 primeiros corretores) e o painel com MRR, assinantes, testes em curso, conversão, inadimplentes e receita do mês
- O licenciamento começa DESLIGADO: ninguém é cobrado nem bloqueado. Ao ligar, quem já usa o CRM ganha cortesia até a data escolhida e os convites novos têm 7 dias de teste a partir do 1º acesso (um teste por CPF), com lembretes pelo WhatsApp 3 dias antes, na véspera e no dia
- Sem assinatura, o corretor ou o empreendedor vê a tela "Sua assinatura" com os planos, cupom e forma de pagamento; leads atribuídos voltam para a distribuição do escritório e o escritório é avisado das reservas ativas. Pagamento recebido fora do sistema é registrado pelo administrador e libera na hora
- Talonários (administrador e secretária): cadastro de corretor externo (sem login), entrega de blocos numerados de contratos e recibos, lançamento de cada folha com a cópia digitalizada (só do corretor que recebeu o bloco e uma vez só), folhas canceladas/extraviadas e relatório das folhas ainda não devolvidas. Botão "Convidar para o digital"
- Pagamento online (Mercado Pago), NFS-e e acesso ao AvalieImob vêm na fase 2

## 1.32.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Enviar arquivo pelo WhatsApp do sistema

### Novo
- Configurações → "Enviar arquivo pelo WhatsApp" (administrador): escolha o arquivo (PDF, imagem, Word ou Excel, até 15 MB), a pessoa da equipe ou digite o número, escreva o texto e envie pelo WhatsApp do sistema. Pede confirmação antes de enviar

## 1.31.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Recrutamento de corretores, secretárias e empreendedores

### Novo
- Menu "Recrutamento" (só administrador e secretária): convide um corretor(a) ou secretária com nome, WhatsApp e o empreendimento da convocação. O sistema manda pelo WhatsApp o texto com o link do formulário e o formulário em PDF e em DOC, com a marca do Romatec CRM
- Formulário pelo link: o candidato preenche os dados pessoais, CRECI, endereço e cônjuge e anexa a selfie, o documento com foto, o Cartão e a Certidão do CRECI. Dá para salvar e terminar depois. Quando ele envia, o administrador recebe o aviso no WhatsApp
- Conferência e aprovação: veja os dados e os documentos; "Aprovar e criar acesso" cria o usuário com o cadastro e os documentos e manda pelo WhatsApp o login (CRECI ou CPF) com uma senha provisória (vale 7 dias)
- No primeiro acesso com a senha provisória, a pessoa cria a própria senha antes de usar o sistema
- Empreendedor: escolha o empreendimento — nome e CPF vêm do proprietário cadastrado; confira o e-mail e o WhatsApp e o acesso sai na hora, com senha provisória
- "Reenviar acesso (nova senha)" para quem perdeu ou deixou vencer a senha provisória

## 1.30.6 — 2026-10-25
tipo: patch
obrigatoria: nao
titulo: Recibos de pagamento voltam a ser gerados

### Correções
- Os recibos do CRM passam a ficar na tabela própria (crm_recibos). A tabela "recibos" do banco é da ZAYRA, que usa o mesmo MySQL, e por isso o CRM não conseguia gravar o recibo quando uma parcela era paga — nem abrir o carnê digital e a página do contrato com parcelas
- Parcelas que já estavam pagas e ficaram sem recibo recebem o recibo agora (só emitido; o envio ao comprador continua manual)
- Teste novo impede o CRM de usar o nome de uma tabela da ZAYRA. A tabela da ZAYRA não foi alterada

## 1.30.5 — 2026-10-25
tipo: patch
obrigatoria: nao
titulo: Espaço do banco: tabelas compartilhadas com a ZAYRA

### Melhorias
- "Ver espaço" mostra as colunas das tabelas que têm o mesmo nome no CRM e na ZAYRA (recibos, users e outras), para conferir conflitos (só consulta)

## 1.30.4 — 2026-10-25
tipo: patch
obrigatoria: nao
titulo: Espaço do banco: detalhes do MySQL

### Melhorias
- "Ver espaço" também mostra os outros bancos do mesmo MySQL, os arquivos internos e as configurações de logs (só consulta)

## 1.30.3 — 2026-10-25
tipo: patch
obrigatoria: nao
titulo: Espaço do banco nas Configurações

### Melhorias
- Configurações → "Espaço do banco de dados" (administrador): botão "Ver espaço" mostra o tamanho de cada tabela, sem precisar abrir endereço

## 1.30.2 — 2026-10-25
tipo: patch
obrigatoria: nao
titulo: Diagnóstico do espaço do banco

### Melhorias
- Administrador: endereço /api/sistema/espaco mostra o tamanho de cada tabela do banco (só leitura), para acompanhar o espaço do volume do MySQL

## 1.30.1 — 2026-10-25
tipo: patch
obrigatoria: nao
titulo: Reuniões: nada se perde se a transcrição falhar

### Correções
- Se a transcrição falhar (por exemplo, conta da OpenAI sem créditos), o trecho gravado fica guardado e "Tentar de novo" transcreve depois. O áudio é apagado assim que vira texto
- Mensagem clara quando a OpenAI está sem créditos ou com a chave recusada, no lugar do erro técnico

## 1.30.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Reuniões — grave, transcreva e resuma as conversas com clientes

### Novo
- Menu "Reuniões" (em Leads): grave a reunião pelo celular ou pelo computador — o CRM transcreve em português e faz o resumo com o interesse do cliente, dúvidas e objeções, próximos passos e os dados que ele contou
- No computador dá para incluir o som da chamada (Meet, Zoom ou WhatsApp Web). Também dá para importar um áudio (áudio do WhatsApp, MP3, M4A, gravação de ligação)
- A gravação sobe em trechos de 5 minutos enquanto acontece: se a internet cair ou a aba fechar, o que já subiu não se perde
- A reunião fica ligada ao cliente: a ficha do lead mostra as reuniões e tem o botão "Gravar reunião". Botões para copiar o resumo e a transcrição
- Antes de gravar é preciso confirmar que o cliente foi avisado (LGPD). O áudio não fica guardado — só o texto e o resumo. O corretor vê as reuniões dele e as dos clientes dele; o administrador e a secretária veem todas

## 1.29.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Confirmação automática do agendamento pelo WhatsApp

### Novo
- Link de agendamento: ao enviar o formulário, o cliente recebe na hora, pelo WhatsApp do sistema, a confirmação com dia, horário, unidade, pessoas e o corretor que vai atender (nome, CRECI e telefone). A tela de obrigado mostra a mesma confirmação
- O corretor recebe o resumo do novo agendamento (cliente, cidade, unidade, dia, horário, forma de pagamento, pessoas e de qual link veio) no aviso do WhatsApp e no card do agendamento, com o botão "Copiar"
- No card do agendamento (Agenda e ficha do lead): "Enviar confirmação por WhatsApp" (dá para editar o texto e reenviar) e "Abrir no WhatsApp" para continuar a conversa. Sem o WhatsApp do sistema no momento, aparece a mensagem para copiar e o link do WhatsApp com o texto
- Configurações → "Mensagens do agendamento" (administrador): os dois textos são editáveis, com as variáveis, prévia e "voltar ao padrão"

## 1.28.1 — 2026-10-25
tipo: patch
obrigatoria: nao
titulo: Instagram na página do Bom Jardims e nas peças

### Melhorias
- Página pública do Bom Jardims: botão "Siga no Instagram @avalieimob" junto dos contatos e no rodapé (abre em nova aba)
- Cadastro do usuário: campo opcional "Instagram". Quem cadastrar o seu tem ele no link que compartilha, no folder, na proposta e nas mensagens; sem cadastro, vai o institucional @avalieimob
- Materiais de divulgação: quadro do Instagram com abrir, copiar link e compartilhar o perfil

## 1.28.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Extrato por comprador, fluxo de caixa e cobrança por WhatsApp

### Novo
- Financeiro com abas (administrador e secretária): "Extrato por comprador" — cada contrato com contratado, recebido, vencido, a vencer, % pago, situação (em dia, em atraso, quitado), último pagamento e próximo vencimento, com busca, filtro e planilha Excel
- "Fluxo de caixa": recebimentos do período por dia ou por mês com o acumulado, por forma de pagamento, e a previsão de entradas (parcelas em aberto por mês, com o que está em atraso)
- "Cobrança por WhatsApp": lista quem está vencido ou vence nos próximos dias, com a mensagem pronta e o link do carnê digital; só o administrador marca e envia (um por vez, com intervalo), e cada envio fica registrado. Nada é enviado sozinho

## 1.27.1 — 2026-10-25
tipo: patch
obrigatoria: nao
titulo: Contrato com a gestora como recebedora

### Melhorias
- Contrato de compra e venda: os pagamentos passam a ser recebidos pela gestora de vendas (titular da conta Asaas do empreendimento — hoje J R P BEZERRA LTDA, CNPJ 17.261.987/0001-09), por conta e ordem da vendedora; a quitação final continua sendo da vendedora (cláusulas 4ª e 19.3)
- O nome e o CNPJ da recebedora vêm da conta Asaas; sem conta configurada, a minuta avisa e o definitivo não é gerado

## 1.27.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Sincronizar com o Asaas

### Novo
- Botão "Sincronizar com o Asaas" no quadro de pagamentos (administrador e secretária): confere no Asaas cada boleto em aberto e dá baixa nos que já foram pagos — com recibo —, marca os vencidos e aplica cancelamentos e estornos
- Serve para quando algum aviso automático do Asaas não chegou; rodar de novo não repete baixa nem recibo

## 1.26.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Lançar pagamento com o recibo da InfinitePay

### Novo
- No Financeiro, "Lançar pagamento" (administrador e secretária): PIX, transferência, dinheiro ou cartão recebidos fora do boleto
- Cole o link do recibo da InfinitePay e o sistema preenche valor, data, pagador, CPF parcial e ID da transação — e avisa se o recebedor não for a Romatec / J R P BEZERRA LTDA
- Um pagamento pode quitar parcelas de mais de um contrato (rateio); cada parcela é quitada inteira, com recibo emitido e enviado ao comprador
- Parcela com boleto no Asaas: o Asaas é avisado do recebimento e o boleto deixa de poder ser pago em dobro
- Proteções: PIX exige o ID da transação, o mesmo comprovante não é lançado duas vezes, e CPF de outra pessoa exige o vínculo de quem pagou

## 1.25.0 — 2026-10-25
tipo: minor
obrigatoria: nao
titulo: Tela de Carteirinhas

### Novo
- Menu "Carteirinhas": titulares, cônjuges e dependentes de todos os contratos, com foto, nº, validade e o que falta para cada um
- Filtros (emitidas, prontas, com pendência, sem foto, contrato não assinado) e busca por nome, chácara, contrato ou nº
- Foto 3×4 direto na lista; prévia de cada carteirinha; PDF dos marcados ou de todos
- Dois formatos: A4 com 4 por folha (frente e verso lado a lado, para recortar, dobrar e plastificar) ou cartão para a gráfica

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
