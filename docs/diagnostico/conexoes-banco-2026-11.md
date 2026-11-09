# Diagnóstico — conexões com o banco e confirmação por código (nov/2026)

Data: 08/11/2026 · Versão: 1.140.0

## 1. Conexões com o banco

### O que existe (evidência no código)

| Item | Situação |
|---|---|
| Runtime | Node 22, processo **persistente** (Railway, `Dockerfile` → `node dist/index.js`). Não há funções serverless nem edge. |
| Banco | MySQL (variável `DATABASE_URL`). SQLite (`DATABASE_DRIVER=sqlite`) só para testes e uso local. |
| Driver / ORM | `mysql2` 3.x + `drizzle-orm` 0.44. Não há Prisma, Supabase nem PgBouncer. Pooler externo: não existe e não é necessário neste runtime. |
| Onde se cria o pool | Só em `server/db.ts` (`getDb()`). Nenhum outro `createPool`/`createConnection` no servidor. |
| Conexões manuais | Nenhum `getConnection()` manual; transações via `db.transaction` do Drizzle (`transacao()`), que devolve a conexão no sucesso e no erro. |
| TLS | `ssl.rejectUnauthorized: false`, mantido como estava (o MySQL do Railway usa certificado próprio). Mudança aqui exige o certificado do provedor: **não alterado**. |
| Métricas do provedor | **Não verificado.** Sem acesso ao painel do Railway (conexões ativas, `max_connections`, CPU). |

### Problemas encontrados e corrigidos

1. **Pool duplicado na partida.** Duas chamadas simultâneas a `getDb()` antes da primeira terminar abriam dois pools (o `await import` acontecia antes de guardar a instância). O servidor dispara vários jobs ao subir, então isso ocorria na prática. **Correção:** a abertura em andamento é compartilhada (`_abrindo`); um único pool por processo.
2. **Fila sem limite** (`queueLimit: 0`). Sob pico, requisições ficavam esperando indefinidamente e acumulando memória. **Correção:** limite de 500 na fila (ajustável); acima disso a requisição falha na hora com erro, em vez de travar.
3. **Sockets ociosos derrubados pelo proxy.** Sem keep-alive, a primeira consulta depois de um período parado podia falhar com ECONNRESET. **Correção:** `enableKeepAlive` (10 s), `idleTimeout` de 60 s e no máximo 5 conexões ociosas guardadas. Não se fecha o pool a cada consulta.
4. **Consulta N+1 nos rascunhos de imóveis.** `listarRascunhos` fazia uma consulta de fotos por rascunho, até 200 em paralelo, ocupando as 10 conexões do pool para uma única tela. **Correção:** uma única consulta agrupada.
5. **Encerramento sem fechar o pool.** No deploy, o Railway envia SIGTERM. **Correção:** o servidor para de aceitar requisições, espera as que estão em curso (até 10 s) e fecha o pool.
6. **Sem observabilidade do pool.** **Correção:** a cada 30 s, se alguma requisição precisou esperar conexão, o log registra `[Database] pool cheio: N requisição(ões) esperaram…` com conexões em uso e fila. Nenhum dado de consulta ou credencial vai para o log.

### Configuração antes / depois (segredos omitidos)

| Parâmetro | Antes | Depois | Variável |
|---|---|---|---|
| connectionLimit | 10 | 10 (mantido) | `DB_POOL_LIMITE` (1–50) |
| queueLimit | 0 (ilimitado) | 500 | `DB_POOL_FILA` |
| maxIdle / idleTimeout | padrão do driver | 5 / 60 s | `DB_POOL_OCIOSAS` |
| keep-alive | desligado | ligado (10 s) | — |
| connectTimeout | padrão (10 s) | 10 s explícito | — |

Orçamento: conexões máximas da aplicação = réplicas × `DB_POOL_LIMITE` = 1 × 10 hoje. Esse total precisa caber no `max_connections` do MySQL do Railway, descontada a margem para administração. **Antes de subir réplicas ou o limite, conferir esse valor no painel.**

### Pendências (dependem de acesso ou autorização)

- Linha de base com métricas reais: conexões ativas e ociosas no MySQL, latência p95, consultas lentas. Precisa do painel do Railway ou do `slow_query_log`.
- Teste de carga controlado em homologação. Não foi feito: não há ambiente de homologação separado e não se testa carga em produção.
- Outros `Promise.all` revisados não crescem sem limite (paginação ou listas pequenas de usuários). Não foram alterados.

