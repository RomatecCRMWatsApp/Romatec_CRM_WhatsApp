import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { perfilDe, telaInicial } from "@shared/equipe";
import { APP_VERSION, ROMATEC_CONTACT, brandAssets } from "@/brand";
import { OURO_JURIDICO, SeloJuridico } from "@/components/juridico/SeloJuridico";
import { marcarAreaLogin } from "@/const";

/**
 * Login do corpo jurídico (/juridico/entrar): o mesmo acesso do CRM com a identidade jurídica — selo com a balança
 * e os louros, logotipo Romatec | JURÍDICO e o dourado mais vivo. Advogado entra direto no portal jurídico.
 */
export default function LoginJuridico() {
  const { isAuthenticated, login, user } = useAuth();
  const [, navigate] = useLocation();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  useEffect(() => { marcarAreaLogin("juridico"); }, []);
  useEffect(() => {
    if (isAuthenticated) navigate((user as any)?.trocarSenha ? "/trocar-senha" : telaInicial(perfilDe(user as any)));
  }, [isAuthenticated, user, navigate]);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEntrando(true);
    setErro("");
    const falha = await login(usuario, senha);
    if (falha) setErro(falha);
    setEntrando(false);
  };

  const campo = "w-full rounded-[12px] border border-[var(--rt-border)] bg-black px-3 py-2.5 text-[var(--rt-text)] placeholder:text-[var(--rt-text-3)] focus:outline-none focus:border-[#F6D56B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F6D56B]";
  const rotulo = "mb-1 block text-xs font-bold";
  return (
    <div className="flex min-h-screen flex-col bg-black">
      <div className="h-1.5 shrink-0" style={{ background: `linear-gradient(90deg, ${OURO_JURIDICO.escuro}, ${OURO_JURIDICO.claro}, ${OURO_JURIDICO.escuro})` }} />
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8" style={{ background: "radial-gradient(ellipse at 50% 0%, #14361f 0%, #000 55%)" }}>
        <SeloJuridico tamanho={210} className="max-w-[60vw] h-auto" />
        <div className="flex items-center gap-2.5">
          <img src={brandAssets.wordmark} alt="Romatec Consultoria Total" className="h-8 w-auto sm:h-9" draggable={false} />
          <span className="border-l-2 pl-2.5 text-xs font-bold tracking-[0.3em]" style={{ borderColor: OURO_JURIDICO.base, color: OURO_JURIDICO.base }}>JURÍDICO</span>
        </div>

        <div className="w-full max-w-md rounded-[18px] border bg-[var(--rt-surface)] p-7" style={{ borderColor: OURO_JURIDICO.base, boxShadow: "0 0 0 1px rgba(232,185,49,.15), 0 20px 60px rgba(0,0,0,.6)" }}>
          <p className="text-center text-sm italic" style={{ color: OURO_JURIDICO.claro, fontFamily: "Georgia, serif" }}>Ética, segurança jurídica e transparência</p>
          <h1 className="mt-1 text-center text-[22px] font-semibold" style={{ color: OURO_JURIDICO.claro, fontFamily: "var(--rt-font-title)" }}>Acesso do advogado</h1>
          <p className="mb-6 mt-1 text-center text-sm text-[var(--rt-text-2)]">Entre com o seu CPF ou e-mail e a senha</p>
          <form onSubmit={entrar} className="space-y-4 text-left">
            <div>
              <label htmlFor="jur-usuario" className={rotulo} style={{ color: OURO_JURIDICO.base }}>CPF ou e-mail</label>
              <input id="jur-usuario" type="text" value={usuario} onChange={e => setUsuario(e.target.value)} className={campo}
                placeholder="000.000.000-00 ou seu@email.com" autoComplete="username" required />
            </div>
            <div>
              <label htmlFor="jur-senha" className={rotulo} style={{ color: OURO_JURIDICO.base }}>Senha</label>
              <input id="jur-senha" type="password" value={senha} onChange={e => setSenha(e.target.value)} className={campo}
                placeholder="••••••••" autoComplete="current-password" required />
            </div>
            {erro && <p className="text-sm text-[var(--rt-danger)]" role="alert">{erro}</p>}
            <button type="submit" disabled={entrando}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-[12px] text-[15px] font-bold text-[#1b1402] transition-[filter,transform] hover:brightness-110 active:translate-y-px disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F6D56B]"
              style={{ background: `linear-gradient(180deg, ${OURO_JURIDICO.claro}, ${OURO_JURIDICO.base} 55%, ${OURO_JURIDICO.escuro})` }}>
              {entrando && <Loader2 className="h-4 w-4 animate-spin" />}{entrando ? "Entrando…" : "Entrar no portal jurídico"}
            </button>
          </form>
        </div>

        <div className="text-center text-xs leading-relaxed text-[var(--rt-text-3)]">
          <p>Romatec Consultoria Total · CRECI J-1234 · acesso restrito aos advogados credenciados (OAB)</p>
          <p>WhatsApp {ROMATEC_CONTACT.whatsappLabel} · CNPJ {ROMATEC_CONTACT.cnpj}</p>
          <p className="mt-1 tabular-nums text-[11px]" style={{ color: OURO_JURIDICO.claro }}>v{APP_VERSION}</p>
        </div>
      </main>
    </div>
  );
}
