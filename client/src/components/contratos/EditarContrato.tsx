import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PessoaCampos, { PESSOA_VAZIA } from "@/components/cadastro/PessoaCampos";
import { Campo, classeCampo, sel } from "@/components/cadastro/campos";
import { maskCEP, maskCPF, maskPhone } from "@shared/masks";
import { exigeConjuge, pendenciasComprador, type PessoaForm } from "@shared/contratos";

/** Linha do cadastro (pessoas) → formulário */
function paraForm(x: any | null | undefined): PessoaForm {
  if (!x) return { ...PESSOA_VAZIA };
  const v = (k: string) => (x[k] == null ? "" : String(x[k]));
  return {
    ...PESSOA_VAZIA,
    nome: v("nome"), cpf: x.cpfCnpj ? maskCPF(String(x.cpfCnpj)) : "", sexo: v("sexo"), nacionalidade: v("nacionalidade") || "brasileira",
    estadoCivil: v("estadoCivil"), regimeBens: v("regimeBens"), pactoAntenupcial: v("pactoAntenupcial"), profissao: v("profissao"),
    nascimento: v("nascimento").slice(0, 10), rg: v("rg"), rgOrgao: v("rgOrgao") || "SSP", rgUf: v("rgUf") || "MA", email: v("email"),
    telefone1: x.telefone1 ? maskPhone(String(x.telefone1).replace(/^55(?=\d{10,11}$)/, "")) : "", cep: x.cep ? maskCEP(String(x.cep)) : "",
    logradouro: v("logradouro"), numero: v("numero"), complemento: v("complemento"), bairro: v("bairro"), cidade: v("cidade"), uf: v("uf") || "MA",
  };
}

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onSalvo: () => void;
  contrato: { id: number; numero: string; status: string; empreendimentoSlug: string; corretorUserId: number; condicoesEspecificas?: string };
  comprador: any;
  conjuge: any;
}

