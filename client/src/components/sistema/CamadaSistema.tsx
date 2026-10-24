import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { APP_VERSION } from "@/brand";
import { useIdle } from "@/hooks/useIdle";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { DESCANSO_PADRAO } from "@shared/releases";
import ScreenSaver from "./ScreenSaver";
import { abrirNovidades, PainelNovidades, UpdateBanner, WhatsNewModal } from "./Novidades";
import { useAlertasNotificacoes } from "./Notificacoes";

/** Telas públicas (landing, catálogo, links, login): sem banner, novidades nem tela de descanso */
const PUBLICAS = ["/login", "/primeiro-acesso", "/imoveis", "/i/", "/imovel/", "/links", "/bom-jardims", "/404"];
const ehPublica = (loc: string) => loc === "/" || PUBLICAS.some(p => loc === p || loc.startsWith(p.endsWith("/") ? p : `${p}/`));

/**
 * Camada do sistema sobre as telas internas (v1.7.0): faixa "Nova versão disponível", "Novidades da versão"
 * ao entrar, painel do sino e tela de descanso.
 */
export default function CamadaSistema() {
  const [loc] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const interna = isAuthenticated && !!user && !ehPublica(loc);
  const { nova, atualizar } = useVersionCheck(isAuthenticated);
  const minutos = Number((user as any)?.descansoMinutos ?? DESCANSO_PADRAO);
  const { ocioso, acordar } = useIdle(interna ? minutos : 0);
  const [desde, setDesde] = useState<number | null>(null);
  if (ocioso && desde === null) setDesde(Date.now());
  const acordarELimpar = useCallback(() => { setDesde(null); acordar(); }, [acordar]);
  // Lead novo durante o descanso: confere a cada 30 s só enquanto a tela está aberta
  const { data: novos } = trpc.novidades.novosLeads.useQuery({ desde: desde ?? 1 }, { enabled: ocioso && desde !== null, refetchInterval: 30_000 });
  // Sininho: confere a cada 20 s, toca o som do tipo e trata o toque na notificação do celular
  const abrirAvisos = useCallback(() => abrirNovidades("avisos"), []);
  useAlertasNotificacoes(interna, abrirAvisos);

  return (
    <>
      {isAuthenticated && <UpdateBanner nova={nova} onAtualizar={atualizar} />}
      {/* Com versão nova pendente, o "Novidades" espera o recarregamento (mostra o texto já da versão nova) */}
      <WhatsNewModal habilitado={interna && !nova && !ocioso} />
      <PainelNovidades habilitado={interna} />
      <ScreenSaver ativo={interna && ocioso} onAcordar={acordarELimpar} novosLeads={novos?.total ?? 0} versao={APP_VERSION} />
    </>
  );
}
