import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const fixes = [
  ['GestÃ£o', 'Gestão'],
  ['ImobiliÃ¡ria', 'Imobiliária'],
  ['ImÃ³vel', 'Imóvel'],
  ['ImÃ³veis', 'Imóveis'],
  ['excluÃ­do', 'excluído'],
  ['AÃ§Ãµes', 'Ações'],
  ['Ãšltimos', 'Últimos'],
  ['UsuÃ¡rio', 'Usuário'],
  ['Ã£o', 'ão'],
  ['Ã³', 'ó'],
  ['Ã©', 'é'],
  ['Ã¡', 'á'],
  ['Ãª', 'ê'],
  ['Ã§', 'ç'],
  ['Ãµ', 'õ'],
  ['Ã£', 'ã'],
  ['Ã¢', 'â'],
  ['Ã­', 'í'],
  ['Ãº', 'ú'],
  ['Ã\u0080', 'À'],
  ['Ã\u009a', 'Ú'],
  ['â\u0080\u0094', '-'],
  ['â\u0080\u009c', '"'],
  ['â\u0080\u009d', '"'],
  ['çção', 'ção'],
  ['çç', 'ç'],
  ['â"œÂº', 'ú'],
  ['â"œÃº', 'ú'],
  ['â"œÂ¡', 'á'],
];

function fixFile(filePath) {
  let content = readFileSync(filePath, 'utf8');
  let changed = false;
  for (const [from, to] of fixes) {
    if (content.includes(from)) {
      content = content.split(from).join(to);
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(filePath, content, 'utf8');
    console.log('Fixed: ' + filePath);
  }
}

function walkDir(dir) {
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) walkDir(full);
    else if (f.endsWith('.tsx') || f.endsWith('.ts')) fixFile(full);
  }
}

walkDir('client/src');
console.log('Done!');
