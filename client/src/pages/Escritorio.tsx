import { useEffect, useRef, useState } from "react";
import { useBrandFonts, useCorretorDoLink } from "@/components/bom-jardims/marca";
import {
  CONTATOS_ESCRITORIO, ESCRITORIO, LINKS_MAPA_ESCRITORIO, REFERENCIA_ESCRITORIO, TITULO_ESCRITORIO,
  horaLocalEscritorio, situacaoEscritorio, textoSituacao,
} from "@shared/escritorio";

/**
 * /escritorio — endereço do escritório (versão do pacote "escritorio-pagina", 23/11/2026): foto no topo, selo de
 * aberto/fechado no fuso de Açailândia, como chegar, horário com o dia de hoje destacado, áudio, passo a passo,
 * contatos e barra fixa do WhatsApp. O ?c= (quem compartilhou) troca o corretor do primeiro contato e da barra.
 */
const CSS = `
.esc{--verde:#0a3220;--verde2:#0f4a30;--ouro:#d4b055;--ouro2:#f1d98a;--creme:#f4eddc;--tinta:#10261b;--zap:#1a7f47;
  font-family:Lato,system-ui,sans-serif;background:var(--creme);color:var(--tinta);line-height:1.45;min-height:100vh;padding-bottom:calc(84px + env(safe-area-inset-bottom))}
.esc *{box-sizing:border-box}
.esc .wrap{max-width:560px;margin:0 auto}
.esc .hero{position:relative;min-height:420px;display:flex;flex-direction:column;justify-content:flex-end;color:#fff;overflow:hidden;background:var(--verde)}
.esc .hero img.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 45%}
.esc .hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,50,32,.75) 0%,rgba(10,50,32,.15) 38%,rgba(10,50,32,.92) 100%)}
.esc .hero .in{position:relative;z-index:2;padding:22px 20px 26px;max-width:560px;margin:0 auto;width:100%}
.esc .logo{position:absolute;z-index:2;top:18px;left:20px;width:190px;height:auto;filter:drop-shadow(0 2px 6px rgba(0,0,0,.5))}
.esc h1{font-family:'Playfair Display',serif;font-weight:700;font-size:38px;line-height:1.1;margin:0;text-shadow:0 2px 10px rgba(0,0,0,.5)}
.esc .end{margin:10px 0 0;color:var(--ouro2);font-weight:700;font-size:17px}
.esc .ref{margin:4px 0 0;font-size:15px;opacity:.95}
.esc .ref b{color:#fff}
.esc .status{display:inline-flex;align-items:center;gap:8px;margin-top:14px;padding:8px 14px;border-radius:999px;font-weight:900;font-size:14px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.35);backdrop-filter:blur(6px)}
.esc .dot{width:10px;height:10px;border-radius:50%;background:#aaa}
.esc .status.on .dot{background:#3be07a;box-shadow:0 0 0 4px rgba(59,224,122,.28)}
.esc .status.off .dot{background:#ffb24d;box-shadow:0 0 0 4px rgba(255,178,77,.25)}
.esc .gold{height:5px;background:linear-gradient(90deg,#b8923a,var(--ouro2),#b8923a)}
.esc main{padding:18px 16px 8px}
.esc .card{background:#fff;border-radius:18px;padding:18px;margin-bottom:14px;box-shadow:0 4px 18px rgba(10,50,32,.08);border:1px solid rgba(212,176,85,.35)}
.esc .card h2{font-size:17px;font-weight:900;display:flex;align-items:center;gap:8px;margin:0 0 12px;color:var(--verde)}
.esc .card h2 svg{width:20px;height:20px;flex:none}
.esc table{width:100%;border-collapse:collapse;font-size:15.5px}
.esc td{padding:9px 6px;border-bottom:1px solid #eee4cc}
.esc tr:last-child td{border-bottom:0}
.esc td:last-child{text-align:right;font-weight:700}
.esc tr.hoje{background:#fbf3d9;font-weight:900}
.esc tr.hoje td:first-child::after{content:" · hoje";color:#8a6a14;font-size:12px;font-weight:900}
.esc .aviso{margin:12px 0 0;padding:12px 14px;border-radius:12px;background:var(--verde);color:#fff;font-size:14.5px}
.esc .aviso b{color:var(--ouro2)}
.esc .player{display:flex;align-items:center;gap:14px}
.esc .play{flex:none;width:58px;height:58px;border-radius:50%;border:0;background:linear-gradient(145deg,var(--ouro2),#b8923a);color:var(--verde);display:grid;place-items:center;cursor:pointer;box-shadow:0 4px 12px rgba(184,146,58,.5)}
.esc .play:focus-visible,.esc .btn:focus-visible,.esc .pessoa a:focus-visible{outline:3px solid var(--ouro);outline-offset:2px}
.esc .play svg{width:26px;height:26px}
.esc .pbar{flex:1}
.esc .pbar .t{font-weight:900;font-size:15px;color:var(--verde)}
.esc .pbar .s{font-size:12.5px;color:#6b6b5c;margin-bottom:8px}
.esc .track{height:8px;background:#eadfc0;border-radius:6px;overflow:hidden;cursor:pointer}
.esc .track i{display:block;height:100%;background:linear-gradient(90deg,var(--verde2),var(--ouro))}
.esc .time{display:flex;justify-content:space-between;font-size:12px;color:#6b6b5c;margin-top:5px}
.esc .btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:16px;border-radius:16px;font-weight:900;font-size:17px;text-decoration:none;margin-bottom:10px;border:1px solid rgba(10,50,32,.12)}
.esc .btn svg{width:22px;height:22px;flex:none}
.esc .b1{background:var(--verde);color:#fff}
.esc .b2{background:#fff;color:var(--verde)}
.esc .bz{background:var(--zap);color:#fff;border-color:var(--zap)}
.esc .mapas{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.esc .mapas .btn{font-size:15px;padding:14px 8px;margin:0}
.esc .mapas .full{grid-column:1/-1}
.esc ol{list-style:none;counter-reset:p;margin:0;padding:0}
.esc ol li{counter-increment:p;position:relative;padding:4px 0 12px 44px;font-size:15.5px}
.esc ol li::before{content:counter(p);position:absolute;left:0;top:0;width:32px;height:32px;border-radius:50%;background:var(--verde);color:var(--ouro2);font-weight:900;display:grid;place-items:center}
.esc ol li:last-child{padding-bottom:0}
.esc .pessoa{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #eee4cc}
.esc .pessoa:last-of-type{border-bottom:0}
.esc .av{flex:none;width:48px;height:48px;border-radius:50%;background:var(--verde);color:var(--ouro2);display:grid;place-items:center;font-family:'Playfair Display',serif;font-weight:700;font-size:19px}
.esc .av img{width:100%;height:100%;border-radius:50%;object-fit:cover;border:2px solid var(--ouro)}
.esc .pessoa .n{font-weight:900;font-size:16px}
.esc .pessoa .c{font-size:13px;color:#6b6b5c}
.esc .pessoa .c span{white-space:nowrap}
.esc .pessoa a{margin-left:auto;flex:none;background:var(--zap);color:#fff;text-decoration:none;font-weight:900;font-size:14px;padding:10px 14px;border-radius:12px}
.esc footer{text-align:center;font-size:12.5px;color:#6b6b5c;padding:12px 20px 24px}
.esc footer b{display:block;font-size:13.5px;color:var(--tinta);margin-bottom:4px}
.esc .fixa{position:fixed;left:0;right:0;bottom:0;z-index:20;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:rgba(244,237,220,.94);backdrop-filter:blur(10px);border-top:1px solid rgba(212,176,85,.5)}
.esc .fixa .btn{margin:0 auto;max-width:560px}
`;

