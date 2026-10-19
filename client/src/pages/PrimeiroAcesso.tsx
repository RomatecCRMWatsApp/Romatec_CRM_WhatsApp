import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

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

  const campo = "w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600";

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-slate-50 to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="flex justify-center mb-4"><img src="/icon-192x192.png" alt="Romatec CRM" className="h-20 w-20 rounded-2xl" /></div>
        <h1 className="text-2xl font-bold text-slate-900 text-center mb-1">Primeiro acesso</h1>

        {!token || (!isLoading && !data?.valido) ? (
          <p className="text-center text-slate-600 mt-4">Este link é inválido ou já venceu. Peça um novo link ao administrador do CRM.</p>
        ) : isLoading ? (
          <p className="text-center text-slate-500 mt-4">Carregando...</p>
        ) : pronto ? (
          <div className="text-center space-y-4 mt-4">
            <p className="text-slate-700">Senha criada! A partir de agora, entre com <b>{pronto}</b> e a sua senha.</p>
            <Button className="w-full bg-emerald-700 hover:bg-emerald-800 text-white" onClick={() => navigate("/login")}>Ir para o login</Button>
          </div>
        ) : (
          <>
            <p className="text-center text-slate-600 mb-6">
              Olá{data?.valido && data.nome ? `, ${data.nome}` : ""}! Confirme seu e-mail e crie sua senha.
              {data?.valido && data.login === "creci" ? <> Depois você entra com o <b>CRECI {data.creci}</b>.</> : null}
            </p>
            <form onSubmit={enviar} className="space-y-4 text-left">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">E-mail cadastrado {data?.valido ? <span className="text-slate-400">({data.emailDica})</span> : null}</label>
                <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className={campo} placeholder="seu@email.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Crie sua senha</label>
                <input type="password" required minLength={8} autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)} className={campo} placeholder="Pelo menos 8 caracteres, não só números" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Repita a senha</label>
                <input type="password" required autoComplete="new-password" value={senha2} onChange={e => setSenha2(e.target.value)} className={campo} />
              </div>
              {erro && <p className="text-sm text-red-600">{erro}</p>}
              <Button type="submit" disabled={aceitar.isPending} className="w-full bg-emerald-700 hover:bg-emerald-800 text-white">{aceitar.isPending ? "Salvando..." : "Criar senha"}</Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
