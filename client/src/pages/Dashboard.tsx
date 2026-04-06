import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Home, Send, Settings } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function Dashboard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: contacts } = trpc.contacts.list.useQuery();
  const { data: properties } = trpc.properties.list.useQuery();
  const { data: campaigns } = trpc.campaigns.list.useQuery();
  const { data: config } = trpc.companyConfig.get.useQuery();

  const activeCampaigns = campaigns?.filter(c => c.status === "running").length || 0;
  const totalContacts = contacts?.length || 0;
  const totalProperties = properties?.length || 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground p-6">
        <div className="container">
          <h1 className="text-3xl font-bold">Romatec CRM</h1>
          <p className="text-primary-foreground/80">Bem-vindo, {user?.name || "Usuário"}!</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="container py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="card-hover">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Clientes</CardTitle>
              <Users className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalContacts}</div>
              <p className="text-xs text-muted-foreground">Contatos cadastrados</p>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Imóveis</CardTitle>
              <Home className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalProperties}</div>
              <p className="text-xs text-muted-foreground">Propriedades ativas</p>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Campanhas</CardTitle>
              <Send className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeCampaigns}</div>
              <p className="text-xs text-muted-foreground">Campanhas ativas</p>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status Z-API</CardTitle>
              <Settings className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${config?.zApiConnected ? "text-green-600" : "text-red-600"}`}>
                {config?.zApiConnected ? "Conectado" : "Desconectado"}
              </div>
              <p className="text-xs text-muted-foreground">WhatsApp API</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
            <CardDescription>Acesse as principais funcionalidades do CRM</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button
                onClick={() => navigate("/contacts")}
                className="w-full bg-primary hover:bg-primary/90"
              >
                <Users className="mr-2 h-4 w-4" />
                Gerenciar Clientes
              </Button>
              <Button
                onClick={() => navigate("/properties")}
                className="w-full bg-primary hover:bg-primary/90"
              >
                <Home className="mr-2 h-4 w-4" />
                Gerenciar Imóveis
              </Button>
              <Button
                onClick={() => navigate("/campaigns")}
                className="w-full bg-primary hover:bg-primary/90"
              >
                <Send className="mr-2 h-4 w-4" />
                Campanhas
              </Button>
              <Button
                onClick={() => navigate("/settings")}
                className="w-full bg-primary hover:bg-primary/90"
              >
                <Settings className="mr-2 h-4 w-4" />
                Configurações
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Informações da Empresa</CardTitle>
            <CardDescription>Dados cadastrados no sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Nome da Empresa</p>
                <p className="font-semibold">{config?.companyName || "Romatec Consultoria Imobiliária"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Telefone</p>
                <p className="font-semibold">{config?.phone || "(99) 999169-0178"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Endereço</p>
                <p className="font-semibold">{config?.address || "Não configurado"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
