import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { LoadingButton, RomatecLockup } from "@/brand";

/** 1º acesso com senha provisória (recrutamento): a pessoa cria a própria senha antes de usar o sistema */
export default function TrocarSenha() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [erro, setErro] = useState("");
  const trocar = trpc.auth.changePassword.useMutation({
    onSuccess: async r => { await utils.auth.me.invalidate(); navigate((r as any).destino || "/dashboard"); },
    onError: e => setErro(e.message),
  });
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (nova !== confirma) { setErro("As duas senhas novas não conferem."); return; }
    trocar.mutate({ currentPassword: atual, newPassword: nova });
  };
  const campo = "w-full rounded-[12px] border border-[var(--rt-border)] bg-[var(--rt-bg)] px-3 py-2.5 text-[var(--rt-text)] placeholder:text-[var(--rt-text-3)] focus:outline-none focus:border-[var(--rt-gold-light)]";
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-4" style={{ background: "radial-gradient(circle at 50% 30%, #0A1F14 0%, #000 62%)" }}>
      <RomatecLockup variant="stack" height={80} />
      <form onSubmit={enviar} className="w-full max-w-md space-y-4 rounded-[18px] border border-[var(--rt-border)] bg-[var(--rt-surface)] p-7">
        <div>
          <h1 className="text-xl font-semibold text-[var(--rt-text)]">Crie a sua senha</h1>
          <p className="mt-1 text-sm text-[var(--rt-text-2)]">
            {user?.name ? `${String(user.name).split(" ")[0]}, você` : "Você"} entrou com a senha provisória. Crie agora a sua senha pessoal (pelo menos 8 caracteres, não só números).
          </p>
        </div>
        <label className="block space-y-1 text-sm text-[var(--rt-text-2)]">Senha provisória (a que chegou no WhatsApp)
          <input type="password" className={campo} value={atual} onChange={e => setAtual(e.target.value)} autoComplete="current-password" required />
        </label>
        <label className="block space-y-1 text-sm text-[var(--rt-text-2)]">Nova senha
          <input type="password" className={campo} value={nova} onChange={e => setNova(e.target.value)} autoComplete="new-password" required minLength={8} />
        </label>
        <label className="block space-y-1 text-sm text-[var(--rt-text-2)]">Repita a nova senha
          <input type="password" className={campo} value={confirma} onChange={e => setConfirma(e.target.value)} autoComplete="new-password" required minLength={8} />
        </label>
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <LoadingButton type="submit" loading={trocar.isPending} className="w-full">Salvar e entrar</LoadingButton>
      </form>
    </div>
  );
}
