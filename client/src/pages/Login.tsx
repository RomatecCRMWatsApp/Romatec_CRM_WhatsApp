import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663438352331/2uYgCCZRKgbanKmmzr4z87/LOGO_R_PEQUENO_01-removebg-preview_1a0ec276.png";

export default function Login() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-slate-50 to-secondary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card com Logo e Formulário */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
          {/* Logo */}
          <div className="mb-8 flex justify-center">
            <img
              src={LOGO_URL}
              alt="Romatec Logo"
              className="h-24 w-auto object-contain"
            />
          </div>

          {/* Título */}
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Romatec CRM
          </h1>
          <p className="text-slate-600 mb-8">
            Gestão Imobiliária Inteligente com WhatsApp
          </p>

          {/* Descrição */}
          <div className="bg-primary/5 rounded-lg p-4 mb-8 text-left">
            <p className="text-sm text-slate-700">
              ✨ <strong>Gerencie seus imóveis</strong> e campanhas de marketing com automação WhatsApp
            </p>
            <p className="text-sm text-slate-700 mt-2">
              🚀 <strong>Aumente suas vendas</strong> com mensagens automáticas inteligentes
            </p>
            <p className="text-sm text-slate-700 mt-2">
              💚 <strong>Tecnologia moderna</strong> para seu negócio imobiliário
            </p>
          </div>

          {/* Botão de Login */}
          <Button
            onClick={() => window.location.href = getLoginUrl()}
            className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white font-semibold py-3 rounded-lg transition-all transform hover:scale-105 active:scale-95 shadow-lg"
          >
            🔐 Fazer Login com Manus
          </Button>

          {/* Footer */}
          <p className="text-xs text-slate-500 mt-6">
            © 2026 Romatec Consultoria Imobiliária. Todos os direitos reservados.
          </p>
        </div>

        {/* Informações Adicionais */}
        <div className="mt-8 text-center text-slate-600">
          <p className="text-sm">
            📍 Rua São Raimundo, 10 - Centro, Açailândia - MA
          </p>
          <p className="text-sm mt-2">
            📱 (99) 999169-0178
          </p>
        </div>
      </div>
    </div>
  );
}