const AUDIO = "/brand/audio-escritorio-v2.mp3";
const HORARIOS: Array<[number, string, string]> = [
  [1, "Segunda-feira", "9h–12h · 15h–17h"], [2, "Terça-feira", "9h–12h · 15h–17h"], [3, "Quarta-feira", "9h–12h · 15h–17h"],
  [4, "Quinta-feira", "9h–12h · 15h–17h"], [5, "Sexta-feira", "9h–12h · 15h–17h"], [6, "Sábado", "Com agendamento"], [0, "Domingo e feriados", "Com agendamento"],
];
const wa = (num: string) => `https://wa.me/${num}?text=${encodeURIComponent(CONTATOS_ESCRITORIO.mensagem)}`;
const tempo = (s: number) => { const t = Math.floor(s || 0); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();

function Audio() {
  const ref = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [dur, setDur] = useState(52);
  const alternar = () => { const a = ref.current; if (!a) return; if (a.paused) void a.play(); else a.pause(); };
  const pular = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = ref.current; if (!a?.duration) return;
    const r = e.currentTarget.getBoundingClientRect(); a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
  };
  return (
    <section className="card" aria-label="Áudio explicativo">
      <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>Prefere ouvir?</h2>
      <div className="player">
        <button className="play" onClick={alternar} aria-label={tocando ? "Pausar áudio" : "Tocar áudio"}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d={tocando ? "M7 5h4v14H7zM13 5h4v14h-4z" : "M8 5v14l11-7z"} /></svg>
        </button>
        <div className="pbar">
          <div className="t">Como funciona o atendimento</div>
          <div className="s">Áudio de {Math.round(dur)} segundos</div>
          <div className="track" onClick={pular} role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(atual)}><i style={{ width: `${(atual / (dur || 1)) * 100}%` }} /></div>
          <div className="time"><span>{tempo(atual)}</span><span>{tempo(dur)}</span></div>
        </div>
      </div>
      <audio ref={ref} preload="none" src={AUDIO}
        onPlay={() => setTocando(true)} onPause={() => setTocando(false)} onEnded={() => setTocando(false)}
        onLoadedMetadata={e => setDur(e.currentTarget.duration || 52)} onTimeUpdate={e => setAtual(e.currentTarget.currentTime)} />
    </section>
  );
}

