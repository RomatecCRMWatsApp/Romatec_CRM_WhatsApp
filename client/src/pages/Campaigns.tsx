import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Send } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function Campaigns() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: campaigns } = trpc.campaigns.list.useQuery();

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground p-6">
        <div className="container flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Send className="h-8 w-8" />
              Campanhas
            </h1>
          </div>
          <Button onClick={() => navigate("/dashboard")} variant="outline">Voltar</Button>
        </div>
      </div>

      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>Campanhas Cadastradas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">Total de campanhas: {campaigns?.length || 0}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
