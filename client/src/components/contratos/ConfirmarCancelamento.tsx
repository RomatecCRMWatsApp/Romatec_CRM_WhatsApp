import { useEffect, useState } from "react";
import { Loader2, Lock, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Modal do cancelamento. Com senha (administrador): "Digite sua senha para confirmar" — a senha é a de login
 * dele, conferida no servidor. Sem senha (corretor/secretária): só o motivo, e vira um pedido ao administrador.
 */
export default function ConfirmarCancelamento({ aberto, onFechar, titulo, descricao, comSenha, motivoInicial = "", rotuloBotao, pendente, onConfirmar }: {
  aberto: boolean; onFechar: () => void; titulo: string; descricao: React.ReactNode; comSenha: boolean; motivoInicial?: string;
  rotuloBotao: string; pendente: boolean; onConfirmar: (motivo: string, senha: string) => void;
}) {
  const [motivo, setMotivo] = useState(motivoInicial);
  const [senha, setSenha] = useState("");
  useEffect(() => { if (aberto) { setMotivo(motivoInicial); setSenha(""); } }, [aberto, motivoInicial]);
  const minimo = comSenha ? 3 : 5;
  const ok = motivo.trim().length >= minimo && (!comSenha || senha.length > 0);
  return (
    <Dialog open={aberto} onOpenChange={v => !v && !pendente && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-300"><XCircle className="h-5 w-5" /> {titulo}</DialogTitle>
          <DialogDescription asChild><div className="text-sm text-muted-foreground">{descricao}</div></DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (ok && !pendente) onConfirmar(motivo.trim(), senha); }}>
          <label className="block text-xs text-muted-foreground">Motivo
            <Textarea className="mt-1" rows={3} maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: cliente desistiu antes da assinatura" />
          </label>
          {comSenha && (
            <label className="block text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Digite sua senha para confirmar o cancelamento</span>
              <Input className="mt-1" type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} />
              <span className="mt-1 block text-[11px]">É a mesma senha do seu login. Sem ela, nada é cancelado.</span>
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={pendente} onClick={onFechar}>Voltar</Button>
            <Button type="submit" variant="destructive" disabled={!ok || pendente}>{pendente && <Loader2 className="h-4 w-4 animate-spin" />} {rotuloBotao}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
