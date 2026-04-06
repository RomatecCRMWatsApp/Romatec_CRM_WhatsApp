import { useState, useCallback } from "react";
import { MapView } from "@/components/Map";
import { MapPin, BedDouble, Bath, Car, Ruler, Image as ImageIcon, Video, FileImage, Phone, MessageCircle, Heart, ChevronLeft, ChevronRight, ArrowLeft, Share2 } from "lucide-react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";

function formatCurrency(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PropertyPublic() {
  const [, params] = useRoute("/imovel/:slug");
  const slug = params?.slug || "";
  const { data: property, isLoading } = trpc.properties.getBySlug.useQuery({ slug }, { enabled: !!slug });
  const [imageIndex, setImageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<"fotos" | "video" | "planta">("fotos");

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
          <div className="p-6 rounded-2xl bg-secondary/30 inline-block mb-4">
            <ImageIcon className="h-16 w-16 text-muted-foreground/30" />
          </div>
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

  const whatsappMsg = encodeURIComponent(
    `Olá! Vi o imóvel *${property.denomination}* no site e gostaria de mais informações.\n📍 ${property.address}${property.city ? `, ${property.city}` : ""}\n💰 R$ ${formatCurrency(property.price)}`
  );

  // Especialistas da Romatec
  const especialistas = [
    { nome: "José Romário", telefone: "5599991811246", display: "(99) 9 9181-1246" },
    { nome: "Daniele Cavalcante", telefone: "5599992062871", display: "(99) 9 9206-2871" },
  ];
  const [selectedEsp, setSelectedEsp] = useState(0);
  const esp = especialistas[selectedEsp];
  const whatsappLink = `https://wa.me/${esp.telefone}?text=${whatsappMsg}`;
  const phoneLink = `tel:+${esp.telefone}`;

  const prevImage = () => setImageIndex(i => (i - 1 + imageCount) % imageCount);
  const nextImage = () => setImageIndex(i => (i + 1) % imageCount);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Image */}
      <div className="relative h-[50vh] md:h-[60vh]">
        {imageCount > 0 ? (
          <>
            <img
              src={images[imageIndex] || images[0]}
              alt={property.denomination}
              className="w-full h-full object-cover"
            />
            {hasMultipleImages && (
              <>
                <button onClick={prevImage} className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-all">
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button onClick={nextImage} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-all">
                  <ChevronRight className="h-6 w-6" />
                </button>
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                  {images.map((_: string, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => setImageIndex(idx)}
                      className={`w-2.5 h-2.5 rounded-full transition-all ${idx === imageIndex ? "bg-white w-8" : "bg-white/40 hover:bg-white/60"}`}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-emerald-dark/20 to-gold-dark/10 flex items-center justify-center">
            <ImageIcon className="h-24 w-24 text-emerald/20" />
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-black/30" />

        {/* Top bar */}
        <div className="absolute top-4 left-4 right-4 flex justify-between">
          <a href="/" className="p-2.5 rounded-xl bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-all">
            <ArrowLeft className="h-5 w-5" />
          </a>
          <div className="flex gap-2">
            <button
              onClick={() => navigator.share?.({ title: property.denomination, url: window.location.href }).catch(() => {})}
              className="p-2.5 rounded-xl bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-all"
            >
              <Share2 className="h-5 w-5" />
            </button>
            <button className="p-2.5 rounded-xl bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-all">
              <Heart className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Photo count */}
        {hasMultipleImages && (
          <div className="absolute bottom-6 right-4 bg-black/50 backdrop-blur-sm text-white text-sm px-3 py-1.5 rounded-full flex items-center gap-1.5">
            <ImageIcon className="h-4 w-4" /> {imageIndex + 1}/{imageCount}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="container relative -mt-12 z-10 pb-32">
        <div className="max-w-3xl mx-auto">
          {/* Main Info Card */}
          <div className="glass-card p-6 mb-6">
            {/* Status + Type */}
            <div className="flex gap-2 mb-3">
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                property.status === "available"
                  ? "bg-emerald/15 text-emerald border border-emerald/20"
                  : "bg-red-500/15 text-red-400 border border-red-500/20"
              }`}>
                {property.status === "available" ? "Disponível" : "Vendido"}
              </span>
              {property.propertyType && (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-gold/15 text-gold border border-gold/20">
                  {property.propertyType}
                </span>
              )}
            </div>

            {/* Name + Price */}
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2 mb-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">{property.denomination}</h1>
                <div className="flex items-center gap-1.5 text-muted-foreground mt-1">
                  <MapPin className="h-4 w-4 text-emerald" />
                  <span className="text-sm">
                    {property.address}
                    {property.city ? `, ${property.city}` : ""}
                    {property.state ? ` - ${property.state}` : ""}
                  </span>
                </div>
              </div>
              <div className="md:text-right">
                <p className="text-3xl font-bold text-emerald text-glow-green">
                  R$ {formatCurrency(property.price)}
                </p>
                {property.offerPrice && (
                  <p className="text-lg font-semibold text-gold text-glow-gold mt-1">
                    Oferta: R$ {formatCurrency(property.offerPrice)}
                  </p>
                )}
              </div>
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {(property.bedrooms ?? 0) > 0 && (
                <div className="metric-card text-center py-3">
                  <BedDouble className="h-5 w-5 text-emerald mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{property.bedrooms}</p>
                  <p className="text-xs text-muted-foreground">Quartos</p>
                </div>
              )}
              {(property.bathrooms ?? 0) > 0 && (
                <div className="metric-card text-center py-3">
                  <Bath className="h-5 w-5 text-emerald mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{property.bathrooms}</p>
                  <p className="text-xs text-muted-foreground">Banheiros</p>
                </div>
              )}
              {(property.garageSpaces ?? 0) > 0 && (
                <div className="metric-card text-center py-3">
                  <Car className="h-5 w-5 text-emerald mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{property.garageSpaces}</p>
                  <p className="text-xs text-muted-foreground">Vagas</p>
                </div>
              )}
              {property.areaConstruida && (
                <div className="metric-card text-center py-3">
                  <Ruler className="h-5 w-5 text-gold mx-auto mb-1" />
                  <p className="text-lg font-bold text-foreground">{property.areaConstruida}m²</p>
                  <p className="text-xs text-muted-foreground">Construída</p>
                </div>
              )}
            </div>

            {/* Areas */}
            {(property.areaCasa || property.areaTerreno) && (
              <div className="grid grid-cols-2 gap-3 mb-6">
                {property.areaCasa && (
                  <div className="p-3 rounded-xl bg-emerald/5 border border-emerald/10 text-center">
                    <p className="text-xs text-muted-foreground">Área da Casa</p>
                    <p className="font-bold text-foreground">{property.areaCasa} m²</p>
                  </div>
                )}
                {property.areaTerreno && (
                  <div className="p-3 rounded-xl bg-gold/5 border border-gold/10 text-center">
                    <p className="text-xs text-muted-foreground">Área do Terreno</p>
                    <p className="font-bold text-foreground">{property.areaTerreno} m²</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          {property.description && (
            <div className="glass-card p-6 mb-6">
              <h2 className="text-lg font-bold text-foreground mb-3">Sobre o Imóvel</h2>
              <p className="text-foreground/80 leading-relaxed whitespace-pre-line">{property.description}</p>
            </div>
          )}

          {/* Media Tabs */}
          {(hasMultipleImages || property.videoUrl || property.plantaBaixaUrl) && (
            <div className="glass-card p-6 mb-6">
              <div className="flex gap-2 mb-4">
                {hasMultipleImages && (
                  <button
                    onClick={() => setActiveTab("fotos")}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                      activeTab === "fotos" ? "bg-emerald/15 text-emerald" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ImageIcon className="h-4 w-4" /> Fotos ({imageCount})
                  </button>
                )}
                {property.videoUrl && (
                  <button
                    onClick={() => setActiveTab("video")}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                      activeTab === "video" ? "bg-red-500/15 text-red-400" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Video className="h-4 w-4" /> Vídeo
                  </button>
                )}
                {property.plantaBaixaUrl && (
                  <button
                    onClick={() => setActiveTab("planta")}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${
                      activeTab === "planta" ? "bg-gold/15 text-gold" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <FileImage className="h-4 w-4" /> Planta Baixa
                  </button>
                )}
              </div>

              {activeTab === "fotos" && hasMultipleImages && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {images.map((img: string, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => setImageIndex(idx)}
                      className="rounded-xl overflow-hidden border border-border/30 hover:border-emerald/30 transition-all"
                    >
                      <img
                        src={img}
                        alt={`Foto ${idx + 1}`}
                        className="w-full h-32 md:h-40 object-cover hover:scale-105 transition-transform duration-300"
                      />
                    </button>
                  ))}
                </div>
              )}

              {activeTab === "video" && property.videoUrl && (
                <div className="aspect-video rounded-xl overflow-hidden border border-border/30">
                  {property.videoUrl.includes("youtube") || property.videoUrl.includes("youtu.be") ? (
                    <iframe
                      src={property.videoUrl.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/")}
                      className="w-full h-full"
                      allowFullScreen
                    />
                  ) : (
                    <video src={property.videoUrl} controls className="w-full h-full" />
                  )}
                </div>
              )}

              {activeTab === "planta" && property.plantaBaixaUrl && (
                <div className="rounded-xl overflow-hidden border border-border/30">
                  <img
                    src={property.plantaBaixaUrl}
                    alt="Planta Baixa"
                    className="w-full max-h-96 object-contain bg-secondary/20"
                  />
                </div>
              )}
            </div>
          )}

          {/* Mapa de Localização */}
          {property.address && (
            <div className="glass-card p-6 mb-6">
              <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-emerald" /> Localização
              </h2>
              <div className="rounded-xl overflow-hidden border border-border/30">
                <MapView
                  className="h-[300px] md:h-[400px]"
                  initialCenter={{ lat: -4.9476, lng: -47.5068 }}
                  initialZoom={14}
                  onMapReady={(map) => {
                    const geocoder = new google.maps.Geocoder();
                    const fullAddress = `${property.address}${property.city ? `, ${property.city}` : ""}${property.state ? ` - ${property.state}` : ""}`;
                    geocoder.geocode({ address: fullAddress }, (results, status) => {
                      if (status === "OK" && results && results[0]) {
                        map.setCenter(results[0].geometry.location);
                        new google.maps.marker.AdvancedMarkerElement({
                          map,
                          position: results[0].geometry.location,
                          title: property.denomination,
                        });
                      }
                    });
                  }}
                />
              </div>
              <p className="text-sm text-muted-foreground mt-3 text-center">
                {property.address}{property.city ? `, ${property.city}` : ""}{property.state ? ` - ${property.state}` : ""}
              </p>
            </div>
          )}

          {/* Especialistas */}
          <div className="glass-card p-6 mb-6">
            <h3 className="text-lg font-bold text-foreground mb-4 text-center">Fale com um Especialista</h3>
            <div className="grid grid-cols-2 gap-3">
              {especialistas.map((e, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedEsp(idx)}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    selectedEsp === idx
                      ? "border-emerald bg-emerald/10"
                      : "border-border/30 bg-secondary/20 hover:border-emerald/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                      selectedEsp === idx ? "bg-emerald text-white" : "bg-secondary text-muted-foreground"
                    }`}>
                      {e.nome.split(" ")[0][0]}{e.nome.split(" ").slice(-1)[0][0]}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${selectedEsp === idx ? "text-emerald" : "text-foreground"}`}>{e.nome}</p>
                      <p className="text-xs text-muted-foreground">{e.display}</p>
                    </div>
                  </div>
                  {selectedEsp === idx && (
                    <p className="text-xs text-emerald mt-2 font-medium">✓ Selecionado</p>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Romatec Info */}
          <div className="glass-card p-6 mb-6 text-center">
            <h3 className="text-lg font-bold text-foreground mb-1">Romatec Consultoria Imobiliária</h3>
            <p className="text-sm text-muted-foreground mb-1">Rua São Raimundo, 10 - Centro, Açailândia - MA</p>
            <p className="text-sm text-muted-foreground">José Romário: (99) 9 9181-1246 | Daniele: (99) 9 9206-2871</p>
          </div>
        </div>
      </div>

      {/* Fixed Bottom CTA */}
      <div className="fixed bottom-0 inset-x-0 z-50 p-4 bg-background/80 backdrop-blur-xl border-t border-border/30">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs text-center text-muted-foreground mb-2">Falar com <span className="font-semibold text-emerald">{esp.nome}</span></p>
          <div className="flex gap-3">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 btn-premium py-3.5 rounded-xl flex items-center justify-center gap-2 text-base no-underline"
            >
              <MessageCircle className="h-5 w-5" /> WhatsApp
            </a>
            <a
              href={phoneLink}
              className="flex-1 btn-gold py-3.5 rounded-xl flex items-center justify-center gap-2 text-base no-underline"
            >
              <Phone className="h-5 w-5" /> Ligar
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
