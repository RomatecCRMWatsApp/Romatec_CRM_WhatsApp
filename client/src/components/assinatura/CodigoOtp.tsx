import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, FileSignature, Loader2 } from "lucide-react";
import { ControleTentativas, ESPERA_REENVIO_S, MENSAGEM_OTP, TAMANHO_OTP, estadoDaFalha, normalizarCodigo, type EstadoOtp, type FalhaApi } from "@shared/codigoOtp";

interface Props {
  /** Telefone mascarado devolvido pelo servidor ao enviar o código */
  destino: string;
  /** Envia o código ao servidor (lança FalhaApi em erro). A assinatura vale quando o servidor responde, não quando a animação termina */
  confirmar: (codigo: string) => Promise<void>;
  /** Pede um novo código (o servidor aplica o intervalo mínimo e troca o código vigente) */
  reenviar: () => Promise<void>;
  /** Depois do efeito de confirmação (ou na hora, com movimento reduzido): a página mostra a assinatura registrada */
  aoConcluir: () => void;
  /** O servidor disse que o código já foi usado / contrato já assinado: a página busca a situação real */
  aoRecarregar: () => void;
  /** Leitura e aceite ainda pendentes */
  bloqueado?: string | null;
  cores: { verde: string; dourado: string };
}

const comoFalha = (e: unknown): FalhaApi => {
  if (!e || typeof e !== "object") return {};
  const x = e as FalhaApi & { message?: string };
  return { codigo: x.codigo, status: x.status, rede: x.rede, mensagem: x.mensagem ?? x.message };
};

/**
 * Campo do código de 6 dígitos: um único input real (leitores de tela, colar, preencher automático do celular),
 * desenhado em segmentos. Verde e ícone de confirmação só depois da resposta positiva do servidor.
 */