/** Editar o contrato (só o administrador, com a senha de login): comprador, cônjuge, corretor e condições específicas */
export function EditarContrato({ aberto, onFechar, onSalvo, contrato, comprador, conjuge }: Props) {
  const pode = trpc.contratos.edicao.useQuery({ id: contrato.id }, { enabled: aberto });
  const opcoes = trpc.contratos.opcoes.useQuery({ slug: contrato.empreendimentoSlug }, { enabled: aberto && !!contrato.empreendimentoSlug });
  const [c, setC] = useState<PessoaForm>(PESSOA_VAZIA);
  const [j, setJ] = useState<PessoaForm>(PESSOA_VAZIA);
  const [corretor, setCorretor] = useState(contrato.corretorUserId);
  const [especificas, setEspecificas] = useState("");
  const [senha, setSenha] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!aberto) return;
    setC(paraForm(comprador)); setJ(paraForm(conjuge)); setCorretor(contrato.corretorUserId);
    setEspecificas(contrato.condicoesEspecificas === "Não há." ? "" : contrato.condicoesEspecificas ?? ""); setSenha(""); setErros({});
  }, [aberto, comprador, conjuge, contrato.corretorUserId, contrato.condicoesEspecificas]);
  const editar = trpc.contratos.editar.useMutation({
    onSuccess: r => {
      toast.success(r.voltouRascunho ? "Contrato atualizado. Ele voltou a rascunho: gere a minuta/definitivo de novo." : r.soCadastral ? "Cadastro corrigido. O PDF assinado continua o oficial (alteração na trilha)." : "Contrato atualizado");
      onSalvo(); onFechar();
    },
    onError: e => toast.error(e.message),
  });
  const temConjuge = exigeConjuge(c.estadoCivil);
  const salvar = () => {
    const e = pendenciasComprador(c, temConjuge ? j : null);
    setErros(e);
    if (Object.keys(e).length) return toast.error(`Confira: ${Object.values(e).join(", ")}`);
    if (!senha) return toast.error("Digite a sua senha de login para confirmar");
    editar.mutate({
      id: contrato.id, senha, comprador: c, conjuge: temConjuge ? j : null,
      ...(corretor && corretor !== contrato.corretorUserId ? { corretorUserId: corretor } : {}),
      condicoesEspecificas: especificas,
    });
  };
  const corretores: any[] = (opcoes.data as any)?.corretores ?? [];

  return (
    <Dialog open={aberto} onOpenChange={v => !v && !editar.isPending && onFechar()}>
      <DialogContent className="bg-card border-border sm:max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-foreground">Editar contrato {contrato.numero}</DialogTitle>
          <DialogDescription>
            Só o administrador. {pode.data?.voltaRascunho && "O contrato já foi gerado: depois de salvar ele volta a rascunho e a rodada de assinaturas pendente é descartada — gere o PDF de novo. "}
            {pode.data?.soCadastral && "Contrato já assinado: vale como correção do cadastro; o PDF assinado continua o oficial (para mudar condições, use termo aditivo). "}
          </DialogDescription>
        </DialogHeader>
        {pode.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : !pode.data?.editar ? (
          <p className="text-sm text-danger-400">Contrato cancelado ou distratado não pode ser editado.</p>
        ) : (
          <div className="space-y-5">
            <section className="space-y-2"><h3 className="text-sm font-semibold">Comprador(a)</h3><PessoaCampos p={c} set={(k, v) => setC(x => ({ ...x, [k]: v }))} erros={erros} prefixo="comprador" /></section>
            {temConjuge && <section className="space-y-2"><h3 className="text-sm font-semibold">Cônjuge / companheiro(a)</h3><PessoaCampos p={j} set={(k, v) => setJ(x => ({ ...x, [k]: v }))} erros={erros} prefixo="conjuge" conjuge /></section>}
            <section className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Corretor da venda">
                <select className={sel} value={corretor} onChange={e => setCorretor(Number(e.target.value))}>
                  {!corretores.some(x => x.id === contrato.corretorUserId) && <option value={contrato.corretorUserId}>(atual)</option>}
                  {corretores.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Condições específicas (sai no contrato)" className="sm:col-span-2">
                <textarea className={`${classeCampo()} min-h-[64px]`} maxLength={2000} value={especificas} onChange={e => setEspecificas(e.target.value)} placeholder="Não há." />
              </Campo>
            </section>
            <Campo rotulo="Sua senha de login (confirma a alteração)">
              <input type="password" autoComplete="current-password" className={classeCampo()} value={senha} onChange={e => setSenha(e.target.value)} />
            </Campo>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={editar.isPending}>Fechar</Button>
          {pode.data?.editar && <Button onClick={salvar} disabled={editar.isPending}>{editar.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Salvar alterações</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Excluir o contrato (só o administrador, com a senha): só sem dinheiro envolvido; com pagamento, o caminho é Cancelar */
export function ExcluirContrato({ aberto, onFechar, onExcluido, contrato }: { aberto: boolean; onFechar: () => void; onExcluido: () => void; contrato: { id: number; numero: string; loteCodigo?: string } }) {
  const pode = trpc.contratos.edicao.useQuery({ id: contrato.id }, { enabled: aberto });
  const [motivo, setMotivo] = useState("");
  const [senha, setSenha] = useState("");
  useEffect(() => { if (aberto) { setMotivo(""); setSenha(""); } }, [aberto]);
  const excluir = trpc.contratos.excluir.useMutation({
    onSuccess: r => { toast.success(`Contrato ${r.numero} excluído${r.loteLiberado ? " — chácara de volta a disponível" : ""}`); onExcluido(); },
    onError: e => toast.error(e.message),
  });
  return (
    <Dialog open={aberto} onOpenChange={v => !v && !excluir.isPending && onFechar()}>
      <DialogContent className="bg-card border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">Excluir o contrato {contrato.numero}?</DialogTitle>
          <DialogDescription>Apaga o contrato, as versões, as assinaturas pendentes e as cobranças só previstas{contrato.loteCodigo ? `, e a chácara ${contrato.loteCodigo} volta a disponível` : ""}. A trilha de auditoria fica guardada. Não dá para desfazer.</DialogDescription>
        </DialogHeader>
        {pode.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : !pode.data?.excluir ? (
          <p className="text-sm text-danger-400">{pode.data?.motivoNaoExcluir ?? "Este contrato não pode ser excluído."}</p>
        ) : (
          <div className="space-y-3">
            <Campo rotulo="Motivo"><input className={classeCampo()} value={motivo} maxLength={300} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: contrato de teste" /></Campo>
            <Campo rotulo="Sua senha de login"><input type="password" autoComplete="current-password" className={classeCampo()} value={senha} onChange={e => setSenha(e.target.value)} /></Campo>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={excluir.isPending}>Fechar</Button>
          {pode.data?.excluir && (
            <Button variant="destructive" disabled={excluir.isPending || motivo.trim().length < 3 || !senha} onClick={() => excluir.mutate({ id: contrato.id, motivo, senha })}>
              {excluir.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />} Excluir definitivamente
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
