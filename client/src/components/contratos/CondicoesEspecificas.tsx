import { useEffect, useRef, useState } from "react";
import { Campo, classeCampo } from "@/components/cadastro/campos";
import { CONDICOES_ESPECIFICAS, montarCondicoes, separarCondicoes, textoCondicaoEspecifica, type IdCondicaoEspecifica } from "@shared/condicoesEspecificas";

interface Props {
  /** Campo completo (condições marcadas + texto livre), como vai para o contrato */
  valor: string;
  onMudar: (v: string) => void;
  planoC: boolean;
  admin: boolean;
  inicioComplemento?: number | null;
  /** Marcar o congelamento também liga o complemento congelado no plano */
  onCongelamento?: (ligado: boolean) => void;
}

/** Condições específicas: as padrão (clicar para incluir) e o campo livre para outras */
export function CondicoesEspecificas({ valor, onMudar, planoC, admin, inicioComplemento, onCongelamento }: Props) {
  // Estado local (o campo livre guarda espaços e quebras de linha enquanto digita); começa do valor recebido
  const inicial = useRef(separarCondicoes(valor));
  const [marcadas, setMarcadas] = useState<IdCondicaoEspecifica[]>(inicial.current.marcadas);
  const [livre, setLivre] = useState(inicial.current.livre);
  const o = { inicioComplemento };
  // O que este componente emitiu por último: se o valor mudar por fora (ex.: o contrato carregou), recomeça dele
  const emitido = useRef(valor);
  const emitir = (v: string) => { emitido.current = v; onMudar(v); };
  useEffect(() => {
    if (valor === emitido.current) return;
    const x = separarCondicoes(valor);
    emitido.current = valor; setMarcadas(x.marcadas); setLivre(x.livre);
  }, [valor]);
  // Mês do congelamento mudou: o texto da condição acompanha
  useEffect(() => { if (marcadas.includes("congelamento")) emitir(montarCondicoes(marcadas, livre, o)); }, [inicioComplemento]); // eslint-disable-line react-hooks/exhaustive-deps
  const disponiveis = CONDICOES_ESPECIFICAS.filter(c => (!c.soPlanoC || planoC) && (!c.soAdmin || admin));
  const alternar = (id: IdCondicaoEspecifica) => {
    const nova = marcadas.includes(id) ? marcadas.filter(x => x !== id) : [...marcadas, id];
    setMarcadas(nova);
    emitir(montarCondicoes(nova, livre, o));
    if (id === "congelamento") onCongelamento?.(nova.includes(id));
  };
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Condições específicas deste contrato — marque as padrão e, se precisar, escreva outra</p>
      <div className="space-y-1.5">
        {disponiveis.map(c => (
          <label key={c.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm transition ${marcadas.includes(c.id) ? "border-primary/60 bg-primary/10" : "border-border hover:border-primary/40"}`}>
            <input type="checkbox" className="mt-0.5" checked={marcadas.includes(c.id)} onChange={() => alternar(c.id)} />
            <span><b className="font-semibold">{c.rotulo}</b><span className="mt-0.5 block text-xs text-muted-foreground">{textoCondicaoEspecifica(c.id, o)}</span></span>
          </label>
        ))}
      </div>
      <Campo rotulo="Outra condição específica (opcional)">
        <textarea className={`${classeCampo()} h-20 py-2`} maxLength={1200} value={livre} onChange={e => { setLivre(e.target.value); emitir(montarCondicoes(marcadas, e.target.value, o)); }} placeholder="Ex.: entrega das chaves condicionada…" />
      </Campo>
    </div>
  );
}
