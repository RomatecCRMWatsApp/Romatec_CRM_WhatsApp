import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Contacts from "./pages/Contacts";
import Properties from "./pages/Properties";
import Campaigns from "./pages/Campaigns";
import Settings from "./pages/Settings";
import PropertyPublic from "./pages/PropertyPublic";
import Performance from "./pages/Performance";
import Leads from "./pages/Leads";
import Setup from "./pages/Setup";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect } from "react";

// Redireciona para /setup se companyConfig não tiver nome de empresa
function SetupGuard({ component: Component }: { component: React.ComponentType }) {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { data: config, isLoading } = trpc.companyConfig.get.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!isLoading && isAuthenticated && !config?.companyName) {
      navigate("/setup");
    }
  }, [isLoading, isAuthenticated, config, navigate]);

  return <Component />;
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
      <Route path={"/leads"}>
        {() => <SetupGuard component={Leads} />}
      </Route>
      <Route path={"/imovel/:slug"} component={PropertyPublic} />
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
