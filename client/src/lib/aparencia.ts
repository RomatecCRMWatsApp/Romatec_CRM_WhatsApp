import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";

/**
 * Preferências de apresentação do CRM, guardadas neste navegador (sem dado pessoal):
 *  - Aparência: Escuro (padrão), Claro ou Sistema (segue prefers-color-scheme).
 *  - Som de navegação: começa DESLIGADO; ligado, toca um clique curto só ao navegar pelo menu.
 * O tema é aplicado antes da primeira pintura pelo script em client/index.html (mesmas chaves).
 */
export type Aparencia = "escuro" | "claro" | "sistema";
export type TemaAplicado = "dark" | "light";

const CHAVE_APARENCIA = "rt.aparencia";
const CHAVE_SOM = "rt.somNavegacao";
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach(f => f());

function ler(chave: string): string | null {
  try { return localStorage.getItem(chave); } catch { return null; }
}
function gravar(chave: string, valor: string) {
  try { localStorage.setItem(chave, valor); } catch { /* sem armazenamento: vale só nesta visita */ }
}

export function lerAparencia(): Aparencia {
  const v = ler(CHAVE_APARENCIA);
  return v === "claro" || v === "sistema" ? v : "escuro";
}

const sistemaClaro = () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches;

export function temaDe(aparencia: Aparencia): TemaAplicado {
  return aparencia === "claro" || (aparencia === "sistema" && sistemaClaro()) ? "light" : "dark";
}

export function aplicarTema(tema: TemaAplicado) {
  const raiz = document.documentElement;
  raiz.dataset.rtTheme = tema;
  raiz.classList.toggle("dark", tema === "dark");
  raiz.style.colorScheme = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tema === "light" ? "#F4F6F2" : "#061A11");
}

export function definirAparencia(a: Aparencia) {
  gravar(CHAVE_APARENCIA, a);
  if (document.documentElement.dataset.rtShell) aplicarTema(temaDe(a));
  avisar();
}

export function somLigado(): boolean {
  return ler(CHAVE_SOM) === "1";
}

export function definirSom(ligado: boolean) {
  gravar(CHAVE_SOM, ligado ? "1" : "0");
  if (!ligado) suspenderAudio();
  else prepararAudio();
  avisar();
}

const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };

/** Estado reativo das preferências + acompanha o sistema quando a aparência é "Sistema" */
export function usePreferenciasVisuais() {
  const aparencia = useSyncExternalStore(assinar, lerAparencia, () => "escuro" as Aparencia);
  const som = useSyncExternalStore(assinar, somLigado, () => false);
  useEffect(() => {
    if (aparencia !== "sistema") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const mudar = () => { if (document.documentElement.dataset.rtShell) aplicarTema(temaDe("sistema")); };
    mq.addEventListener("change", mudar);
    return () => mq.removeEventListener("change", mudar);
  }, [aparencia]);
  return { aparencia, som, tema: temaDe(aparencia) };
}

/** Dentro do app (AppShell): aplica a aparência escolhida; ao sair para uma tela pública, volta ao escuro */
export function useTemaDoApp() {
  const { tema } = usePreferenciasVisuais();
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    raiz.dataset.rtShell = "1";
    aplicarTema(tema);
    return () => { delete raiz.dataset.rtShell; aplicarTema("dark"); };
  }, [tema]);
}

// ─── Som de navegação (Web Audio nativo, sem arquivo nem biblioteca) ───
let ctx: AudioContext | null = null;
let ultimoToque = 0;
const INTERVALO_MIN_MS = 100;

/** Cria o contexto só a partir de um gesto do usuário (ligar o som ou navegar com ele ligado) */
function prepararAudio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => { /* bloqueado: segue em silêncio */ });
    return ctx;
  } catch {
    return null;
  }
}

function suspenderAudio() {
  if (ctx && ctx.state === "running") void ctx.suspend().catch(() => { /* ignora */ });
}

/** Clique curto (~40 ms) e baixo. Nunca bloqueia a navegação: qualquer falha vira silêncio. */
export function tocarNavegacao() {
  if (!somLigado()) return;
  const agora = performance.now();
  if (agora - ultimoToque < INTERVALO_MIN_MS) return;
  ultimoToque = agora;
  const ac = prepararAudio();
  if (!ac || ac.state !== "running") return;
  try {
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const ganho = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(660, t + 0.04);
    ganho.gain.setValueAtTime(0.0001, t);
    ganho.gain.exponentialRampToValueAtTime(0.04, t + 0.006);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    osc.connect(ganho).connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.045);
    osc.onended = () => { osc.disconnect(); ganho.disconnect(); };
  } catch {
    /* sem som */
  }
}
