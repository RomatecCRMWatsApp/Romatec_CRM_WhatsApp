import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Search, Trash2, Edit, Plus, Phone, Mail, ArrowLeft, UserCheck, UserX, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const ITEMS_PER_PAGE = 30;

export default function Contacts() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data: contacts, refetch } = trpc.contacts.list.useQuery();
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);

  // Modal states
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "" });
  const [addForm, setAddForm] = useState({ name: "", phone: "", email: "" });

  const updateMutation = trpc.contacts.update.useMutation({
    onSuccess: () => { toast.success("Contato atualizado!"); refetch(); setEditOpen(false); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const deleteMutation = trpc.contacts.delete.useMutation({
    onSuccess: () => { toast.success("Contato removido!"); refetch(); setDeleteOpen(false); },
    onError: (e) => toast.error("Erro: " + e.message),
  });
  const createMutation = trpc.contacts.create.useMutation({
    onSuccess: () => { toast.success("Contato adicionado!"); refetch(); setAddOpen(false); setAddForm({ name: "", phone: "", email: "" }); },
    onError: (e) => toast.error("Erro: " + e.message),
  });

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    return contacts.filter(c =>
      c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone?.includes(searchTerm)
    );
  }, [contacts, searchTerm]);

  const totalPages = Math.ceil(filteredContacts.length / ITEMS_PER_PAGE);
  const paginatedContacts = filteredContacts.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const openEdit = (contact: any) => {
    setSelectedContact(contact);
    setEditForm({ name: contact.name || "", phone: contact.phone || "", email: contact.email || "" });
    setEditOpen(true);
  };

  const openDelete = (contact: any) => {
    setSelectedContact(contact);
    setDeleteOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white p-6">
        <div className="container flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Users className="h-8 w-8" />
              Gerenciar Clientes
            </h1>
            <p className="text-white/80 mt-1">Total: {contacts?.length || 0} contatos</p>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => setAddOpen(true)} className="bg-amber-500 hover:bg-amber-600 text-black font-bold">
              <Plus className="mr-2 h-4 w-4" /> Novo Contato
            </Button>
            <Button onClick={() => navigate("/dashboard")} variant="outline" className="border-white text-white hover:bg-white/20">
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container py-8">
        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
            />
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Mostrando {paginatedContacts.length} de {filteredContacts.length} contatos
          </p>
        </div>

        {/* Contacts Table */}
        <Card className="bg-card border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left p-4 text-sm font-semibold text-muted-foreground">Nome</th>
                  <th className="text-left p-4 text-sm font-semibold text-muted-foreground">Telefone</th>
                  <th className="text-left p-4 text-sm font-semibold text-muted-foreground hidden md:table-cell">Email</th>
                  <th className="text-left p-4 text-sm font-semibold text-muted-foreground hidden lg:table-cell">Status</th>
                  <th className="text-right p-4 text-sm font-semibold text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedContacts.length > 0 ? (
                  paginatedContacts.map((contact) => (
                    <tr key={contact.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm">
                            {(contact.name || "?")[0]?.toUpperCase()}
                          </div>
                          <span className="font-medium text-foreground">{contact.name || "Sem nome"}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5" /> {contact.phone || "—"}
                        </span>
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        <span className="text-muted-foreground flex items-center gap-2">
                          {contact.email ? <><Mail className="h-3.5 w-3.5" /> {contact.email}</> : "—"}
                        </span>
                      </td>
                      <td className="p-4 hidden lg:table-cell">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          contact.status === "active" ? "bg-emerald-500/20 text-emerald-400" :
                          contact.status === "blocked" ? "bg-red-500/20 text-red-400" :
                          "bg-amber-500/20 text-amber-400"
                        }`}>
                          {contact.status === "active" ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                          {contact.status === "active" ? "Ativo" : contact.status === "blocked" ? "Bloqueado" : "Inativo"}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => openEdit(contact)}
                            className="p-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 transition-colors"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => openDelete(contact)}
                            className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-12 text-center">
                      <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-muted-foreground">Nenhum contato encontrado</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-border">
              <p className="text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Editar Contato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Nome</Label>
              <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="bg-secondary border-border" />
            </div>
            <div>
              <Label className="text-muted-foreground">Telefone</Label>
              <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="bg-secondary border-border" />
            </div>
            <div>
              <Label className="text-muted-foreground">Email</Label>
              <Input value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="bg-secondary border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                if (!selectedContact) return;
                updateMutation.mutate({ id: selectedContact.id, ...editForm });
              }}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Tem certeza que deseja excluir o contato <strong className="text-foreground">{selectedContact?.name}</strong>?
            Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!selectedContact) return;
                deleteMutation.mutate({ id: selectedContact.id });
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Novo Contato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground">Nome *</Label>
              <Input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome completo" className="bg-secondary border-border" />
            </div>
            <div>
              <Label className="text-muted-foreground">Telefone *</Label>
              <Input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="+55 99 99999-9999" className="bg-secondary border-border" />
            </div>
            <div>
              <Label className="text-muted-foreground">Email</Label>
              <Input value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" className="bg-secondary border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                if (!addForm.name || !addForm.phone) { toast.error("Nome e telefone são obrigatórios"); return; }
                createMutation.mutate(addForm);
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Adicionando..." : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
