import { useEffect, useState } from "react";
import { Loader2, Lock, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Exclusão definitiva (só administrador): confirma com a senha de login, conferida no servidor (server/exclusao.ts) */
export default function ConfirmarExclusao({ alvo, onFechar, pendente, onConfirmar }: {
  alvo: { titulo: string; descricao: React.ReactNode } | null; onFechar: () => void; pendente: boolean; onConfirmar: (senha: string) => void;
}) {
  const [senha, setSenha] = useState("");
  useEffect(() => { if (alvo) setSenha(""); }, [alvo]);
  return (
    <Dialog open={!!alvo} onOpenChange={v => !v && !pendente && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-300"><Trash2 className="h-5 w-5" /> {alvo?.titulo}</DialogTitle>
          <DialogDescription asChild><div className="text-sm text-muted-foreground">{alvo?.descricao}</div></DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (senha && !pendente) onConfirmar(senha); }}>
          <label className="block text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Digite sua senha para confirmar a exclusão</span>
            <Input className="mt-1" type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} autoFocus />
            <span className="mt-1 block text-[11px]">É a mesma senha do seu login. Não dá para desfazer.</span>
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={pendente} onClick={onFechar}>Voltar</Button>
            <Button type="submit" variant="destructive" disabled={!senha || pendente}>{pendente && <Loader2 className="h-4 w-4 animate-spin" />} Excluir definitivamente</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
