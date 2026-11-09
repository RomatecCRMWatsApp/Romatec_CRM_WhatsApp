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
