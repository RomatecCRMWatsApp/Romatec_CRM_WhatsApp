import { useEffect } from "react";
import { ESCRITORIO } from "@shared/escritorio";
import { ATUALIZADA_EM, EMAIL_PRIVACIDADE, SECOES_PRIVACIDADE, TITULO_PRIVACIDADE, WHATSAPP_PRIVACIDADE } from "@shared/privacidade";

/**
 * /privacidade — política de privacidade pública (LGPD). Link exigido pela Meta nos formulários de cadastro
 * e usado no aviso de cookies. Página de leitura: uma coluna, texto grande, funciona sem login.
 */
const CSS = `
.priv{--verde:#0a3220;--ouro:#d4b055;--creme:#f4eddc;--tinta:#10261b;font-family:Lato,system-ui,sans-serif;background:var(--creme);color:var(--tinta);min-height:100vh;line-height:1.6;overflow-x:clip}
.priv *{box-sizing:border-box}
.priv header{background:var(--verde);color:#fff;padding:28px 16px 24px;border-bottom:5px solid var(--ouro)}
.priv .wrap{max-width:720px;margin:0 auto}
.priv h1{font-family:'Playfair Display',Georgia,serif;font-size:32px;line-height:1.15;margin:0}
.priv header p{margin:8px 0 0;font-size:15px;color:#f1d98a}
.priv main{padding:20px 16px 48px}
.priv section{background:#fff;border-radius:16px;padding:18px;margin-bottom:12px;border:1px solid rgba(212,176,85,.35)}
.priv h2{font-size:18px;margin:0 0 8px;color:var(--verde)}
.priv p{margin:0 0 10px;font-size:16px}
.priv p:last-child{margin-bottom:0}
.priv ul{margin:0;padding-left:22px;list-style:disc}
.priv li{margin-bottom:6px;font-size:16px}
.priv a{color:var(--verde);font-weight:700;overflow-wrap:anywhere}
.priv a:focus-visible{outline:3px solid var(--ouro);outline-offset:2px}
.priv footer{padding:0 16px 32px;font-size:13px;color:#5b5b4c;text-align:center}
`;

export default function Privacidade() {
  useEffect(() => { document.title = TITULO_PRIVACIDADE; }, []);
  return (
    <div className="priv">
      <style>{CSS}</style>
      <header>
        <div className="wrap">
          <h1>Política de privacidade</h1>
          <p>{ESCRITORIO.fantasia} · {ESCRITORIO.creciJ} · atualizada em {ATUALIZADA_EM}</p>
        </div>
      </header>
      <main className="wrap">
        {SECOES_PRIVACIDADE.map(s => (
          <section key={s.titulo}>
            <h2>{s.titulo}</h2>
            {s.paragrafos?.map(p => <p key={p}>{p}</p>)}
            {s.itens && <ul>{s.itens.map(i => <li key={i}>{i}</li>)}</ul>}
          </section>
        ))}
        <section>
          <h2>Contato rápido</h2>
          <p>E-mail: <a href={`mailto:${EMAIL_PRIVACIDADE}`}>{EMAIL_PRIVACIDADE}</a></p>
          <p>WhatsApp: <a href={`https://wa.me/${WHATSAPP_PRIVACIDADE}`} target="_blank" rel="noopener noreferrer">(99) 9 9181-1246</a></p>
        </section>
      </main>
      <footer>{ESCRITORIO.razaoSocial} · CNPJ {ESCRITORIO.cnpj} · {ESCRITORIO.endereco}</footer>
    </div>
  );
}