export default function Escritorio() {
  useBrandFonts();
  const corretor = useCorretorDoLink();
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => { document.title = TITULO_ESCRITORIO; }, []);
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const situacao = situacaoEscritorio(agora);
  const hoje = horaLocalEscritorio(agora).diaSemana;
  // Quem compartilhou o link (?c=) aparece no primeiro contato e na barra; sem ref, o José Romário
  const principal = corretor.doLink && corretor.whatsapp
    ? { nome: corretor.nome, papel: [corretor.papel, corretor.creci].filter(Boolean).join(" · "), whatsapp: corretor.whatsapp, foto: corretor.fotoUrl ?? null }
    : { ...CONTATOS_ESCRITORIO.jose, foto: corretor.fotoUrl ?? CONTATOS_ESCRITORIO.jose.foto };
  const contatos = [principal, ...(CONTATOS_ESCRITORIO.daniele.whatsapp ? [CONTATOS_ESCRITORIO.daniele] : [])];
  const [rua, ...resto] = ESCRITORIO.endereco.split(", ");

  return (
    <div className="esc">
      <style>{CSS}</style>
      <header className="hero">
        <img className="bg" src="/brand/escritorio-hero.jpg" alt="Rua do centro de Açailândia ao pôr do sol, com o marcador dourado do escritório da Romatec" fetchPriority="high" />
        <img className="logo" src="/brand/wordmark-dourado.png" alt="Romatec Consultoria Total" width={1664} height={465} />
        <div className="in">
          <h1>Nosso escritório</h1>
          <p className="end">{rua}, {resto.join(" · ").replace(", ", " · ")}</p>
          <p className="ref">Em frente ao <b>{REFERENCIA_ESCRITORIO.replace(/^Em frente ao /, "")}</b></p>
          <div className={`status ${situacao.tipo === "aberto" ? "on" : "off"}`} role="status"><span className="dot" /><span>{textoSituacao(situacao)}</span></div>
        </div>
      </header>
      <div className="gold" />

      <div className="wrap"><main>
        <section className="card" aria-label="Como chegar">
          <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>Como chegar</h2>
          <div className="mapas">
            <a className="btn b1 full" href={LINKS_MAPA_ESCRITORIO.google} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l18-8-8 18-2-8z" /></svg>Abrir no Google Maps</a>
            <a className="btn b2" href={LINKS_MAPA_ESCRITORIO.waze} target="_blank" rel="noopener noreferrer">Waze</a>
            <a className="btn b2" href={LINKS_MAPA_ESCRITORIO.apple} target="_blank" rel="noopener noreferrer">Apple Maps</a>
          </div>
        </section>

        <section className="card" aria-label="Horário de atendimento">
          <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>Horário de atendimento</h2>
          <table><tbody>
            {HORARIOS.map(([d, dia, h]) => <tr key={d} className={d === hoje ? "hoje" : undefined}><td>{dia}</td><td>{h}</td></tr>)}
          </tbody></table>
          <p className="aviso"><b>Avise antes</b> o dia e o horário da sua visita, para a nossa equipe te receber com atenção.</p>
        </section>

        <Audio />

        <section className="card" aria-label="Como funciona a visita">
          <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></svg>Como funciona a visita</h2>
          <ol>
            <li><b>Combine pelo WhatsApp</b> o dia e o horário que você pretende vir.</li>
            <li><b>Venha até a Rua São Raimundo, n.º 10</b>, em frente ao Hotel Girafa.</li>
            <li><b>Nossa equipe te recebe</b> e apresenta as opções com calma.</li>
          </ol>
        </section>

        <section className="card" aria-label="Fale com a gente">
          <h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.6-5.4A8.5 8.5 0 1 1 21 12z" /></svg>Fale com a gente</h2>
          {contatos.map(p => (
            <div className="pessoa" key={p.whatsapp}>
              <div className="av">{p.foto ? <img src={p.foto} alt={p.nome} width={48} height={48} loading="lazy" /> : iniciais(p.nome)}</div>
              <div><div className="n">{p.nome}</div><div className="c">{p.papel.split(" · ").map((t, i) => <span key={t}>{i ? " · " : ""}{t}</span>)}</div></div>
              <a href={wa(p.whatsapp)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp de ${p.nome}`}>WhatsApp</a>
            </div>
          ))}
        </section>
      </main></div>

      <footer>
        <b>{ESCRITORIO.fantasia}</b>
        {ESCRITORIO.creciJ} · CNPJ {ESCRITORIO.cnpj}<br />Rua São Raimundo, n.º 10 · Centro · Açailândia/MA
      </footer>

      <div className="fixa">
        <a className="btn bz" href={wa(principal.whatsapp)} target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.6-5.4A8.5 8.5 0 1 1 21 12z" /></svg>Combinar a visita pelo WhatsApp</a>
      </div>
    </div>
  );
}
