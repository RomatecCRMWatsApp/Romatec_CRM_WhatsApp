import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="animate-spin h-8 w-8 text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-bold">Romatec CRM</h1>
          <p className="text-xl text-primary-foreground/80">Sistema de Gestão Imobiliária com WhatsApp</p>
          <a href={getLoginUrl()}>
            <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground">
              Fazer Login
            </Button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="animate-spin h-8 w-8 text-primary" />
    </div>
  );
}
