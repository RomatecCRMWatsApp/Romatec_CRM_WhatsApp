import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Building2, Bed, Bath, Car, Maximize2, Search } from 'lucide-react';

function formatCurrency(value: number | string) {
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PropertiesCatalog() {
  const [tab, setTab] = useState<'venda' | 'aluguel'>('venda');
  const [search, setSearch] = useState('');
  const { data: properties = [], isLoading } = trpc.properties.list.useQuery();

  const filtered = properties.filter(p =>
    (p as any).finalidade === tab &&
    p.status === 'available' &&
    (search === '' ||
      p.denomination.toLowerCase().includes(search.toLowerCase()) ||
      p.address.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-700/20 border border-emerald-500/30">
            <Building2 className="h-6 w-6 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-tight">Romatec Imóveis</h1>
            <p className="text-xs text-muted-foreground">Encontre o imóvel ideal para você</p>
          </div>
        </div>
      </header>

      {/* Search + filter bar */}
      <div className="max-w-5xl mx-auto w-full px-4 py-5 flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou endereço..."
            className="w-full h-10 pl-9 pr-4 rounded-lg border border-border/50 bg-secondary/30 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </div>

        {/* Tab buttons */}
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => setTab('venda')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
              tab === 'venda'
                ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20'
                : 'border-border/50 text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-500'
            }`}
          >
            🏠 Venda
          </button>
          <button
            onClick={() => setTab('aluguel')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
              tab === 'aluguel'
                ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20'
                : 'border-border/50 text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-500'
            }`}
          >
            🔑 Aluguel
          </button>
        </div>
      </div>

      {/* Grid */}
      <main className="max-w-5xl mx-auto w-full px-4 pb-10 flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <Building2 className="h-14 w-14 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">Nenhum imóvel encontrado para este filtro.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((property: any) => {
              const images: string[] = property.images || [];
              const thumb = images[0] || null;
              return (
                <div
                  key={property.id}
                  className="bg-card border border-border/40 rounded-2xl overflow-hidden flex flex-col hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5 transition-all"
                >
                  {/* Photo */}
                  <div className="relative h-44 bg-secondary/30 overflow-hidden">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={property.denomination}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Building2 className="h-12 w-12 text-muted-foreground/20" />
                      </div>
                    )}
                    {/* Finalidade badge */}
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/90 text-white">
                      {tab === 'venda' ? 'Venda' : 'Aluguel'}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="p-4 flex flex-col flex-1">
                    <h2 className="font-bold text-foreground text-base leading-snug mb-1 line-clamp-1">
                      {property.denomination}
                    </h2>
                    <p className="text-xs text-muted-foreground mb-2 line-clamp-1">
                      {property.address}{property.city ? `, ${property.city}` : ''}
                    </p>

                    <p className="text-lg font-bold text-emerald-500 mb-3">
                      R$ {formatCurrency(property.price)}
                    </p>

                    {/* Badges */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {property.bedrooms > 0 && (
                        <span className="flex items-center gap-1 text-xs bg-secondary/50 text-muted-foreground px-2 py-1 rounded-lg border border-border/30">
                          <Bed className="h-3 w-3" /> {property.bedrooms}
                        </span>
                      )}
                      {property.bathrooms > 0 && (
                        <span className="flex items-center gap-1 text-xs bg-secondary/50 text-muted-foreground px-2 py-1 rounded-lg border border-border/30">
                          <Bath className="h-3 w-3" /> {property.bathrooms}
                        </span>
                      )}
                      {property.garageSpaces > 0 && (
                        <span className="flex items-center gap-1 text-xs bg-secondary/50 text-muted-foreground px-2 py-1 rounded-lg border border-border/30">
                          <Car className="h-3 w-3" /> {property.garageSpaces}
                        </span>
                      )}
                      {property.areaConstruida && (
                        <span className="flex items-center gap-1 text-xs bg-secondary/50 text-muted-foreground px-2 py-1 rounded-lg border border-border/30">
                          <Maximize2 className="h-3 w-3" /> {property.areaConstruida}m²
                        </span>
                      )}
                    </div>

                    {/* CTA */}
                    <div className="mt-auto">
                      {property.publicSlug ? (
                        <a
                          href={`/imovel/${property.publicSlug}`}
                          className="block w-full py-2.5 rounded-xl text-sm font-semibold text-center bg-emerald-500 hover:bg-emerald-600 text-white transition-colors no-underline"
                        >
                          Ver Detalhes
                        </a>
                      ) : (
                        <span className="block w-full py-2.5 rounded-xl text-sm font-semibold text-center bg-secondary/40 text-muted-foreground">
                          Ver Detalhes
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 py-5 text-center text-xs text-muted-foreground">
        Romatec Imóveis · romateccrm.com
      </footer>
    </div>
  );
}
