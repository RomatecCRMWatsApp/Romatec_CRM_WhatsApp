import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import BarraVersao from "./components/BarraVersao";
import AvisoCookies from "./components/AvisoCookies";
import FaixaVerComo from "./components/sistema/FaixaVerComo";
import { ThemeProvider } from "./contexts/ThemeContext";
// Protetor de tela, novidades da versão e alertas: só no CRM (o site público não baixa)
const CamadaSistema = lazy(() => import("./components/sistema/CamadaSistema"));
// Cada tela num arquivo separado: o site público (landing do Bom Jardims, agendamento) não baixa o CRM inteiro
const Login = lazy(() => import("./pages/Login"));
const Home = lazy(() => import("./pages/Home"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Contacts = lazy(() => import("./pages/Contacts"));
const Properties = lazy(() => import("./pages/Properties"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const Settings = lazy(() => import("./pages/Settings"));
const PropertyPublic = lazy(() => import("./pages/PropertyPublic"));
const PropertiesCatalog = lazy(() => import("./pages/PropertiesCatalog"));
const LinkPortal = lazy(() => import("./pages/LinkPortal"));
const BomJardims = lazy(() => import("./pages/BomJardims"));
const BomJardimsChacara = lazy(() => import("./pages/BomJardimsChacara"));
const Performance = lazy(() => import("./pages/Performance"));
const Leads = lazy(() => import("./pages/Leads"));
const LeadCampanhas = lazy(() => import("./pages/LeadCampanhas"));
const LeadsRelatorio = lazy(() => import("./pages/LeadsRelatorio"));
const Materiais = lazy(() => import("./pages/Materiais"));
const ListaInteresse = lazy(() => import("./pages/ListaInteresse"));
const AgendaVisitas = lazy(() => import("./pages/AgendaVisitas"));
const Reunioes = lazy(() => import("./pages/Reunioes"));
const Convites = lazy(() => import("./pages/Convites"));
const ReuniaoPublica = lazy(() => import("./pages/ReuniaoPublica"));
const Recrutamento = lazy(() => import("./pages/Recrutamento"));
const FormularioRecrutamento = lazy(() => import("./pages/FormularioRecrutamento"));
const TrocarSenha = lazy(() => import("./pages/TrocarSenha"));
const Assinatura = lazy(() => import("./pages/Assinatura"));
const Saas = lazy(() => import("./pages/Saas"));
const Talonarios = lazy(() => import("./pages/Talonarios"));
const Empreendimentos = lazy(() => import("./pages/Empreendimentos"));
const Empreendimento = lazy(() => import("./pages/Empreendimento"));
const EmpreendimentoDocumentos = lazy(() => import("./pages/EmpreendimentoDocumentos"));
const EmpreendimentoFolder = lazy(() => import("./pages/EmpreendimentoFolder"));
const EmpreendimentoProposta = lazy(() => import("./pages/EmpreendimentoProposta"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const Contratos = lazy(() => import("./pages/Contratos"));
const Carteirinhas = lazy(() => import("./pages/Carteirinhas"));
const FilaReservas = lazy(() => import("./pages/FilaReservas"));
const RespostasAutomaticas = lazy(() => import("./pages/RespostasAutomaticas"));
const ContratoNovo = lazy(() => import("./pages/ContratoNovo"));
const ContratoDetalhe = lazy(() => import("./pages/ContratoDetalhe"));
const PosicionarAssinaturas = lazy(() => import("./pages/PosicionarAssinaturas"));
const AssinarContrato = lazy(() => import("./pages/AssinarContrato"));
const VerificarContrato = lazy(() => import("./pages/VerificarContrato"));
const CarneDigital = lazy(() => import("./pages/CarneDigital"));
const Agendar = lazy(() => import("./pages/Agendar"));
const Oferta = lazy(() => import("./pages/Oferta"));
const AreaCorretor = lazy(() => import("./pages/AreaCorretor"));
const PainelCorretor = lazy(() => import("./pages/PainelCorretor"));
const VerComo = lazy(() => import("./pages/VerComo"));
/** Painel: o corretor vê o mapa do empreendimento e os atalhos; o escritório, os números */
function Inicio() {
  const { user } = useAuth();
  return perfilDe(user as any) === "corretor" ? <PainelCorretor /> : <Dashboard />;
}
const Equipe = lazy(() => import("./pages/Equipe"));
const MeuCadastro = lazy(() => import("./pages/MeuCadastro"));
const Empreendedor = lazy(() => import("./pages/Empreendedor"));
const PrimeiroAcesso = lazy(() => import("./pages/PrimeiroAcesso"));
import { perfilDe, podeAbrir, telaInicial } from "@shared/equipe";
const AppShell = lazy(() => import("./components/AppShell"));
const ImovelLanding = lazy(() => import("./pages/ImovelLanding"));
const LeadsFunil = lazy(() => import("./pages/LeadsFunil"));
const LeadDetalhe = lazy(() => import("./pages/LeadDetalhe"));
const Setup = lazy(() => import("./pages/Setup"));
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Suspense, lazy, useEffect } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { APP_VERSION, LocationChangeLoading, PageLoader, QueryLoading, SplashScreen } from "@/brand";

// Redireciona para /setup se companyConfig não tiver nome de empresa
function SetupGuard({ component: Component }: { component: React.ComponentType }) {
  const [location, navigate] = useLocation();
  const { isAuthenticated, user } = useAuth();
  const perfil = perfilDe(user as any);
  // Empreendedor não lê a configuração da empresa (nem precisa do /setup)
  const { data: config, isLoading } = trpc.companyConfig.get.useQuery(undefined, {
    enabled: isAuthenticated && perfil !== "empreendedor",
  });
  const permitido = !isAuthenticated || podeAbrir(perfil, location);

  useEffect(() => {
    // Cada perfil só abre as telas dele (shared/equipe.ts)
    // Senha provisória (recrutamento): antes de qualquer tela, criar a própria senha
    if (isAuthenticated && (user as any)?.trocarSenha) {
      navigate("/trocar-senha");
      return;
    }
    // Camada SaaS: sem licença, só a área do assinante
    const lic = (user as any)?.licenca;
    if (isAuthenticated && lic?.exigida && !lic.liberado && location !== "/assinatura") {
      navigate("/assinatura");
      return;
    }
    if (isAuthenticated && !podeAbrir(perfil, location)) {
      navigate(telaInicial(perfil));
      return;
    }
    if (!isLoading && isAuthenticated && perfil === "admin" && !config?.companyName) {
      navigate("/setup");
    }
  }, [isLoading, isAuthenticated, config, navigate, perfil, location, user]);

  if (!permitido) return null;
  // Telas internas dentro do menu lateral; o empreendedor tem o painel próprio, sem menu do CRM
  return perfil === "empreendedor" || location.startsWith("/empreendedor") || location === "/assinatura" ? <Suspense fallback={null}><Component /></Suspense> : <AppShell><Suspense fallback={null}><Component /></Suspense></AppShell>;
}

function Router() {
  return (
    <Switch>
      <Route path={"/login"} component={Login} />
      <Route path={"/"} component={Home} />
      <Route path={"/setup"} component={Setup} />
      <Route path={"/dashboard"}>
        {() => <SetupGuard component={Inicio} />}
      </Route>
      <Route path={"/contacts"}>
        {() => <SetupGuard component={Contacts} />}
      </Route>
      <Route path={"/properties"}>
        {() => <SetupGuard component={Properties} />}
      </Route>
      <Route path={"/campaigns"}>
        {() => <SetupGuard component={Campaigns} />}
      </Route>
      <Route path={"/settings"}>
        {() => <SetupGuard component={Settings} />}
      </Route>
      <Route path={"/performance"}>
        {() => <SetupGuard component={Performance} />}
      </Route>
      <Route path={"/leads/funil"}>
        {() => <SetupGuard component={LeadsFunil} />}
      </Route>
      <Route path={"/leads/lead/:id"}>
        {() => <SetupGuard component={LeadDetalhe} />}
      </Route>
      <Route path={"/equipe"}>
        {() => <SetupGuard component={Equipe} />}
      </Route>
      <Route path={"/empreendedor"}>
        {() => <SetupGuard component={Empreendedor} />}
      </Route>
      <Route path={"/ver-como"}>
        {() => <SetupGuard component={VerComo} />}
      </Route>
      <Route path={"/visao-corretor"}>
        {() => <SetupGuard component={VerComo} />}
      </Route>
      <Route path={"/meu-cadastro"}>
        {() => <SetupGuard component={MeuCadastro} />}
      </Route>
      <Route path={"/primeiro-acesso"} component={PrimeiroAcesso} />
      <Route path={"/trocar-senha"} component={TrocarSenha} />
      <Route path={"/formulario/:token"} component={FormularioRecrutamento} />
      <Route path={"/recrutamento"}>
        {() => <SetupGuard component={Recrutamento} />}
      </Route>
      <Route path={"/assinatura"}>
        {() => <SetupGuard component={Assinatura} />}
      </Route>
      <Route path={"/saas"}>
        {() => <SetupGuard component={Saas} />}
      </Route>
      <Route path={"/talonarios"}>
        {() => <SetupGuard component={Talonarios} />}
      </Route>
      <Route path={"/empreendimentos/:slug/folder"}>
        {() => <SetupGuard component={EmpreendimentoFolder} />}
      </Route>
      <Route path={"/contratos/novo"}>
        {() => <SetupGuard component={ContratoNovo} />}
      </Route>
      <Route path={"/contratos/:id/assinaturas"}>
        {() => <SetupGuard component={PosicionarAssinaturas} />}
      </Route>
      <Route path={"/contratos/:id"}>
        {() => <SetupGuard component={ContratoDetalhe} />}
      </Route>
      <Route path={"/contratos"}>
        {() => <SetupGuard component={Contratos} />}
      </Route>
      <Route path={"/carteirinhas"}>
        {() => <SetupGuard component={Carteirinhas} />}
      </Route>
      <Route path={"/respostas-automaticas"}>
        {() => <SetupGuard component={RespostasAutomaticas} />}
      </Route>
      <Route path={"/reservas"}>
        {() => <SetupGuard component={FilaReservas} />}
      </Route>
      <Route path={"/financeiro"}>
        {() => <SetupGuard component={Financeiro} />}
      </Route>
      <Route path={"/corretor"}>
        {() => <SetupGuard component={AreaCorretor} />}
      </Route>
      <Route path={"/empreendimentos/:slug/proposta"}>
        {() => <SetupGuard component={EmpreendimentoProposta} />}
      </Route>
      <Route path={"/empreendimentos/:slug/documentos"}>
        {() => <SetupGuard component={EmpreendimentoDocumentos} />}
      </Route>
      <Route path={"/empreendimentos/:slug"}>
        {() => <SetupGuard component={Empreendimento} />}
      </Route>
      <Route path={"/empreendimentos"}>
        {() => <SetupGuard component={Empreendimentos} />}
      </Route>
      <Route path={"/leads/agenda"}>
        {() => <SetupGuard component={AgendaVisitas} />}
      </Route>
      <Route path={"/reunioes"}>
        {() => <SetupGuard component={Reunioes} />}
      </Route>
      <Route path={"/reunioes/:id"}>
        {() => <SetupGuard component={Reunioes} />}
      </Route>
      <Route path={"/convites"}>
        {() => <SetupGuard component={Convites} />}
      </Route>
      <Route path={"/convites/:id"}>
        {() => <SetupGuard component={Convites} />}
      </Route>
      <Route path={"/leads/lista-interesse"}>
        {() => <SetupGuard component={ListaInteresse} />}
      </Route>
      <Route path={"/materiais"}>
        {() => <SetupGuard component={Materiais} />}
      </Route>
      <Route path={"/leads/relatorio"}>
        {() => <SetupGuard component={LeadsRelatorio} />}
      </Route>
      <Route path={"/leads/campanhas"}>
        {() => <SetupGuard component={LeadCampanhas} />}
      </Route>
      <Route path={"/leads"}>
        {() => <SetupGuard component={Leads} />}
      </Route>
      <Route path={"/imoveis"} component={PropertiesCatalog} />
      <Route path={"/i/:codigo"} component={ImovelLanding} />
      <Route path={"/imovel/:slug"} component={PropertyPublic} />
      <Route path={"/links"} component={LinkPortal} />
      <Route path={"/assinar/:token"} component={AssinarContrato} />
      <Route path={"/c/v/:codigo"} component={VerificarContrato} />
      <Route path={"/c/:codigo"} component={CarneDigital} />
      <Route path={"/agendar/:slug"} component={Agendar} />
      <Route path={"/reuniao/:token"} component={ReuniaoPublica} />
      <Route path={"/o/:slug"} component={Oferta} />
      <Route path={"/bom-jardims/chacara/:codigo"} component={BomJardimsChacara} />
      <Route path={"/bom-jardims"} component={BomJardims} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

/** Páginas do site público (landing, imóveis, links): sem splash nem overlay do app */
const rotaDoSite = (p: string) => ["/imoveis", "/i/", "/imovel/", "/links", "/bom-jardims", "/agendar/", "/o/", "/formulario/", "/reuniao/"].some(r => p === r || p.startsWith(r.endsWith("/") ? r : `${r}/`));

function CamadaDoSistema() {
  const [location] = useLocation();
  if (rotaDoSite(location)) return null;
  return <Suspense fallback={null}><CamadaSistema /></Suspense>;
}

/** Splash na abertura do app/PWA + barra do topo e overlay do carregamento (identidade visual v1.0) */
function CarregamentoDoApp() {
  const [location] = useLocation();
  const { loading } = useAuth();
  // Tela cheia só para ação demorada (salvar, gerar documento…); consulta acende apenas a barra do topo
  const acoes = useIsMutating({ predicate: m => !m.meta?.silencioso });
  if (rotaDoSite(location)) return null;
  return (
    <>
      <SplashScreen ready={!loading} version={APP_VERSION} message="Sincronizando leads e WhatsApp…" />
      <LocationChangeLoading />
      <QueryLoading />
      <PageLoader overlayActive={acoes > 0} overlayDelay={1200} />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <CarregamentoDoApp />
          <BarraVersao />
          <Suspense fallback={null}>
            <Router />
          </Suspense>
          <CamadaDoSistema />
          <AvisoCookies />
          {/* "Ver como" do administrador: faixa com quem está sendo visto e o botão Sair */}
          <FaixaVerComo />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
