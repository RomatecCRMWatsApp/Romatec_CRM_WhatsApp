import { PARTE_SEGUNDOS } from "@shared/reunioes";

/**
 * Gravador de reunião no navegador: microfone (e, se pedido, o som do computador — chamada no Meet/WhatsApp Web),
 * em partes de alguns minutos. Cada parte sobe e é transcrita enquanto a reunião continua; se a internet falhar,
 * tenta de novo. A tela fica acesa durante a gravação (no celular, a tela apagada pode parar o microfone).
 */
export type EstadoEnvio = { enviadas: number; pendentes: number; erro: string | null };

const tipoAudio = () => ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find(t => (window as any).MediaRecorder?.isTypeSupported?.(t)) ?? "";

/** Sobe a parte; devolve o aviso quando ela foi guardada mas ainda não transcrita (ex.: OpenAI sem crédito) */
export async function enviarParte(reuniaoId: number, ordem: number, audio: Blob, duracaoSeg: number): Promise<string | null> {
  let ultimo = "";
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    try {
      const r = await fetch(`/api/reunioes/${reuniaoId}/partes/${ordem}?duracao=${Math.round(duracaoSeg)}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": (audio.type || "audio/webm").split(";")[0] }, body: audio,
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) return j.pendente ? String(j.aviso || "trecho guardado, transcrição pendente") : null;
      ultimo = j.error || `Erro ${r.status}`;
      // Erro de configuração/permissão não melhora tentando de novo
      if ([400, 401, 403, 404, 409, 412, 413].includes(r.status)) break;
    } catch (e: any) { ultimo = "Sem conexão"; }
    await new Promise(ok => setTimeout(ok, 2000 * (tentativa + 1)));
  }
  throw new Error(ultimo || "Falha ao enviar");
}

export class GravadorReuniao {
  private streams: MediaStream[] = [];
  private ctx: AudioContext | null = null;
  private saida: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private pedacos: Blob[] = [];
  private inicioParte = 0;
  private ordem = 0;
  private timer: number | null = null;
  private fila: Promise<void> = Promise.resolve();
  private trava: any = null;
  private parando = false;
  estado: EstadoEnvio = { enviadas: 0, pendentes: 0, erro: null };

  constructor(private reuniaoId: number, private aoMudar: (e: EstadoEnvio) => void) {}

  static suportado() { return typeof navigator.mediaDevices?.getUserMedia === "function" && !!(window as any).MediaRecorder; }
  static somDoComputadorSuportado() { return !!(navigator.mediaDevices as any)?.getDisplayMedia && !/Android|iPhone|iPad/i.test(navigator.userAgent); }

  async iniciar(incluirSomDoComputador: boolean) {
    const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.streams.push(mic);
    if (incluirSomDoComputador) {
      // O navegador pede para escolher a aba/tela e marcar "compartilhar áudio"; o vídeo é descartado
      const tela = await (navigator.mediaDevices as any).getDisplayMedia({ video: true, audio: true });
      tela.getVideoTracks().forEach((t: MediaStreamTrack) => t.stop());
      if (!tela.getAudioTracks().length) { mic.getTracks().forEach(t => t.stop()); throw new Error('Marque "Compartilhar áudio" ao escolher a aba ou a tela.'); }
      this.streams.push(tela);
      this.ctx = new AudioContext();
      const destino = this.ctx.createMediaStreamDestination();
      this.ctx.createMediaStreamSource(mic).connect(destino);
      this.ctx.createMediaStreamSource(new MediaStream(tela.getAudioTracks())).connect(destino);
      this.saida = destino.stream;
    } else {
      this.saida = mic;
    }
    try { this.trava = await (navigator as any).wakeLock?.request?.("screen"); } catch { /* sem wake lock */ }
    this.novaParte();
  }

  private novaParte() {
    if (!this.saida) return;
    const tipo = tipoAudio();
    const rec = new MediaRecorder(this.saida, { ...(tipo ? { mimeType: tipo } : {}), audioBitsPerSecond: 32_000 });
    this.rec = rec;
    this.pedacos = [];
    this.inicioParte = Date.now();
    const ordem = this.ordem++;
    rec.ondataavailable = e => { if (e.data.size) this.pedacos.push(e.data); };
    rec.onstop = () => {
      const audio = new Blob(this.pedacos, { type: rec.mimeType || "audio/webm" });
      const duracao = (Date.now() - this.inicioParte) / 1000;
      if (audio.size > 1000) this.enfileirar(ordem, audio, duracao);
      if (!this.parando) this.novaParte();
    };
    rec.start(10_000);
    this.timer = window.setTimeout(() => { if (rec.state === "recording") rec.stop(); }, PARTE_SEGUNDOS * 1000);
  }

  private enfileirar(ordem: number, audio: Blob, duracao: number) {
    this.estado = { ...this.estado, pendentes: this.estado.pendentes + 1 };
    this.aoMudar(this.estado);
    this.fila = this.fila.then(async () => {
      try {
        const aviso = await enviarParte(this.reuniaoId, ordem, audio, duracao);
        this.estado = { ...this.estado, enviadas: this.estado.enviadas + 1, pendentes: this.estado.pendentes - 1, erro: aviso ?? this.estado.erro };
      } catch (e: any) {
        this.estado = { ...this.estado, pendentes: this.estado.pendentes - 1, erro: `Parte ${ordem + 1}: ${e?.message || "falhou"}` };
      }
      this.aoMudar(this.estado);
    });
  }

  /** Para a gravação e espera todas as partes subirem */
  async parar(): Promise<EstadoEnvio> {
    this.parando = true;
    if (this.timer) window.clearTimeout(this.timer);
    const rec = this.rec;
    if (rec && rec.state !== "inactive") await new Promise<void>(ok => { rec.addEventListener("stop", () => ok(), { once: true }); rec.stop(); });
    this.streams.forEach(s => s.getTracks().forEach(t => t.stop()));
    await this.ctx?.close().catch(() => {});
    try { await this.trava?.release?.(); } catch { /* */ }
    await this.fila;
    return this.estado;
  }
}
