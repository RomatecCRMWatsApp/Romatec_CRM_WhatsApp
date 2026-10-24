import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { RomatecLoader } from "@/brand";
import "./screensaver.css";

interface Props { ativo: boolean; onAcordar: () => void; novosLeads?: number; versao: string }

const FUSO = "America/Fortaleza";

/**
 * Tela de descanso: overlay opaco (cobre os dados de leads/clientes) com o loader oficial, hora e data.
 * Qualquer toque, tecla ou movimento > 10 px fecha com fade; o primeiro toque não chega ao que está embaixo.
 * Anti burn-in: o bloco central anda até ±24 px a cada minuto.
 */
export default function ScreenSaver({ ativo, onAcordar, novosLeads = 0, versao }: Props) {
  const [agora, setAgora] = useState(() => new Date());
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    if (!ativo) return;
    setSaindo(false);
    setAgora(new Date());
    const t1 = setInterval(() => setAgora(new Date()), 1000);
    const t2 = setInterval(() => setOffset({ x: Math.round(Math.random() * 48 - 24), y: Math.round(Math.random() * 48 - 24) }), 60_000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [ativo]);

  useEffect(() => {
    if (!ativo) return;
    let fechando = false;
    const sair = (e: Event) => {
      e.preventDefault(); e.stopPropagation();
      if (fechando) return;
      fechando = true;
      setSaindo(true);
      setTimeout(onAcordar, 300);
    };
    // Engole o clique que vem depois do toque (não aciona o botão por baixo)
    const engolir = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
    let base: { x: number; y: number } | null = null;
    const mover = (e: MouseEvent) => {
      if (!base) { base = { x: e.clientX, y: e.clientY }; return; }
      if (Math.hypot(e.clientX - base.x, e.clientY - base.y) > 10) sair(e);
    };
    const opts: AddEventListenerOptions = { capture: true };
    window.addEventListener("pointerdown", sair, opts);
    window.addEventListener("touchstart", sair, { capture: true, passive: false });
    window.addEventListener("keydown", sair, opts);
    window.addEventListener("click", engolir, opts);
    window.addEventListener("mousemove", mover, opts);
    return () => {
      window.removeEventListener("pointerdown", sair, opts);
      window.removeEventListener("touchstart", sair, opts);
      window.removeEventListener("keydown", sair, opts);
      // o "click" do toque chega logo depois do pointerdown: solta só no próximo ciclo
      setTimeout(() => window.removeEventListener("click", engolir, opts), 400);
      window.removeEventListener("mousemove", mover, opts);
    };
  }, [ativo, onAcordar]);

  const hora = useMemo(() => agora.toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }), [agora]);
  const data = useMemo(() => agora.toLocaleDateString("pt-BR", { timeZone: FUSO, weekday: "long", day: "numeric", month: "long", year: "numeric" }), [agora]);

  if (!ativo) return null;
  return createPortal(
    <div className={`screensaver ${saindo ? "saindo" : ""}`} role="dialog" aria-modal="true" aria-label="Tela de descanso">
      <div className="ss-centro" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}>
        <RomatecLoader size={220} label={null} />
        <div className="ss-hora">{hora}</div>
        <div className="ss-data">{data}</div>
        <div className="ss-marca">CRM | GESTÃO DE LEADS IMOBILIÁRIOS</div>
        {novosLeads > 0 && <div className="ss-lead">● {novosLeads} {novosLeads === 1 ? "novo lead" : "novos leads"}</div>}
        <div className="ss-dica">Toque ou mova o mouse para continuar</div>
      </div>
      <div className="ss-rodape">Romatec Consultoria Total · v{versao}</div>
    </div>,
    document.body,
  );
}
