#!/usr/bin/env bash
# Desliga o servidor local do CRM (sempre rodar no fim da conferência)
pkill -f "server/_core/index.ts" 2>/dev/null && echo "Servidor local desligado" || echo "Nenhum servidor local rodando"
