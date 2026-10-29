import { useState } from "react";
import { Download, Share, X } from "lucide-react";
import { useInstalarApp } from "@/lib/instalarApp";

/** "Instalar o app" no menu: janela nativa (Android/computador) ou o passo a passo do iPhone */
export default function BotaoInstalarApp({ recolhido = false }: { recolhido?: boolean }) {
  const app = useInstalarApp();
  const [dicaIos, setDicaIos] = useState(false);
  if (app.instalado || (!app.podeInstalar && !app.ios)) return null;
  return (
    <>
      <button type="button" onClick={() => (app.podeInstalar ? app.instalar() : setDicaIos(true))} title="Instalar o app no celular ou no computador"
        className={`mx-2 mb-1 flex items-center gap-2 rounded-lg bg-emerald-600/20 px-2 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 ${recolhido ? "justify-center" : ""}`}>
        <Download className="h-4 w-4" />{!recolhido && "Instalar o app"}
      </button>
      {dicaIos && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => setDicaIos(false)}>
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-card p-5 text-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between"><p className="font-semibold">Instalar no iPhone / iPad</p><button onClick={() => setDicaIos(false)} aria-label="Fechar"><X className="h-4 w-4" /></button></div>
            <ol className="ml-4 list-decimal space-y-1.5 text-muted-foreground">
              <li>Abra o CRM no <b>Safari</b>.</li>
              <li>Toque em <Share className="inline h-4 w-4" /> <b>Compartilhar</b> (barra de baixo).</li>
              <li>Escolha <b>Adicionar à Tela de Início</b> e toque em <b>Adicionar</b>.</li>
              <li>Abra pelo ícone "Romatec CRM" e aceite as notificações.</li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
