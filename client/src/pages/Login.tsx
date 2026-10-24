import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { perfilDe, telaInicial } from "@shared/equipe";
import { APP_VERSION, LoadingButton, ROMATEC_CONTACT, RomatecLockup } from "@/brand";

export default function Login() {
  const { isAuthenticated, login, user } = useAuth();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      // Empreendedor vai direto para o painel dele
      navigate(telaInicial(perfilDe(user as any)));
    }
  }, [isAuthenticated, user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const loginError = await login(username, password);
    if (loginError) {
      setError(loginError);
    }
    setLoading(false);
  };

  const campo = "w-full rounded-[12px] border border-[var(--rt-border)] bg-[var(--rt-bg)] px-3 py-2.5 text-[var(--rt-text)] placeholder:text-[var(--rt-text-3)] focus:outline-none focus:border-[var(--rt-gold-light)]";
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-4" style={{ background: "radial-gradient(circle at 50% 30%, #0A1F14 0%, #000 62%)" }}>
      {/* Logo oficial (lockup completo); no celular, o empilhado */}
      <div className="hidden sm:block"><RomatecLockup variant="full" height={120} /></div>
      <div className="sm:hidden"><RomatecLockup variant="stack" height={80} /></div>

      <div className="w-full max-w-md rounded-[18px] border border-[var(--rt-border)] bg-[var(--rt-surface)] p-7">
        <h1 className="text-center text-[22px] font-semibold tracking-wide text-[var(--rt-gold-light)]" style={{ fontFamily: "var(--rt-font-title)" }}>Acesso ao CRM</h1>
        <p className="mb-6 mt-1 text-center text-sm text-[var(--rt-text-2)]">Entre com o seu CRECI, CPF ou e-mail e a senha</p>

        <form onSubmit={handleLogin} className="space-y-4 text-left">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[2px] text-[var(--rt-gold)]">CRECI, CPF ou e-mail</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className={campo}
              placeholder="Ex.: 4705, 000.000.000-00 ou seu@email.com" autoComplete="username" required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-[2px] text-[var(--rt-gold)]">Senha</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={campo}
              placeholder="••••••••" autoComplete="current-password" required />
          </div>
          {error && <p className="text-sm text-[var(--rt-danger)]">{error}</p>}
          <LoadingButton type="submit" loading={loading} loadingText="Entrando…" className="w-full">Entrar</LoadingButton>
        </form>
      </div>

      <div className="text-center text-xs leading-relaxed text-[var(--rt-text-3)]">
        <p>{ROMATEC_CONTACT.endereco1} · {ROMATEC_CONTACT.endereco2}</p>
        <p>WhatsApp {ROMATEC_CONTACT.whatsappLabel} · CNPJ {ROMATEC_CONTACT.cnpj}</p>
        <p className="mt-1 font-mono text-[11px] text-[var(--rt-gold-light)]">v{APP_VERSION}</p>
      </div>
    </div>
  );
}
