import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Home, Search, Edit, MapPin, DollarSign, Plus, ArrowLeft, Image, Video, FileImage, Ruler, BedDouble, Bath, Car, Sparkles, ExternalLink, Loader2, X, Eye, Heart, Phone, MessageCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface PropertyForm {
  denomination: string;
  address: string;
  city: string;
  state: string;
  cep: string;
  price: string;
  offerPrice: string;
  description: string;
  images: string[];
  videoUrl: string;
  plantaBaixaUrl: string;
  areaConstruida: string;
  areaCasa: string;
  areaTerreno: string;
  bedrooms: number;
  bathrooms: number;
  garageSpaces: number;
  propertyType: string;
}

const emptyForm: PropertyForm = {
  denomination: "", address: "", city: "", state: "", cep: "",
  price: "", offerPrice: "", description: "",
  images: [], videoUrl: "", plantaBaixaUrl: "",
  areaConstruida: "", areaCasa: "", areaTerreno: "",
  bedrooms: 0, bathrooms: 0, garageSpaces: 0, propertyType: "",
};

function formatCurrency(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Properties() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: properties, refetch } = trpc.properties.list.useQuery();
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [form, setForm] = useState<PropertyForm>({ ...emptyForm });
  const [newImageUrl, setNewImageUrl] = useState("");
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);

  const createProperty = trpc.properties.create.useMutation({
    onSuccess: () => { toast.success("Imóvel cadastrado!"); refetch(); setShowForm(false); setForm({ ...emptyForm }); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const updateProperty = trpc.properties.update.useMutation({
    onSuccess: () => { toast.success("Imóvel atualizado!"); refetch(); setShowForm(false); setEditingId(null); setForm({ ...emptyForm }); },
    onError: (e) => toast.error(`Erro: ${e.message}`),
  });

  const generateDesc = trpc.properties.generateDescription.useMutation({
    onSuccess: (data) => { setForm(prev => ({ ...prev, description: data.description })); toast.success("Descrição gerada pela IA!"); setIsGeneratingDesc(false); },
    onError: (e) => { toast.error(`Erro ao gerar: ${e.message}`); setIsGeneratingDesc(false); },
  });

  const filteredProperties = useMemo(() => {
    if (!properties) return [];
    return properties.filter(p =>
      p.denomination?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.address?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [properties, searchTerm]);

  const handleEdit = (property: any) => {
    setEditingId(property.id);
    setForm({
      denomination: property.denomination || "", address: property.address || "",
      city: property.city || "", state: property.state || "", cep: property.cep || "",
      price: property.price?.toString() || "", offerPrice: property.offerPrice?.toString() || "",
      description: property.description || "", images: property.images || [],
      videoUrl: property.videoUrl || "", plantaBaixaUrl: property.plantaBaixaUrl || "",
      areaConstruida: property.areaConstruida?.toString() || "",
      areaCasa: property.areaCasa?.toString() || "",
      areaTerreno: property.areaTerreno?.toString() || "",
      bedrooms: property.bedrooms || 0, bathrooms: property.bathrooms || 0,
      garageSpaces: property.garageSpaces || 0, propertyType: property.propertyType || "",
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.denomination || !form.address || !form.price) { toast.error("Preencha nome, endereço e preço!"); return; }
    if (editingId) { updateProperty.mutate({ id: editingId, ...form }); }
    else { createProperty.mutate(form); }
  };

  const handleGenerateDescription = () => {
    if (!form.denomination || !form.address) { toast.error("Preencha nome e endereço primeiro!"); return; }
    setIsGeneratingDesc(true);
    generateDesc.mutate({
      denomination: form.denomination, address: form.address, city: form.city,
      price: form.price, offerPrice: form.offerPrice, areaConstruida: form.areaConstruida,
      areaCasa: form.areaCasa, areaTerreno: form.areaTerreno, bedrooms: form.bedrooms,
      bathrooms: form.bathrooms, garageSpaces: form.garageSpaces, propertyType: form.propertyType,
    });
  };

  const addImage = () => {
    if (newImageUrl.trim()) { setForm(prev => ({ ...prev, images: [...prev.images, newImageUrl.trim()] })); setNewImageUrl(""); }
  };

  const removeImage = (idx: number) => {
    setForm(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header Premium */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-dark/20 via-transparent to-gold-dark/20" />
        <div className="relative border-b border-border/50 backdrop-blur-sm">
          <div className="container py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button onClick={() => navigate("/dashboard")} className="p-2 rounded-xl bg-secondary/50 hover:bg-secondary text-foreground transition-all">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-emerald/20 to-emerald-dark/20 border border-emerald/20">
                      <Home className="h-6 w-6 text-emerald" />
                    </div>
                    Imóveis
                  </h1>
                  <p className="text-muted-foreground text-sm mt-1">{properties?.length || 0} propriedades cadastradas</p>
                </div>
              </div>
              <Button onClick={() => { setShowForm(true); setEditingId(null); setForm({ ...emptyForm }); }} className="btn-premium text-sm">
                <Plus className="mr-2 h-4 w-4" /> Novo Imóvel
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-6">
        {/* Formulário */}
        {showForm && (
          <div className="mb-8 glass-card p-6 animate-slide-in-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-foreground">{editingId ? "Editar Imóvel" : "Cadastrar Novo Imóvel"}</h2>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="p-2 rounded-lg hover:bg-secondary/50 text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-6 bg-secondary/50">
                <TabsTrigger value="info">Informações</TabsTrigger>
                <TabsTrigger value="media">Fotos</TabsTrigger>
                <TabsTrigger value="video">Vídeo</TabsTrigger>
                <TabsTrigger value="planta">Planta Baixa</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">Nome/Denominação *</label>
                    <Input value={form.denomination} onChange={e => setForm(p => ({ ...p, denomination: e.target.value }))} placeholder="Ex: Residencial Vaz-01" className="bg-secondary/30 border-border/50" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">Tipo do Imóvel</label>
                    <select value={form.propertyType} onChange={e => setForm(p => ({ ...p, propertyType: e.target.value }))} className="w-full h-10 px-3 rounded-md border border-border/50 bg-secondary/30 text-foreground text-sm">
                      <option value="">Selecione...</option>
                      <option value="Casa">Casa</option>
                      <option value="Apartamento">Apartamento</option>
                      <option value="Terreno">Terreno</option>
                      <option value="Comercial">Comercial</option>
                      <option value="Chácara">Chácara</option>
                      <option value="Fazenda">Fazenda</option>
                      <option value="Lote">Lote</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">Endereço *</label>
                    <Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Rua, número, bairro" className="bg-secondary/30 border-border/50" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">CEP</label>
                    <Input value={form.cep} onChange={e => setForm(p => ({ ...p, cep: e.target.value }))} placeholder="65930-000" className="bg-secondary/30 border-border/50" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">Cidade</label>
                    <Input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} placeholder="Açailândia" className="bg-secondary/30 border-border/50" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">Estado</label>
                    <Input value={form.state} onChange={e => setForm(p => ({ ...p, state: e.target.value }))} placeholder="MA" maxLength={2} className="bg-secondary/30 border-border/50" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block flex items-center gap-1"><DollarSign className="h-3 w-3 text-emerald" /> Preço (R$) *</label>
                    <Input value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="250000.00" type="number" step="0.01" className="bg-secondary/30 border-border/50" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block flex items-center gap-1"><DollarSign className="h-3 w-3 text-gold" /> Valor de Oferta (R$)</label>
                    <Input value={form.offerPrice} onChange={e => setForm(p => ({ ...p, offerPrice: e.target.value }))} placeholder="230000.00" type="number" step="0.01" className="bg-secondary/30 border-border/50" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block"><Ruler className="h-3 w-3 inline mr-1" />Área Construída (m²)</label>
                    <Input value={form.areaConstruida} onChange={e => setForm(p => ({ ...p, areaConstruida: e.target.value }))} placeholder="120.00" type="number" step="0.01" className="bg-secondary/30 border-border/50" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block"><Ruler className="h-3 w-3 inline mr-1" />Área da Casa (m²)</label>
                    <Input value={form.areaCasa} onChange={e => setForm(p => ({ ...p, areaCasa: e.target.value }))} placeholder="90.00" type="number" step="0.01" className="bg-secondary/30 border-border/50" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block"><Ruler className="h-3 w-3 inline mr-1" />Área do Terreno (m²)</label>
                    <Input value={form.areaTerreno} onChange={e => setForm(p => ({ ...p, areaTerreno: e.target.value }))} placeholder="300.00" type="number" step="0.01" className="bg-secondary/30 border-border/50" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block"><BedDouble className="h-3 w-3 inline mr-1" />Quartos</label>
                    <Input value={form.bedrooms} onChange={e => setForm(p => ({ ...p, bedrooms: parseInt(e.target.value) || 0 }))} type="number" min="0" className="bg-secondary/30 border-border/50" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block"><Bath className="h-3 w-3 inline mr-1" />Banheiros</label>
                    <Input value={form.bathrooms} onChange={e => setForm(p => ({ ...p, bathrooms: parseInt(e.target.value) || 0 }))} type="number" min="0" className="bg-secondary/30 border-border/50" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block"><Car className="h-3 w-3 inline mr-1" />Vagas Garagem</label>
                    <Input value={form.garageSpaces} onChange={e => setForm(p => ({ ...p, garageSpaces: parseInt(e.target.value) || 0 }))} type="number" min="0" className="bg-secondary/30 border-border/50" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-muted-foreground">Descrição</label>
                    <Button type="button" variant="outline" size="sm" onClick={handleGenerateDescription} disabled={isGeneratingDesc} className="text-gold border-gold/30 hover:bg-gold/10">
                      {isGeneratingDesc ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Gerando...</> : <><Sparkles className="mr-1 h-3 w-3" /> Gerar com IA</>}
                    </Button>
                  </div>
                  <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Descrição atrativa do imóvel (ou clique em 'Gerar com IA')" rows={5} className="bg-secondary/30 border-border/50" />
                  <p className="text-xs text-muted-foreground mt-1">A IA gera descrições com gatilhos de escassez e oferta automaticamente</p>
                </div>
              </TabsContent>

              <TabsContent value="media" className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Image className="h-5 w-5 text-emerald" />
                  <h3 className="font-semibold text-foreground">Galeria de Fotos</h3>
                </div>
                <div className="flex gap-2">
                  <Input value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)} placeholder="Cole a URL da imagem aqui..." className="flex-1 bg-secondary/30 border-border/50" />
                  <Button onClick={addImage} className="btn-premium"><Plus className="mr-1 h-4 w-4" /> Adicionar</Button>
                </div>
                {form.images.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {form.images.map((img, idx) => (
                      <div key={idx} className="relative group rounded-xl overflow-hidden border border-border/50">
                        <img src={img} alt={`Foto ${idx + 1}`} className="w-full h-40 object-cover" />
                        <button onClick={() => removeImage(idx)} className="absolute top-2 right-2 bg-red-500/90 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <X className="h-3 w-3" />
                        </button>
                        <span className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">Foto {idx + 1}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-12 border-2 border-dashed border-border/30 rounded-xl text-center">
                    <Image className="h-12 w-12 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-muted-foreground">Nenhuma foto adicionada</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="video" className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Video className="h-5 w-5 text-red-500" />
                  <h3 className="font-semibold text-foreground">Vídeo do Imóvel</h3>
                </div>
                <Input value={form.videoUrl} onChange={e => setForm(p => ({ ...p, videoUrl: e.target.value }))} placeholder="Cole a URL do vídeo (YouTube, etc.)" className="bg-secondary/30 border-border/50" />
                {form.videoUrl ? (
                  <div className="rounded-xl overflow-hidden border border-border/50 bg-black aspect-video">
                    {form.videoUrl.includes("youtube") || form.videoUrl.includes("youtu.be") ? (
                      <iframe src={form.videoUrl.replace("watch?v=", "embed/").replace("youtu.be/", "youtube.com/embed/")} className="w-full h-full" allowFullScreen />
                    ) : (
                      <video src={form.videoUrl} controls className="w-full h-full" />
                    )}
                  </div>
                ) : (
                  <div className="p-12 border-2 border-dashed border-border/30 rounded-xl text-center">
                    <Video className="h-12 w-12 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-muted-foreground">Nenhum vídeo adicionado</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="planta" className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileImage className="h-5 w-5 text-emerald" />
                  <h3 className="font-semibold text-foreground">Planta Baixa</h3>
                </div>
                <Input value={form.plantaBaixaUrl} onChange={e => setForm(p => ({ ...p, plantaBaixaUrl: e.target.value }))} placeholder="Cole a URL da planta baixa" className="bg-secondary/30 border-border/50" />
                {form.plantaBaixaUrl ? (
                  <div className="rounded-xl overflow-hidden border border-border/50">
                    <img src={form.plantaBaixaUrl} alt="Planta Baixa" className="w-full max-h-96 object-contain bg-secondary/20" />
                  </div>
                ) : (
                  <div className="p-12 border-2 border-dashed border-border/30 rounded-xl text-center">
                    <FileImage className="h-12 w-12 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-muted-foreground">Nenhuma planta baixa adicionada</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex gap-3 mt-6 pt-4 border-t border-border/30">
              <Button onClick={handleSubmit} className="flex-1 btn-premium h-12 text-base">{editingId ? "Atualizar Imóvel" : "Cadastrar Imóvel"}</Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }} className="h-12 border-border/50">Cancelar</Button>
            </div>
          </div>
        )}

        {/* Barra de Busca */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
            <input type="text" placeholder="Buscar por nome ou endereço..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-secondary/30 border border-border/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald/30 focus:border-emerald/50 transition-all"
            />
          </div>
        </div>

        {/* Grid de Imóveis - Cards Premium */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredProperties.length > 0 ? (
            filteredProperties.map((property: any) => (
              <div key={property.id} className="property-card animate-fade-in">
                {/* Imagem Principal com Carousel */}
                <div className="property-image relative">
                  {property.images && property.images.length > 0 ? (
                    <>
                      <img src={property.images[0]} alt={property.denomination} />
                      {property.images.length > 1 && (
                        <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1">
                          <Image className="h-3 w-3" /> {property.images.length}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-emerald-dark/20 to-gold-dark/10 flex items-center justify-center">
                      <Home className="h-16 w-16 text-emerald/30" />
                    </div>
                  )}
                  {/* Status Badge */}
                  <div className="absolute top-3 left-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm ${
                      property.status === "available" ? "bg-emerald/20 text-emerald border border-emerald/30" :
                      property.status === "sold" ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-secondary/50 text-muted-foreground border border-border/30"
                    }`}>
                      {property.status === "available" ? "Disponível" : property.status === "sold" ? "Vendido" : "Inativo"}
                    </span>
                  </div>
                  {/* Tipo Badge */}
                  {property.propertyType && (
                    <div className="absolute top-3 right-3">
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-gold/20 text-gold border border-gold/30 backdrop-blur-sm">
                        {property.propertyType}
                      </span>
                    </div>
                  )}
                  {/* Gradient Overlay */}
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />
                  {/* Preço sobre a imagem */}
                  <div className="absolute bottom-3 left-3">
                    <p className="text-2xl font-bold text-white text-glow-green">
                      R$ {formatCurrency(property.price)}
                    </p>
                    {property.offerPrice && (
                      <p className="text-sm font-semibold text-gold">
                        Oferta: R$ {formatCurrency(property.offerPrice)}
                      </p>
                    )}
                  </div>
                </div>

                {/* Conteúdo do Card */}
                <div className="p-5">
                  {/* Nome e Endereço */}
                  <h3 className="font-bold text-lg text-foreground mb-1">{property.denomination}</h3>
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-4">
                    <MapPin className="h-3.5 w-3.5 text-emerald" />
                    <p className="text-sm truncate">{property.address}{property.city ? `, ${property.city}` : ""}</p>
                  </div>

                  {/* Características - Chips */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {property.bedrooms > 0 && (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/50 text-sm text-foreground">
                        <BedDouble className="h-3.5 w-3.5 text-emerald" /> {property.bedrooms} Quartos
                      </span>
                    )}
                    {property.bathrooms > 0 && (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/50 text-sm text-foreground">
                        <Bath className="h-3.5 w-3.5 text-emerald" /> {property.bathrooms} Banh.
                      </span>
                    )}
                    {property.garageSpaces > 0 && (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/50 text-sm text-foreground">
                        <Car className="h-3.5 w-3.5 text-emerald" /> {property.garageSpaces} Vagas
                      </span>
                    )}
                    {property.areaConstruida && (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/50 text-sm text-foreground">
                        <Ruler className="h-3.5 w-3.5 text-gold" /> {property.areaConstruida}m²
                      </span>
                    )}
                  </div>

                  {/* Áreas detalhadas */}
                  {(property.areaConstruida || property.areaTerreno) && (
                    <div className="flex gap-4 mb-4 text-xs text-muted-foreground">
                      {property.areaConstruida && <span>Constr: {property.areaConstruida}m²</span>}
                      {property.areaCasa && <span>Casa: {property.areaCasa}m²</span>}
                      {property.areaTerreno && <span>Terreno: {property.areaTerreno}m²</span>}
                    </div>
                  )}

                  {/* Mídia badges */}
                  <div className="flex gap-2 mb-4">
                    {property.images?.length > 0 && <span className="badge-success text-xs py-1 px-2"><Image className="h-3 w-3" /> {property.images.length} fotos</span>}
                    {property.videoUrl && <span className="text-xs py-1 px-2 rounded-full bg-red-500/15 text-red-400 border border-red-500/20 inline-flex items-center gap-1"><Video className="h-3 w-3" /> Vídeo</span>}
                    {property.plantaBaixaUrl && <span className="badge-gold text-xs py-1 px-2"><FileImage className="h-3 w-3" /> Planta</span>}
                  </div>

                  {/* Ações */}
                  <div className="flex gap-2 pt-4 border-t border-border/30">
                    <button onClick={() => setSelectedProperty(property)} className="flex-1 py-2.5 rounded-xl bg-emerald/10 hover:bg-emerald/20 text-emerald font-semibold text-sm transition-all flex items-center justify-center gap-1.5">
                      <Eye className="h-4 w-4" /> Ver Detalhes
                    </button>
                    <button onClick={() => handleEdit(property)} className="flex-1 py-2.5 rounded-xl bg-gold/10 hover:bg-gold/20 text-gold font-semibold text-sm transition-all flex items-center justify-center gap-1.5">
                      <Edit className="h-4 w-4" /> Editar
                    </button>
                    {property.publicSlug && (
                      <button onClick={() => window.open(`/imovel/${property.publicSlug}`, "_blank")} className="py-2.5 px-3 rounded-xl bg-secondary/50 hover:bg-secondary text-foreground transition-all">
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full text-center py-16">
              <div className="p-4 rounded-2xl bg-secondary/30 inline-block mb-4">
                <Home className="h-12 w-12 text-muted-foreground/30" />
              </div>
              <p className="text-foreground text-lg font-medium">Nenhum imóvel encontrado</p>
              <p className="text-muted-foreground text-sm mt-2">Cadastre um novo imóvel ou ajuste a busca</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal de Detalhes Premium */}
      {selectedProperty && (
        <Dialog open={!!selectedProperty} onOpenChange={() => { setSelectedProperty(null); setImageIndex(0); }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card border-border/50 p-0">
            {/* Header com imagem */}
            <div className="relative">
              {selectedProperty.images?.length > 0 ? (
                <div className="relative h-72 md:h-96">
                  <img src={selectedProperty.images[imageIndex] || selectedProperty.images[0]} alt={selectedProperty.denomination} className="w-full h-full object-cover" />
                  {selectedProperty.images.length > 1 && (
                    <>
                      <button onClick={() => setImageIndex(i => (i - 1 + selectedProperty.images.length) % selectedProperty.images.length)} className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all">
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button onClick={() => setImageIndex(i => (i + 1) % selectedProperty.images.length)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-all">
                        <ChevronRight className="h-5 w-5" />
                      </button>
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                        {selectedProperty.images.map((_: string, idx: number) => (
                          <button key={idx} onClick={() => setImageIndex(idx)} className={`w-2 h-2 rounded-full transition-all ${idx === imageIndex ? "bg-white w-6" : "bg-white/50"}`} />
                        ))}
                      </div>
                    </>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-card to-transparent" />
                </div>
              ) : (
                <div className="h-48 bg-gradient-to-br from-emerald-dark/20 to-gold-dark/10 flex items-center justify-center">
                  <Home className="h-20 w-20 text-emerald/20" />
                </div>
              )}
            </div>

            {/* Conteúdo */}
            <div className="px-6 pb-6 -mt-8 relative z-10">
              {/* Nome e Preço */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-foreground">{selectedProperty.denomination}</h2>
                  <div className="flex items-center gap-1.5 text-muted-foreground mt-1">
                    <MapPin className="h-4 w-4 text-emerald" />
                    <span>{selectedProperty.address}{selectedProperty.city ? `, ${selectedProperty.city}` : ""}{selectedProperty.state ? ` - ${selectedProperty.state}` : ""}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-emerald text-glow-green">R$ {formatCurrency(selectedProperty.price)}</p>
                  {selectedProperty.offerPrice && (
                    <p className="text-lg font-semibold text-gold">Oferta: R$ {formatCurrency(selectedProperty.offerPrice)}</p>
                  )}
                </div>
              </div>

              {/* Descrição */}
              {selectedProperty.description && (
                <div className="mb-6 p-4 rounded-xl bg-secondary/30 border border-border/30">
                  <h3 className="text-sm font-semibold text-gold mb-2">Descrição</h3>
                  <p className="text-sm text-foreground/80 whitespace-pre-line leading-relaxed">{selectedProperty.description}</p>
                </div>
              )}

              {/* Características Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {selectedProperty.bedrooms > 0 && (
                  <div className="metric-card text-center">
                    <BedDouble className="h-5 w-5 text-emerald mx-auto mb-1" />
                    <p className="text-lg font-bold text-foreground">{selectedProperty.bedrooms}</p>
                    <p className="text-xs text-muted-foreground">Quartos</p>
                  </div>
                )}
                {selectedProperty.bathrooms > 0 && (
                  <div className="metric-card text-center">
                    <Bath className="h-5 w-5 text-emerald mx-auto mb-1" />
                    <p className="text-lg font-bold text-foreground">{selectedProperty.bathrooms}</p>
                    <p className="text-xs text-muted-foreground">Banheiros</p>
                  </div>
                )}
                {selectedProperty.garageSpaces > 0 && (
                  <div className="metric-card text-center">
                    <Car className="h-5 w-5 text-emerald mx-auto mb-1" />
                    <p className="text-lg font-bold text-foreground">{selectedProperty.garageSpaces}</p>
                    <p className="text-xs text-muted-foreground">Vagas</p>
                  </div>
                )}
                {selectedProperty.areaConstruida && (
                  <div className="metric-card text-center">
                    <Ruler className="h-5 w-5 text-gold mx-auto mb-1" />
                    <p className="text-lg font-bold text-foreground">{selectedProperty.areaConstruida}m²</p>
                    <p className="text-xs text-muted-foreground">Construída</p>
                  </div>
                )}
              </div>

              {/* Áreas */}
              {(selectedProperty.areaCasa || selectedProperty.areaTerreno) && (
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {selectedProperty.areaCasa && (
                    <div className="p-3 rounded-xl bg-emerald/5 border border-emerald/10 text-center">
                      <p className="text-xs text-muted-foreground">Área da Casa</p>
                      <p className="font-bold text-foreground">{selectedProperty.areaCasa} m²</p>
                    </div>
                  )}
                  {selectedProperty.areaTerreno && (
                    <div className="p-3 rounded-xl bg-gold/5 border border-gold/10 text-center">
                      <p className="text-xs text-muted-foreground">Área do Terreno</p>
                      <p className="font-bold text-foreground">{selectedProperty.areaTerreno} m²</p>
                    </div>
                  )}
                </div>
              )}

              {/* Galeria de Miniaturas */}
              {selectedProperty.images?.length > 1 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">Galeria</h3>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {selectedProperty.images.map((img: string, idx: number) => (
                      <button key={idx} onClick={() => setImageIndex(idx)} className={`flex-shrink-0 w-20 h-16 rounded-lg overflow-hidden border-2 transition-all ${idx === imageIndex ? "border-emerald" : "border-transparent opacity-60 hover:opacity-100"}`}>
                        <img src={img} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Vídeo e Planta */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {selectedProperty.videoUrl && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1"><Video className="h-4 w-4 text-red-400" /> Vídeo</h3>
                    <div className="aspect-video rounded-xl overflow-hidden border border-border/30">
                      {selectedProperty.videoUrl.includes("youtube") || selectedProperty.videoUrl.includes("youtu.be") ? (
                        <iframe src={selectedProperty.videoUrl.replace("watch?v=", "embed/")} className="w-full h-full" allowFullScreen />
                      ) : (
                        <video src={selectedProperty.videoUrl} controls className="w-full h-full" />
                      )}
                    </div>
                  </div>
                )}
                {selectedProperty.plantaBaixaUrl && (
                  <div>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-1"><FileImage className="h-4 w-4 text-emerald" /> Planta Baixa</h3>
                    <div className="rounded-xl overflow-hidden border border-border/30">
                      <img src={selectedProperty.plantaBaixaUrl} alt="Planta Baixa" className="w-full max-h-64 object-contain bg-secondary/20" />
                    </div>
                  </div>
                )}
              </div>

              {/* Botões de Ação */}
              <div className="flex gap-3">
                <button className="flex-1 btn-premium py-3 rounded-xl flex items-center justify-center gap-2 text-base">
                  <MessageCircle className="h-5 w-5" /> WhatsApp
                </button>
                <button className="flex-1 btn-gold py-3 rounded-xl flex items-center justify-center gap-2 text-base">
                  <Phone className="h-5 w-5" /> Ligar
                </button>
                <button className="py-3 px-4 rounded-xl bg-secondary/50 hover:bg-secondary text-foreground transition-all">
                  <Heart className="h-5 w-5" />
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
