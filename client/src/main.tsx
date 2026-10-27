import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchStreamLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./brand"; // identidade visual: tokens.css (cores, fontes, animações) uma única vez
import "./index.css";
import { capturarOrigem } from "./lib/origemVisita";
import { instalarVerComo, sairVerComo, verComoAtual } from "./lib/verComo";

// De onde veio o visitante (UTM, referrer, página de entrada) — vai junto nos formulários
capturarOrigem();
// "Ver como" do administrador (lib/verComo.ts): o cabeçalho vai em toda chamada ao servidor desta aba
instalarVerComo();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Trocar de tela/aba não refaz tudo: dado de até 20 s é reaproveitado; telas com polling continuam com o refetchInterval delas
      staleTime: 20_000,
      refetchOnWindowFocus: false,
      // Erro do servidor (permissão, validação, sem login) não é repetido 3× com espera — só falha de rede, 1 vez
      retry: (n, e) => n < 1 && !(e instanceof TRPCClientError && typeof (e.data as any)?.httpStatus === "number" && (e.data as any).httpStatus < 500),
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  // Camada SaaS: sem licença (402) → área do assinante
  if ((error.data as any)?.code === "PAYMENT_REQUIRED" || error.message === "ASSINATURA_NECESSARIA") {
    if (window.location.pathname !== "/assinatura") window.location.href = "/assinatura";
    return;
  }

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  // No "ver como", a pessoa perdeu o acesso (desativada) ou a sessão do administrador caiu: sai do modo
  if (verComoAtual()) { sairVerComo("/login"); return; }
  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const comCookie = (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });
const trpcClient = trpc.createClient({
  links: [
    // Consultas em lote com resposta em fluxo (cada uma chega quando fica pronta — a lenta não segura as outras);
    // ações (login, sair, salvar) uma a uma, sem fluxo, porque algumas mexem no cookie da sessão
    splitLink({
      condition: op => op.type === "query",
      true: httpBatchStreamLink({ url: "/api/trpc", transformer: superjson, fetch: comCookie as any }),
      false: httpLink({ url: "/api/trpc", transformer: superjson, fetch: comCookie as any }),
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

// Register PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service worker registration failed silently
    });
  });
}
