import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import BarraVersao from "./components/BarraVersao";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Contacts from "./pages/Contacts";
import Properties from "./pages/Properties";
import Campaigns from "./pages/Campaigns";
import Settings from "./pages/Settings";
import PropertyPublic from "./pages/PropertyPublic";
import PropertiesCatalog from "./pages/PropertiesCatalog";
import LinkPortal from "./pages/LinkPortal";
import BomJardims from "./pages/BomJardims";
import Performance from "./pages/Performance";
import Leads from "./pages/Leads";
import LeadCampanhas from "./pages/LeadCampanhas";
import LeadsRelatorio from "./pages/LeadsRelatorio";
import Materiais from "./pages/Materiais";
import ListaInteresse from "./pages/ListaInteresse";
import AgendaVisitas from "./pages/AgendaVisitas";
import Equipe from "./pages/Equipe";
import Empreendedor from "./pages/Empreendedor";
import PrimeiroAcesso from "./pages/PrimeiroAcesso";
import { perfilDe, podeAbrir, telaInicial } from "@shared/equipe";
import AppShell from "./components/AppShell";
import ImovelLanding from "./pages/ImovelLanding";
import LeadsFunil from "./pages/LeadsFunil";
import LeadDetalhe from "./pages/LeadDetalhe";
import Setup from "./pages/Setup";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect } from "react";

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
    if (isAuthenticated && !podeAbrir(perfil, location)) {
      navigate(telaInicial(perfil));
      return;
    }
    if (!isLoading && isAuthenticated && perfil === "admin" && !config?.companyName) {
      navigate("/setup");
    }
  }, [isLoading, isAuthenticated, config, navigate, perfil, location]);

  if (!permitido) return null;
  // Telas internas dentro do menu lateral; o empreendedor tem o painel próprio, sem menu do CRM
  return perfil === "empreendedor" || location.startsWith("/empreendedor") ? <Component /> : <AppShell><Component /></AppShell>;
}

function Router() {
  return (
    <Switch>
      <Route path={"/login"} component={Login} />
      <Route path={"/"} component={Home} />
      <Route path={"/setup"} component={Setup} />
      <Route path={"/dashboard"}>
        {() => <SetupGuard component={Dashboard} />}
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
      <Route path={"/primeiro-acesso"} component={PrimeiroAcesso} />
      <Route path={"/leads/agenda"}>
        {() => <SetupGuard component={AgendaVisitas} />}
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
      <Route path={"/bom-jardims"} component={BomJardims} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <BarraVersao />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
