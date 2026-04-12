import { useState } from "react";
import { MapPin, Phone, MessageCircle, ChevronLeft, ChevronRight, ArrowLeft, BedDouble, Bath, Car, Ruler, Image as ImageIcon, Video, FileImage, Share2, Heart } from "lucide-react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";

function formatCurrency(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const especialistas = [
  { nome: "José Romário P. Bezerra", cargo: "Diretor Comercial", telefone: "5599991811246", display: "(99) 9 9181-1246", avatar: "JR" },
  { nome: "Daniele Cavalcante Vieira", cargo: "Especialista em Imóveis", telefone: "5599992062871", display: "(99) 9 9206-2871", avatar: "DC" },
];

export default function PropertyPublic() {
  const [, params] = useRoute("/imovel/:slug");
  const slug = params?.slug || "";
  const { data: property, isLoading } = trpc.properties.getBySlug.useQuery({ slug }, { enabled: !!slug });
  const [imageIndex, setImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"fotos" | "video" | "planta">("fotos");
  const [selectedEsp, setSelectedEsp] = useState(0);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald/30 border-t-emerald rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando imóvel...</p>
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">Imóvel não encontrado</h2>
          <p className="text-muted-foreground">O link pode estar incorreto ou o imóvel foi removido.</p>
          <a href="/" className="inline-flex items-center gap-2 mt-6 text-emerald hover:text-emerald/80 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Voltar ao início
          </a>
        </div>
      </div>
    );
  }

  const images = property.images || [];
  const imageCount = images.length;
  const hasMultipleImages = imageCount > 1;
  const esp = especialistas[selectedEsp];

  const whatsappMsg = encodeURIComponent(
    `Olá, ${esp.nome.split(' ')[0]}! 👋\n\nVi o imóvel *${property.denomination}* no site da Romatec e tenho interesse!\n\n📍 *Localização:* ${property.address}${property.city ? `, ${property.city}` : ""}\n💰 *Valor:* R$ ${formatCurrency(property.price)}\n\nPoderia me dar mais informações? 😊`
  );
  const whatsappLink = `https://wa.me/${esp.telefone}?text=${whatsappMsg}`;
  const phoneLink = `tel:+${esp.telefone}`;

  const prevImage = () => setImageIndex(i => (i - 1 + imageCount) % imageCount);
  const nextImage = () => setImageIndex(i => (i + 1) % imageCount);

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Hero Image */}
      <div className="relative w-full h-[55vh] bg-secondary/30 overflow-hidden">
        {images.length > 0 ? (
          <>
            <img src={images[imageIndex]} alt={property.denomination} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
            {hasMultipleImages && (
              <>
                <button onClick={prevImage} className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button onClick={nextImage} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all">
                  <ChevronRight className="h-5 w-5" />
                </button>
                <div className="absolute bottom-4 right-4 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                  {imageIndex + 1}/{imageCount}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-20 w-20 text-muted-foreground/20" />
          </div>
        )}

        {/* Back button */}
        <button onClick={() => window.history.back()} className="absolute top-4 left-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all">
          <ArrowLeft className="h-5 w-5" />
        </button>

        {/* Share */}
        <button onClick={() => navigator.share?.({ title: property.denomination, url: window.location.href })} className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all">
          <Share2 className="h-5 w-5" />
        </button>

        {/* Info overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="max-w-3xl mx-auto glass-card p-4 rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mb-2">
                  {property.status === "available" ? "Disponível" : property.status}
                </span>
                <h1 className="text-2xl font-bold text-foreground">{property.denomination}</h1>
                {property.address && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="h-3 w-3 text-emerald" />
                    {property.address}{property.city ? `, ${property.city}` : ""}{property.state ? ` - ${property.state}` : ""}
                  </p>
                )}
              </div>
              {property.price && (
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-muted-foreground">Valor</p>
                  <p className="text-xl font-bold text-emerald">R$ {formatCurrency(property.price)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 pt-6">

        {/* Características */}
        {(property.bedrooms || property.bathrooms || property.parkingSpots || property.area) && (
          <div className="glass-card p-5 mb-6">
            <div className="grid grid-cols-4 gap-3 text-center">
              {property.bedrooms && (
                <div>
                  <BedDouble className="h-5 w-5 text-emerald mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{property.bedrooms}</p>
                  <p className="text-xs text-muted-foreground">Quartos</p>
                </div>
              )}
              {property.bathrooms && (
                <div>
                  <Bath className="h-5 w-5 text-emerald mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{property.bathrooms}</p>
                  <p className="text-xs text-muted-foreground">Banheiros</p>
                </div>
              )}
              {property.parkingSpots && (
                <div>
                  <Car className="h-5 w-5 text-emerald mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{property.parkingSpots}</p>
                  <p className="text-xs text-muted-foreground">Vagas</p>
                </div>
              )}
              {property.area && (
                <div>
                  <Ruler className="h-5 w-5 text-emerald mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{property.area}</p>
                  <p className="text-xs text-muted-foreground">m²</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Descrição */}
        {property.description && (
          <div className="glass-card p-5 mb-6">
            <h2 className="text-lg font-bold text-foreground mb-2">Sobre o Imóvel</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">{property.description}</p>
          </div>
        )}

        {/* Fotos/Video/Planta */}
        {(images.length > 0 || property.videoUrl || property.plantaBaixaUrl) && (
          <div className="glass-card p-5 mb-6">
            <div className="flex gap-3 mb-4">
              {images.length > 0 && (
                <button onClick={() => setActiveTab("fotos")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === "fotos" ? "bg-emerald text-white" : "bg-secondary/50 text-muted-foreground hover:bg-secondary"}`}>
                  <ImageIcon className="h-4 w-4" /> Fotos ({images.length})
                </button>
              )}
              {property.plantaBaixaUrl && (
                <button onClick={() => setActiveTab("planta")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === "planta" ? "bg-emerald text-white" : "bg-secondary/50 text-muted-foreground hover:bg-secondary"}`}>
                  <FileImage className="h-4 w-4" /> Planta Baixa
                </button>
              )}
              {property.videoUrl && (
                <button onClick={() => setActiveTab("video")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === "video" ? "bg-emerald text-white" : "bg-secondary/50 text-muted-foreground hover:bg-secondary"}`}>
                  <Video className="h-4 w-4" /> Vídeo
                </button>
              )}
            </div>

            {activeTab === "fotos" && images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {images.map((img: string, idx: number) => (
                  <button key={idx} onClick={() => { setImageIndex(idx); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className={`rounded-xl overflow-hidden border-2 transition-all ${idx === imageIndex ? "border-emerald" : "border-transparent opacity-70 hover:opacity-100"}`}>
                    <img src={img} alt={`Foto ${idx + 1}`} className="w-full h-20 object-cover" />
                  </button>
                ))}
              </div>
            )}

            {activeTab === "planta" && property.plantaBaixaUrl && (
              <img src={property.plantaBaixaUrl} alt="Planta Baixa" className="w-full rounded-xl" />
            )}

            {activeTab === "video" && property.videoUrl && (
              <video src={property.videoUrl} controls className="w-full rounded-xl" />
            )}
          </div>
        )}

        {/* Localização */}
        {property.address && (
          <div className="glass-card p-5 mb-6">
            <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-emerald" /> Localização
            </h2>
            <div className="flex items-start gap-3 p-3 bg-secondary/30 rounded-xl border border-border/30">
              <MapPin className="h-5 w-5 text-emerald flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  {property.address}{property.city ? `, ${property.city}` : ""}{property.state ? ` - ${property.state}` : ""}
                </p>
              </div>
              <a href={`https://www.google.com/maps/search/${encodeURIComponent(`${property.address}, ${property.city || ''}, ${property.state || ''}`)}`} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 px-3 py-1.5 bg-emerald/20 text-emerald text-xs font-bold rounded-lg border border-emerald/30 hover:bg-emerald/30 transition-colors no-underline">
                📍 Ver no Maps ↗
              </a>
            </div>
          </div>
        )}

        {/* Especialistas */}
        <div className="glass-card p-6 mb-6">
          <div className="text-center mb-4">
            <h3 className="text-lg font-bold text-foreground">🏆 Fale com um Especialista</h3>
            <p className="text-sm text-muted-foreground mt-1">Nossa equipe está pronta para te ajudar a realizar o sonho da casa própria!</p>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {especialistas.map((e, idx) => (
              <button key={idx} onClick={() => setSelectedEsp(idx)} className={`p-4 rounded-xl border-2 transition-all text-left ${selectedEsp === idx ? "border-emerald bg-emerald/10 shadow-lg shadow-emerald/10" : "border-border/30 bg-secondary/20 hover:border-emerald/40"}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold flex-shrink-0 ${selectedEsp === idx ? "bg-emerald text-white shadow-lg" : "bg-secondary text-muted-foreground"}`}>
                    {e.avatar}
                  </div>
                  <div className="flex-1">
                    <p className={`font-bold text-base ${selectedEsp === idx ? "text-emerald" : "text-foreground"}`}>{e.nome}</p>
                    <p className="text-xs text-muted-foreground font-medium">{e.cargo}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">📱 {e.display}</p>
                  </div>
                  {selectedEsp === idx && <span className="text-emerald text-xl flex-shrink-0">✓</span>}
                </div>
              </button>
            ))}
          </div>
          <p className="text-xs text-center text-muted-foreground mt-3">Selecione um especialista e clique em WhatsApp ou Ligar abaixo</p>
        </div>

        {/* Romatec Info */}
        <div className="glass-card p-6 mb-6 text-center">
          <h3 className="text-lg font-bold text-foreground mb-1">Romatec Consultoria Imobiliária</h3>
          <p className="text-sm text-muted-foreground mb-1">Rua São Raimundo, 10 - Centro, Açailândia - MA</p>
          <p className="text-sm text-muted-foreground">José Romário: (99) 9 9181-1246 | Daniele: (99) 9 9206-2871</p>
        </div>
      </div>

      {/* Fixed Bottom CTA */}
      <div className="fixed bottom-0 inset-x-0 z-50 p-4 bg-background/80 backdrop-blur-xl border-t border-border/30">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs text-center text-muted-foreground mb-2">
            💬 Falar com <span className="font-bold text-emerald">{esp.nome}</span> — {esp.display}
          </p>
          <div className="flex gap-3">
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="flex-1 btn-premium py-3.5 rounded-xl flex items-center justify-center gap-2 text-base no-underline">
              <MessageCircle className="h-5 w-5" /> WhatsApp
            </a>
            <a href={phoneLink} className="flex-1 btn-gold py-3.5 rounded-xl flex items-center justify-center gap-2 text-base no-underline">
              <Phone className="h-5 w-5" /> Ligar
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
