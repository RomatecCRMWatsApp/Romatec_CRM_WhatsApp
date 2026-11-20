/**
 * /minha-privacidade — Central de Privacidade do usuário logado: aceite versionado dos Termos/Aviso (opcional enquanto
 * as minutas estão em revisão; nada é bloqueado) e consentimento SEPARADO de marketing, com revogação e histórico.
 */
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

const data = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString("pt-BR") : "—");

function Leitura({ doc, versao, hash, situacao, onAceitar }: { doc: "termos" | "privacidade"; versao: string; hash: string; situacao: string; onAceitar: (doc: "termos" | "privacidade", versao: string, hash: string) => void }) {
  const q = trpc.privacidade.documento.useQuery({ doc });
  return (
    <div className="space-y-2">
      <details>
        <summary className="cursor-pointer font-semibold">{q.data?.titulo ?? doc} — versão {versao}</summary>
        <pre className="whitespace-pre-wrap rounded bg-muted p-3 text-xs">{q.data?.texto}</pre>
      </details>
      {situacao === "aceito" ? <p className="text-sm">Aceito.</p> : (
        <Button size="sm" onClick={() => onAceitar(doc, versao, hash)}>Li e aceito esta versão</Button>
      )}
    </div>
  );
}

export default function MinhaPrivacidade() {
  const q = trpc.privacidade.minhaSituacao.useQuery(undefined, { retry: false });
  const aceitar = trpc.privacidade.aceitar.useMutation({ onSuccess: () => { toast.success("Aceite registrado"); q.refetch(); }, onError: e => toast.error(e.message) });
  const marketing = trpc.privacidade.marketing.useMutation({ onSuccess: () => q.refetch(), onError: e => toast.error(e.message) });
  return (
    <div className="space-y-4 p-4">
      <PageHeader titulo="Central de Privacidade" icone={ShieldCheck} subtitulo={<>Seus aceites e consentimentos. Para pedidos sobre seus dados, use <a className="underline" href="/privacidade">/privacidade</a>.</>} />
      {q.error && <p className="text-muted-foreground">{q.error.message}</p>}
      {q.data && (
        <>
          <Card><CardContent className="space-y-4 pt-4">
            {Object.entries(q.data.documentos).map(([doc, d]: [string, any]) => (
              <Leitura key={doc} doc={doc as "termos" | "privacidade"} versao={d.versao} hash={d.hash} situacao={d.situacao}
                onAceitar={(doc, versao, hash) => aceitar.mutate({ doc, versao, hash })} />
            ))}
          </CardContent></Card>
          <Card><CardContent className="space-y-2 pt-4">
            <label className="flex items-start gap-2 text-sm">
              {/* Nunca pré-marcado: reflete só o que a pessoa escolheu */}
              <input type="checkbox" className="mt-1" checked={q.data.marketing.consentido} onChange={e => marketing.mutate({ consentir: e.target.checked })} />
              <span>{q.data.marketing.texto} <span className="text-muted-foreground">(opcional)</span></span>
            </label>
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">Histórico</summary>
              <ul className="text-xs">{q.data.historico.map((h: any) => <li key={h.id}>{data(h.criadoEm)} — {h.documento} {h.versao}: {h.acao}</li>)}</ul>
            </details>
          </CardContent></Card>
        </>
      )}
    </div>
  );
}
