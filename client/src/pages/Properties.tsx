import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, Search, Trash2, Edit, MapPin, DollarSign } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function Properties() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: properties } = trpc.properties.list.useQuery();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredProperties = useMemo(() => {
    if (!properties) return [];
    return properties.filter(p => 
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.address?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [properties, searchTerm]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground p-6">
        <div className="container flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Home className="h-8 w-8" />
              Gerenciar Imóveis
            </h1>
            <p className="text-primary-foreground/80 mt-1">Total: {properties?.length || 0} propriedades</p>
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
              placeholder="🔍 Buscar por nome ou endereço..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-lg border-2 border-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>

        {/* Properties Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProperties.length > 0 ? (
            filteredProperties.map((property) => (
              <Card key={property.id} className="hover:shadow-lg transition-all hover:scale-105 transform duration-200 overflow-hidden">
                {/* Property Image Placeholder */}
                <div className="h-40 bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                  <span className="text-5xl">🏘️</span>
                </div>

                <CardContent className="pt-6">
                  <div className="mb-4">
                    <p className="font-semibold text-lg text-slate-900">{property.denomination || "Sem nome"}</p>
                    <div className="flex items-center gap-2 mt-2 text-slate-600">
                      <MapPin size={16} />
                      <p className="text-sm">{property.address || "Sem endereço"}</p>
                    </div>
                    {property.price && (
                      <div className="flex items-center gap-2 mt-2 text-green-600 font-semibold">
                        <DollarSign size={16} />
                        <p className="text-sm">R$ {typeof property.price === 'string' ? property.price : Number(property.price).toLocaleString("pt-BR")}</p>
                      </div>
                    )}
                  </div>

                  {property.description && (
                    <p className="text-xs text-slate-500 mb-4 line-clamp-2">{property.description}</p>
                  )}
                  
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
              <p className="text-slate-600 text-lg">🔍 Nenhum imóvel encontrado</p>
              <p className="text-slate-500 text-sm mt-2">Tente uma busca diferente</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
