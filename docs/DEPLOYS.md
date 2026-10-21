# Registro de deploys manuais

O Railway faz deploy a cada push na `main`, mas só quando algum arquivo do commit casa com
`watchPatterns` (`railway.json`). Commit vazio é pulado (SKIPPED). Quando um push não gera deploy,
registrar aqui força um novo build a partir do código do GitHub, sem enviar a pasta local.

| Data (UTC-3) | Commit que precisava subir | Motivo |
|---|---|---|
| 2026-10-21 | `f345641` — link + KML por chácara e do empreendimento, Quadra E | O push não gerou deploy no Railway; o commit vazio `f125db8` foi SKIPPED |
