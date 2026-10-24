/**
 * npm run release — prepara a versão nova a partir do topo do RELEASE_NOTES.md:
 * valida o bloco, confere que a versão não é menor que a do package.json e grava em package.json → version.
 * O registro no banco (systemRelease) acontece quando o servidor sobe (server/releases.ts › importarReleaseNotes):
 * o build no Railway não tem acesso ao banco. A versão vai para o front pelo vite.config (lê o package.json).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { compararVersao, lerReleaseNotes } from "../shared/releases";

async function main() {
  const raiz = process.cwd();
  const [rel] = lerReleaseNotes(await fs.readFile(path.join(raiz, "RELEASE_NOTES.md"), "utf8"));
  const pkgPath = path.join(raiz, "package.json");
  const texto = await fs.readFile(pkgPath, "utf8");
  const pkg = JSON.parse(texto);
  if (compararVersao(rel.versao, pkg.version) < 0) throw new Error(`Versão ${rel.versao} menor que a atual ${pkg.version}`);
  if (pkg.version !== rel.versao) {
    // Troca só a linha da versão (mantém a formatação do arquivo)
    await fs.writeFile(pkgPath, texto.replace(/("version"\s*:\s*")[^"]+(")/, `$1${rel.versao}$2`));
  }
  console.log(`✔ Release ${rel.versao} pronta (${rel.tipo}${rel.obrigatoria ? ", obrigatória" : ""}) — "${rel.titulo}"`);
  console.log("  Faça o commit e o push: ao subir, o servidor grava a versão e avisa todo mundo.");
}

main().catch(e => {
  console.error("✖ release:", e.message);
  process.exit(1);
});
