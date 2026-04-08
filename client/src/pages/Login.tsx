import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

const LOGO_URL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663438352331/2uYgCCZRKgbanKmmzr4z87/Capturadetela2026-04-02172521_ffb58bed.png";

export default function Login() {
  const { isAuthenticated, login } = useAuth();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const ok = await login(username, password);
    if (!ok) {
      setError("Usuário ou senha incorretos.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-slate-50 to-secondary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="mb-8 flex justify-center">
            <img src={LOGO_URL} alt="Romatec Logo" className="h-24 w-auto object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Romatec CRM</h1>
          <p className="text-slate-600 mb-8">Gestão Imobiliária Inteligente com WhatsApp</p>

          <form onSubmit={handleLogin} className="text-left space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Usuário</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="admin"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-primary to-primary/80 text-white font-semibold py-3 rounded-lg"
            >
              {loading ? "Entrando..." : "🔐 Entrar"}
            </Button>
          </form>

          <p className="text-xs text-slate-500 mt-6">© 2026 Romatec Consultoria Imobiliária</p>
        </div>
        <div className="mt-8 text-center text-slate-600">
          <p className="text-sm">📍 Rua São Raimundo, 10 - Centro, Açailândia - MA</p>
          <p className="text-sm mt-2">📱 (99) 999169-0178</p>
        </div>
      </div>
    </div>
  );
}
