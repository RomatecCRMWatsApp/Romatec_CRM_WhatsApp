import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Search, Trash2, Edit } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function Contacts() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: contacts } = trpc.contacts.list.useQuery();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    return contacts.filter(c => 
      c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.phone?.includes(searchTerm)
    );
  }, [contacts, searchTerm]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground p-6">
        <div className="container flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Users className="h-8 w-8" />
              👥 Gerenciar Clientes
            </h1>
            <p className="text-primary-foreground/80 mt-1">Total: {contacts?.length || 0} contatos</p>
          </div>
          <Button onClick={() => navigate("/dashboard")} variant="outline">← Voltar</Button>
        </div>
      </div>

      {/* Content */}
      <div className="container py-8">
        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-slate-400" />
            <input
              type="text"
              placeholder="🔍 Buscar por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-lg border-2 border-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>

        {/* Contacts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContacts.length > 0 ? (
            filteredContacts.map((contact) => (
              <Card key={contact.id} className="hover:shadow-lg transition-all hover:scale-105 transform duration-200">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <p className="font-semibold text-lg text-slate-900">{contact.name || "Sem nome"}</p>
                      <p className="text-sm text-slate-600 mt-2">📱 {contact.phone || "Sem telefone"}</p>
                      {contact.email && (
                        <p className="text-xs text-slate-500 mt-1">✉️ {contact.email}</p>
                      )}
                    </div>
                    <span className="text-3xl">☕</span>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-2 pt-4 border-t">
                    <button className="flex-1 px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 font-semibold text-sm transition-colors flex items-center justify-center gap-2">
                      <Edit size={16} /> Editar
                    </button>
                    <button className="flex-1 px-3 py-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-semibold text-sm transition-colors flex items-center justify-center gap-2">
                      <Trash2 size={16} /> Deletar
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <p className="text-slate-600 text-lg">🔍 Nenhum contato encontrado</p>
              <p className="text-slate-500 text-sm mt-2">Tente uma busca diferente</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
