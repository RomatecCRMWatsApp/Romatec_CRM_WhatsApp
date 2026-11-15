import { Mail, MessageCircle, Phone, PlayCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { ContatoSuporte } from "@shared/suporte";

const VIDEOS = [
  { arquivo: "/suporte/crm-romatec-em-30s.mp4", capa: "/suporte/crm-romatec-em-30s.jpg", titulo: "O CRM Romatec em 30 segundos", texto: "Visão rápida para mostrar a um cliente ou corretor." },
  { arquivo: "/suporte/crm-romatec-apresentacao-completa.mp4", capa: "/suporte/crm-romatec-apresentacao-completa.jpg", titulo: "Apresentação completa", texto: "Todos os recursos: imobiliárias, incorporadoras, corretores e gestão." },
];

const botao = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--rt-gold)]/40 px-3 text-sm text-[var(--rt-gold-light)] transition-colors hover:bg-[var(--rt-gold)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rt-gold)]";

function CartaoContato({ c }: { c: ContatoSuporte }) {
  const ola = encodeURIComponent(`Olá, ${c.nome.split(" ")[0]}! Preciso de ajuda com o CRM.`);
  return (
    <li className="rounded-2xl border border-[var(--rt-green)] bg-[var(--rt-surface)] p-4">
      <p className="text-xs text-[var(--rt-gold)]">{c.papel}</p>
      <p className="mt-0.5 text-lg font-semibold text-[var(--rt-text)]">{c.nome}</p>
      <div className="mt-1 space-y-0.5 text-sm text-[var(--rt-text-2)]">
        {c.telefone && <p>{c.telefone}</p>}
        {c.email && <p className="break-all">{c.email}</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {c.whatsapp && (
          <a className={`${botao} border-transparent bg-[var(--rt-gold)] font-semibold text-[var(--rt-bg)] hover:bg-[var(--rt-gold-light)]`} href={`https://wa.me/${c.whatsapp}?text=${ola}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-4 w-4" aria-hidden />WhatsApp
          </a>
        )}
        {c.telefone && <a className={botao} href={`tel:${c.telefone.replace(/[^\d+]/g, "")}`}><Phone className="h-4 w-4" aria-hidden />Ligar</a>}
        {c.email && <a className={botao} href={`mailto:${c.email}`}><Mail className="h-4 w-4" aria-hidden />E-mail</a>}
      </div>
    </li>
  );
}

/** Topo da Central de suporte: quem atende (administrador e secretaria) e os vídeos demonstrativos. */
export function ContatosSuporte() {
  const { data: contatos, isLoading } = trpc.suporte.contatos.useQuery(undefined, { staleTime: 5 * 60_000 });

  return (
    <div className="space-y-6">
      <section aria-labelledby="suporte-contatos" className="space-y-3">
        <h2 id="suporte-contatos" className="text-lg font-semibold text-[var(--rt-gold-light)]">Fale com o escritório</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando contatos…</p>
        ) : contatos && contatos.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">{contatos.map(c => <CartaoContato key={`${c.papel}-${c.nome}`} c={c} />)}</ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum contato cadastrado. O administrador preenche telefone e e-mail em Equipe.</p>
        )}
      </section>

      <section aria-labelledby="suporte-videos" className="space-y-3">
        <h2 id="suporte-videos" className="flex items-center gap-2 text-lg font-semibold text-[var(--rt-gold-light)]"><PlayCircle className="h-5 w-5" aria-hidden />Vídeos demonstrativos</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {VIDEOS.map(v => (
            <li key={v.arquivo} className="overflow-hidden rounded-2xl border border-[var(--rt-green)] bg-[var(--rt-surface)]">
              <video className="aspect-[9/16] max-h-[520px] w-full bg-[var(--rt-bg)] object-contain" src={v.arquivo} poster={v.capa} controls playsInline preload="none" />
              <div className="p-3">
                <p className="font-semibold text-[var(--rt-text)]">{v.titulo}</p>
                <p className="mt-0.5 text-xs text-[var(--rt-text-2)]">{v.texto}</p>
                <a className="mt-2 inline-block text-sm text-[var(--rt-gold-light)] underline-offset-2 hover:underline" href={v.arquivo} download>Baixar para enviar</a>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