export function CodigoOtp({ destino, confirmar, reenviar, aoConcluir, aoRecarregar, bloqueado, cores }: Props) {
  const [valor, setValor] = useState("");
  const [estado, setEstado] = useState<EstadoOtp>("editando");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [focado, setFocado] = useState(false);
  const [espera, setEspera] = useState(ESPERA_REENVIO_S);
  const [orbitas, setOrbitas] = useState<number[]>([]);
  const controle = useRef(new ControleTentativas());
  const campo = useRef<HTMLInputElement>(null);
  const segmentos = useRef<HTMLDivElement>(null);
  const reenviando = useRef(false);

  useEffect(() => () => { controle.current.desmontar(); }, []);
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const verificando = estado === "verificando";
  const confirmado = estado === "confirmado";
  const comErro = ["invalido", "expirado", "bloqueado", "sem_conexao", "erro"].includes(estado);

  const mudar = (bruto: string) => {
    const n = normalizarCodigo(bruto);
    setValor(n.valor); setAviso(n.aviso);
    if (estado !== "editando") { setEstado("editando"); setMensagem(null); }
  };

  /** Centros dos segmentos em relação ao centro do campo: ponto de partida de cada dígito na órbita */
  const medirOrbitas = () => {
    const caixa = segmentos.current;
    if (!caixa) return [];
    const r = caixa.getBoundingClientRect(), centro = r.left + r.width / 2;
    return Array.from(caixa.children).map(el => { const b = (el as HTMLElement).getBoundingClientRect(); return b.left + b.width / 2 - centro; });
  };

  const enviar = async (e?: FormEvent) => {
    e?.preventDefault();
    if (bloqueado || valor.length !== TAMANHO_OTP || confirmado) return;
    const t = controle.current.iniciar();
    if (!t) return; // já há uma tentativa em curso (Enter + clique)
    const enviado = valor;
    setEstado("verificando"); setMensagem(MENSAGEM_OTP.verificando);
    try {
      await confirmar(enviado);
      if (!controle.current.vale(t)) return;
      const posicoes = medirOrbitas();
      setOrbitas(posicoes);
      setEstado("confirmado"); setMensagem(MENSAGEM_OTP.confirmado);
      setValor("");
      const reduzido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      setTimeout(aoConcluir, reduzido ? 400 : 1100);
    } catch (err) {
      if (!controle.current.vale(t)) return;
      const r = estadoDaFalha(comoFalha(err));
      if (r.estado === "recarregar") { setMensagem(r.mensagem); aoRecarregar(); return; }
      setEstado(r.estado); setMensagem(r.mensagem);
      if (r.estado === "invalido") requestAnimationFrame(() => { campo.current?.focus(); campo.current?.select(); });
    } finally {
      controle.current.terminar(t);
    }
  };

  const pedirOutro = async () => {
    if (verificando || reenviando.current || espera > 0) return;
    reenviando.current = true;
    try {
      await reenviar();
      controle.current.novoDesafio(); // respostas do código anterior deixam de valer
      setValor(""); setAviso(null); setEstado("editando"); setMensagem("Enviamos um novo código. O anterior deixou de valer.");
      setEspera(ESPERA_REENVIO_S);
      campo.current?.focus();
    } catch (err) {
      const f = comoFalha(err);
      setMensagem(f.rede ? MENSAGEM_OTP.semConexao : f.mensagem || "Não foi possível enviar outro código agora.");
      if (f.codigo === "AGUARDE") setEspera(ESPERA_REENVIO_S);
    } finally {
      reenviando.current = false;
    }
  };

  const ativo = Math.min(valor.length, TAMANHO_OTP - 1);
  const borda = (i: number): CSSProperties => {
    if (comErro) return { borderColor: "var(--c-dc2626, #dc2626)" };
    if (focado && i === ativo && !verificando) return { borderColor: cores.verde, boxShadow: `0 0 0 3px color-mix(in srgb, ${cores.dourado} 45%, transparent)` };
    return { borderColor: i < valor.length ? cores.verde : "color-mix(in srgb, currentColor 25%, transparent)" };
  };

  return (
    <form onSubmit={enviar} className="space-y-2" noValidate>
      <label htmlFor="codigo-otp" className="block text-sm font-medium">Código de confirmação</label>
      <p id="codigo-otp-instrucao" className="text-xs text-neutro-600">
        Digite o código de {TAMANHO_OTP} dígitos enviado para o WhatsApp {destino}. Ele vale por 10 minutos.
      </p>

      <div className="relative w-full max-w-[22rem]">
        {/* Segmentos (só visual) */}
        <div ref={segmentos} aria-hidden="true" className={`flex gap-1.5 transition-opacity duration-200 ${confirmado ? "opacity-0" : ""}`}>
          {Array.from({ length: TAMANHO_OTP }, (_, i) => (
            <div key={i} className="flex h-14 min-w-0 flex-1 items-center justify-center rounded-lg border-2 bg-white text-2xl font-semibold tabular-nums transition-[border-color,box-shadow] duration-150"
              style={{ ...borda(i), color: cores.verde, maxWidth: "3.25rem" }}>
              {valor[i] ?? (focado && i === ativo && !verificando ? <span className="h-6 w-0.5 animate-pulse" style={{ background: cores.verde }} /> : "")}
            </div>
          ))}
        </div>

        {/* Campo real: transparente por cima dos segmentos */}
        <input
          id="codigo-otp" ref={campo} name="codigo" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*"
          value={valor} onChange={e => mudar(e.target.value)} onFocus={() => setFocado(true)} onBlur={() => setFocado(false)}
          readOnly={verificando || confirmado} disabled={!!bloqueado} autoFocus={!bloqueado}
          aria-describedby="codigo-otp-instrucao codigo-otp-status" aria-invalid={comErro || undefined}
          className="absolute inset-0 h-full w-full cursor-text rounded-lg bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent selection:text-transparent disabled:cursor-not-allowed"
          style={{ fontSize: 16 }}
        />

        {/* Confirmação: dígitos em órbita fundindo no bloco (camada isolada, sem deslocar o layout) */}
        {confirmado && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {/* Órbita elíptica: a camada achata o movimento em Y para caber na altura do campo */}
            <div className="absolute inset-0 flex items-center justify-center" style={{ transform: "scaleY(0.2)" }}>
              {orbitas.map((x, i) => (
                <span key={i} className="otp-orbita absolute" style={{ "--otp-x": `${x}px` } as CSSProperties}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-semibold" style={{ transform: "scaleY(5)", background: cores.verde, color: "white" }}>•</span>
                </span>
              ))}
            </div>
            <div className="otp-bloco flex h-14 items-center gap-2 rounded-xl px-5 font-semibold text-white shadow-lg" style={{ background: cores.verde }}>
              <CheckCircle2 className="h-5 w-5" style={{ color: cores.dourado }} /> {MENSAGEM_OTP.confirmado}
            </div>
          </div>
        )}
      </div>

      <p id="codigo-otp-status" role="status" aria-live="polite" className={`flex min-h-5 items-start gap-1.5 text-sm ${comErro ? "text-danger-800" : "text-neutro-700"}`}>
        {comErro && <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
        {verificando && <Loader2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />}
        <span>{aviso ?? mensagem ?? (bloqueado || "")}</span>
      </p>

      {/* Some na confirmação sem deslocar o layout */}
      {(
        <div className={`flex flex-wrap items-center gap-3 ${confirmado ? "invisible" : ""}`} aria-hidden={confirmado || undefined}>
          <button type="submit" disabled={!!bloqueado || valor.length !== TAMANHO_OTP || verificando}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: cores.dourado, color: cores.verde }}>
            {verificando ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <FileSignature aria-hidden="true" className="h-4 w-4" />}
            {verificando ? "Verificando…" : "Assinar contrato"}
          </button>
          <button type="button" onClick={pedirOutro} disabled={verificando || espera > 0}
            className="min-h-11 text-sm underline underline-offset-2 disabled:no-underline disabled:opacity-60">
            {espera > 0 ? `Pedir outro código em ${espera}s` : "Pedir outro código"}
          </button>
        </div>
      )}
    </form>
  );
}
