import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Contacts from "./pages/Contacts";
import Properties from "./pages/Properties";
import Campaigns from "./pages/Campaigns";
import Settings from "./pages/Settings";
import PropertyPublic from "./pages/PropertyPublic";
import Performance from "./pages/Performance";

// Componente para proteger rotas autenticadas
function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return <Component />;
}

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-slate-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path={"/login"} component={Login} />
      <Route path={"/"} component={Home} />
      <Route path={"/dashboard"}>
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path={"/contacts"}>
        {() => <ProtectedRoute component={Contacts} />}
      </Route>
      <Route path={"/properties"}>
        {() => <ProtectedRoute component={Properties} />}
      </Route>
      <Route path={"/campaigns"}>
        {() => <ProtectedRoute component={Campaigns} />}
      </Route>
      <Route path={"/settings"}>
        {() => <ProtectedRoute component={Settings} />}
      </Route>
      <Route path={"/performance"}>
        {() => <ProtectedRoute component={Performance} />}
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
