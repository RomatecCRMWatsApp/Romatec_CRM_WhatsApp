import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PessoaCampos, { PESSOA_VAZIA } from "@/components/cadastro/PessoaCampos";
import { maskCEP, maskCPF, maskPhone } from "@shared/masks";
import type { PessoaForm } from "@shared/contratos";

const final11 = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "").slice(-11);

/**
 * Novo cliente / editar cliente com o formulário completo (o mesmo do comprador no contrato).
 * Com CPF, a ficha fica guardada e o contrato desse cliente já sai preenchido; sem CPF, salva só o contato.
 */
export default function FichaCliente({ aberto, contatoId, onFechar, onSalvo }: {
  aberto: boolean; contatoId: number | null; onFechar: () => void; onSalvo: () => void;
}) {
  const [p, setP] = useState<PessoaForm>(PESSOA_VAZIA);
  const { data, isLoading, error } = trpc.contacts.cadastro.useQuery({ id: contatoId ?? 0 }, { enabled: aberto && !!contatoId, retry: false });
  useEffect(() => {
    if (!aberto) return;
    if (!contatoId) { setP({ ...PESSOA_VAZIA }); return; }
    if (!data) return;
    const base = data.pessoa ?? { ...PESSOA_VAZIA, nome: data.contato.name, email: data.contato.email ?? "" };
    setP({
      ...base,
      telefone1: maskPhone(final11(base.telefone1 || data.contato.phone)),
      cpf: base.cpf ? maskCPF(base.cpf) : "", cep: base.cep ? maskCEP(base.cep) : "",
    });
  }, [aberto, contatoId, data]);
  const salvar = trpc.contacts.salvarCompleto.useMutation({
    onSuccess: r => { toast.success(r.ficha ? "Cliente salvo com a ficha completa" : "Contato salvo (sem CPF: só nome, telefone e e-mail)"); onSalvo(); onFechar(); },
    onError: e => toast.error(e.message),
  });
  const set = (k: keyof PessoaForm, v: string) => setP(x => ({ ...x, [k]: v }));
  const carregando = !!contatoId && isLoading;

  return (
    <Dialog open={aberto} onOpenChange={v => !v && !salvar.isPending && onFechar()}>
      {/* sm:max-w-4xl vence o sm:max-w-lg do Dialog base: a ficha tem 4 colunas no computador, 2 no tablet e 1 no celular */}
      <DialogContent className="bg-card border-border sm:max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-foreground">{contatoId ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          <DialogDescription>Nome e telefone são obrigatórios. Com o CPF, a ficha completa fica guardada e o contrato desse cliente já sai preenchido.</DialogDescription>
        </DialogHeader>
        {carregando ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p> : contatoId && error ? <p className="text-sm text-red-500">{error.message}</p> : (
          <PessoaCampos p={p} set={set} erros={{}} prefixo="comprador" />
        )}
        <DialogFooter>
          <Button variant="outline" disabled={salvar.isPending} onClick={onFechar}>Cancelar</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={salvar.isPending || carregando || (!!contatoId && !!error)}
            onClick={() => {
              if (!p.nome.trim() || !p.telefone1) { toast.error("Nome e telefone são obrigatórios"); return; }
              salvar.mutate({ id: contatoId, pessoa: { ...p, nascimento: p.nascimento || null } as any });
            }}>
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
