import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { LoadingButton, RomatecLockup } from "@/brand";

/** Primeiro acesso pelo link do convite: confirma o e-mail e cria a senha */
export default function PrimeiroAcesso() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("convite") || "";
  const { data, isLoading } = trpc.equipe.convite.useQuery({ token }, { enabled: token.length >= 20, retry: false });
  const aceitar = trpc.equipe.aceitarConvite.useMutation();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState<string | null>(null);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (senha !== senha2) { setErro("As duas senhas não são iguais."); return; }
    try {
      const r = await aceitar.mutateAsync({ token, email, senha });
      setPronto(r.login);
    } catch (e: any) {
      setErro(e?.message || "Não foi possível concluir. Tente de novo.");
    }
  };

  const campo = "w-full rounded-[12px] border border-[var(--rt-border)] bg-[var(--rt-bg)] px-3 py-2.5 text-[var(--rt-text)] placeholder:text-[var(--rt-text-3)] focus:outline-none focus:border-[var(--rt-gold-light)]";
  const rotulo = "block text-xs font-bold uppercase tracking-[2px] text-[var(--rt-gold)] mb-1";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-4" style={{ background: "radial-gradient(circle at 50% 30%, #0A1F14 0%, #000 62%)" }}>
      <RomatecLockup variant="stack" height={72} />
      <div className="w-full max-w-md rounded-[18px] border border-[var(--rt-border)] bg-[var(--rt-surface)] p-7">
        <h1 className="text-[22px] font-semibold text-[var(--rt-gold-light)] text-center mb-1" style={{ fontFamily: "var(--rt-font-title)" }}>Primeiro acesso</h1>

        {!token || (!isLoading && !data?.valido) ? (
          <p className="text-center text-[var(--rt-text-2)] mt-4">Este link é inválido ou já venceu. Peça um novo link ao administrador do CRM.</p>
        ) : isLoading ? (
          <p className="text-center text-[var(--rt-text-3)] mt-4">Carregando...</p>
        ) : pronto ? (
          <div className="text-center space-y-4 mt-4">
            <p className="text-[var(--rt-text-2)]">Senha criada! A partir de agora, entre com <b className="text-[var(--rt-gold-light)]">{pronto}</b> e a sua senha.</p>
            <button className="rt-btn w-full" onClick={() => navigate("/login")}>Ir para o login</button>
          </div>
        ) : (
          <>
            <p className="text-center text-[var(--rt-text-2)] mb-6">
              Olá{data?.valido && data.nome ? `, ${data.nome}` : ""}! Confirme seu e-mail e crie sua senha.
              {data?.valido && data.login === "creci" ? <> Depois você entra com o <b className="text-[var(--rt-gold-light)]">CRECI {data.creci}</b>.</> : null}
            </p>
            <form onSubmit={enviar} className="space-y-4 text-left">
              <div>
                <label className={rotulo}>E-mail cadastrado {data?.valido ? <span className="normal-case tracking-normal text-[var(--rt-text-3)]">({data.emailDica})</span> : null}</label>
                <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={campo} placeholder="seu@email.com" />
              </div>
              <div>
                <label className={rotulo}>Crie sua senha</label>
                <input type="password" required minLength={8} autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)} className={campo} placeholder="Pelo menos 8 caracteres, não só números" />
              </div>
              <div>
                <label className={rotulo}>Repita a senha</label>
                <input type="password" required autoComplete="new-password" value={senha2} onChange={e => setSenha2(e.target.value)} className={campo} />
              </div>
              {erro && <p className="text-sm text-[var(--rt-danger)]">{erro}</p>}
              <LoadingButton type="submit" loading={aceitar.isPending} loadingText="Salvando…" className="w-full">Criar senha</LoadingButton>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
