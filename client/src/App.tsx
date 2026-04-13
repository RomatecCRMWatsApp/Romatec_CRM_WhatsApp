import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
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

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
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
      <Route path={"/leads"}>
        {() => <ProtectedRoute component={Leads} />}
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