### Reversão

Valores antigos por variável de ambiente (`DB_POOL_FILA=0`) ou revertendo o commit da versão 1.140.0. Não houve mudança de schema.

## 2. Confirmação por código (OTP)

O único fluxo com código de uso único é a **assinatura eletrônica avançada** do contrato (`/assinar/:token`):

- **Contrato no servidor:** `POST /api/assinar/:token/codigo` envia o código e devolve o telefone mascarado; `POST /api/assinar/:token/avancada` confirma.
- **Código:** 6 dígitos, guardado como hash, válido por 10 minutos, no máximo 5 tentativas (reservadas de forma atômica), 1 pedido por minuto.

O login do CRM **não tem OTP**. Nenhuma autenticação nova foi criada.

- **Lacuna corrigida no servidor:** o uso único não era atômico. Duas confirmações simultâneas com o código certo (duplo clique, duas abas) assinavam e carimbavam o PDF duas vezes; o teste reproduziu isso. Agora só a requisição que consome aquele código segue; a outra recebe `OTP_USADO`.
- **Tela nova** (`client/src/components/assinatura/CodigoOtp.tsx` e as regras em `shared/codigoOtp.ts`):
  - **Campo:** um único campo real (colar, preenchimento automático do celular, leitor de tela) desenhado em 6 segmentos; zeros à esquerda preservados; nada é cortado em silêncio.
  - **Estados:** editando, verificando (campo travado, sem reenvio), confirmado, inválido (mostra as tentativas restantes informadas pelo servidor), expirado, bloqueado, sem conexão, já usado (recarrega a situação real).
  - **Concorrência:** uma tentativa por vez. Respostas antigas, de código substituído pelo reenvio ou depois de fechar a tela são ignoradas.
  - **Animação:** os dígitos giram em órbita e se fundem no bloco "Código confirmado" só depois da resposta positiva do servidor, em cerca de 0,8 s. Com movimento reduzido, aparece só o bloco, sem rotação. A assinatura já está gravada antes da animação.
  - **Sigilo:** o código não vai para armazenamento local, URL, log ou console.

## 3. Arquivos fora do banco (v1.142.0)

Medição em produção (09/11/2026): tabelas 254 MB, sendo ~210 MB de arquivos em base64 (páginas e originais de documentos, documentos do recrutamento, plantas).

- **Destino:** Cloudinary, como `raw` do tipo **private**. Sem URL pública: só o servidor do CRM baixa, pela API assinada, depois de conferir a permissão. O nome do arquivo no Cloudinary é aleatório, sem nome de pessoa nem tipo de documento.
- **Liberação:** o armazém só é usado depois de um teste de ida e volta (envia, baixa, compara o sha256 e apaga). Se o teste falhar, tudo continua no banco, como antes, e o motivo aparece em Configurações › Banco de dados.
- **Gravação nova:** o arquivo vai ao armazém **antes** da transação, para não prender conexão durante o upload. É conferido (baixado e comparado) e só então a linha é gravada, com `arquivoRef` e o base64 vazio.
- **Migração do que já existe:** um arquivo por vez, até 30 a cada 10 minutos. Cada arquivo é enviado, conferido e só sai do banco se o conteúdo não mudou nesse meio-tempo. Se falhar, fica no banco e tenta de novo. Quando a tabela termina, roda `OPTIMIZE TABLE` uma vez para devolver o espaço ao volume.
- **Exclusão (LGPD):** ao remover ou substituir um documento, o arquivo é apagado também no armazém. Uma faxina diária apaga o que ficou sem registro no banco (só arquivos com mais de 2 h).
- **Planta dos imóveis:** o PDF em `data:` vai para o armazém e `plantaBaixaUrl` passa a ser `/api/imoveis/:id/planta`, servido pelo CRM. Salvar o imóvel sem trocar a planta mantém o mesmo arquivo.
- **Ficam no banco, por decisão:** fotos dos usuários (17 MB), arquivos de contrato (têm conferência de autenticidade por sha256) e arquivos de empreendimento.
- **Reversão:** variável `ARQUIVOS_NO_BANCO=1` faz as novas gravações voltarem ao banco. Os arquivos já movidos continuam legíveis pela referência.
