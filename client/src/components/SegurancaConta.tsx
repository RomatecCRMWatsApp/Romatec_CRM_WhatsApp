import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Meu cadastro › Senha e acesso: trocar a senha (com a atual) e sair de todos os outros aparelhos.
 * Trocar a senha também derruba os outros celulares/computadores logados (fica marcado por padrão).
 */
export default function SegurancaConta() {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [sairDosOutros, setSairDosOutros] = useState(true);
  const [erro, setErro] = useState("");
  const trocar = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success(sairDosOutros ? "Senha alterada. Os outros aparelhos foram desconectados; você continua logado aqui." : "Senha alterada.");
      setAtual(""); setNova(""); setConfirma(""); setErro("");
    },
    onError: e => setErro(e.message),
  });
  const sair = trpc.auth.sairDosOutrosAparelhos.useMutation({
    onSuccess: () => toast.success("Pronto: todos os outros aparelhos foram desconectados. Você continua logado aqui."),
    onError: e => toast.error(e.message),
  });
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (nova !== confirma) { setErro("As duas senhas novas não conferem."); return; }
    trocar.mutate({ currentPassword: atual, newPassword: nova, sairDosOutros });
  };

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-emerald-400" />
        <h2 className="text-base font-semibold">Senha e acesso</h2>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={enviar} className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-medium"><KeyRound className="h-4 w-4" /> Alterar a senha</p>
          <label className="block space-y-1 text-xs text-muted-foreground">Senha atual
            <Input id="senha-atual" type="password" value={atual} onChange={e => setAtual(e.target.value)} autoComplete="current-password" required />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block space-y-1 text-xs text-muted-foreground">Nova senha
              <Input id="senha-nova" type="password" value={nova} onChange={e => setNova(e.target.value)} autoComplete="new-password" minLength={8} required />
            </label>
            <label className="block space-y-1 text-xs text-muted-foreground">Repita a nova senha
              <Input id="senha-confirma" type="password" value={confirma} onChange={e => setConfirma(e.target.value)} autoComplete="new-password" minLength={8} required />
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">Pelo menos 8 caracteres, não só números.</p>
          <label className="flex items-center gap-2 text-xs">
            <input id="senha-sair-outros" type="checkbox" checked={sairDosOutros} onChange={e => setSairDosOutros(e.target.checked)} className="h-4 w-4" />
            Desconectar os outros celulares e computadores
          </label>
          {erro && <p className="text-sm text-red-400">{erro}</p>}
          <Button type="submit" disabled={trocar.isPending}>{trocar.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Alterar senha</Button>
        </form>
        <div className="space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium"><LogOut className="h-4 w-4" /> Sair de todos os outros aparelhos</p>
          <p className="text-xs text-muted-foreground">Entrou em outro celular ou computador, perdeu o aparelho ou alguém usou a sua senha? Desconecte todos os outros lugares agora. Você continua logado só neste aparelho. Se a senha foi passada para outra pessoa, troque a senha também.</p>
          <Button variant="outline" disabled={sair.isPending}
            onClick={() => { if (confirm("Desconectar todos os outros celulares e computadores logados na sua conta?")) sair.mutate(); }}>
            {sair.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <LogOut className="mr-1 h-4 w-4" />} Sair de todos os outros aparelhos
          </Button>
        </div>
      </div>
    </section>
  );
}
