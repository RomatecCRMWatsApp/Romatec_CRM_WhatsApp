import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function Contacts() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: contacts } = trpc.contacts.list.useQuery();

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground p-6">
        <div className="container flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Users className="h-8 w-8" />
              Gerenciar Clientes
            </h1>
          </div>
          <Button onClick={() => navigate("/dashboard")} variant="outline">Voltar</Button>
        </div>
      </div>

      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>Clientes Cadastrados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Total de clientes: {contacts?.length || 0}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
