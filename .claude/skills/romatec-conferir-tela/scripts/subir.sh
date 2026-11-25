#!/usr/bin/env bash
# Sobe o CRM local com SQLite descartável e um admin de teste (admin@teste.local / Teste@12345).
# Uso: subir.sh [pasta-de-trabalho]   (padrão: $TMPDIR ou /tmp)   — porta 3999
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/../../../.." && pwd)"
W="${1:-${TMPDIR:-/tmp}/romatec-local}"; mkdir -p "$W"
pkill -f "server/_core/index.ts" 2>/dev/null || true
rm -f "$W/local.db" "$W/srv.log"
cd "$RAIZ"
ENVS="DATABASE_DRIVER=sqlite SQLITE_PATH=$W/local.db JWT_SECRET=local-teste-$(date +%s) CRM_INITIAL_PASSWORD=Teste@12345 PORT=3999 NODE_ENV=development"
# 1ª subida cria as tabelas
env $ENVS npx tsx server/_core/index.ts > "$W/srv.log" 2>&1 &
for _ in $(seq 1 90); do grep -q "Server running" "$W/srv.log" 2>/dev/null && break; sleep 2; done
grep -q "Server running" "$W/srv.log" || { echo "Servidor não subiu:"; tail -30 "$W/srv.log"; exit 1; }
node -e '
const D=require("better-sqlite3");const d=new D(process.argv[1]);
if(!d.prepare("select 1 from users where email=?").get("admin@teste.local"))
 d.prepare("insert into users (openId,name,email,role,perfil,ativo,creci) values (?,?,?,?,?,1,?)").run("admin-teste","Admin Teste","admin@teste.local","admin","admin","99999");
// Sem isto o admin cai na tela de configuração inicial (/setup)
if(!d.prepare("select 1 from companyConfig").get())
 d.prepare("insert into companyConfig (companyName,phone) values (?,?)").run("Empresa de Teste","5500000000000");' "$W/local.db"
echo "OK http://localhost:3999  (log: $W/srv.log)  — login admin@teste.local / Teste@12345"
