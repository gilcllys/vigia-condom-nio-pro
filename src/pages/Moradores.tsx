import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCondo } from '@/contexts/CondoContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Pencil, Trash2, Users } from 'lucide-react';

interface Resident {
  id: string;
  condo_id: string;
  block: string | null;
  unit: string | null;
  unit_label: string | null;
  full_name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

interface ResidentForm {
  full_name: string;
  document: string;
  email: string;
  phone: string;
  block: string;
  unit: string;
  unit_label: string;
}

const emptyForm: ResidentForm = { full_name: '', document: '', email: '', phone: '', block: '', unit: '', unit_label: '' };

const formatAddress = (r: Resident) => {
  return [r.block, r.unit, r.unit_label].filter(Boolean).join(' · ') || '—';
};

export default function Moradores() {
  const { condoId } = useCondo();
  const { toast } = useToast();

  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingResident, setEditingResident] = useState<Resident | null>(null);
  const [form, setForm] = useState<ResidentForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingResident, setDeletingResident] = useState<Resident | null>(null);

  const fetchResidents = async () => {
    if (!condoId) return;
    setLoading(true);
    const { data, error } = await supabase
      .schema('nfe_vigia')
      .from('residents')
      .select('*')
      .eq('condo_id', condoId)
      .order('full_name');

    if (error) {
      console.error('Error fetching residents:', error);
      toast({ title: 'Erro ao carregar moradores', description: error.message, variant: 'destructive' });
    } else {
      setResidents(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchResidents();
  }, [condoId]);

  const filtered = residents.filter((r) =>
    r.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditingResident(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (resident: Resident) => {
    setEditingResident(resident);
    setForm({
      full_name: resident.full_name,
      document: resident.document ?? '',
      email: resident.email ?? '',
      phone: resident.phone ?? '',
      block: resident.block ?? '',
      unit: resident.unit ?? '',
      unit_label: resident.unit_label ?? '',
    });
    setModalOpen(true);
  };

  const openDelete = (resident: Resident) => {
    setDeletingResident(resident);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!condoId) return;
    if (!form.full_name.trim()) {
      toast({ title: 'Nome completo é obrigatório', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const payload = {
      condo_id: condoId,
      full_name: form.full_name.trim(),
      document: form.document.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      block: form.block.trim() || null,
      unit: form.unit.trim() || null,
      unit_label: form.unit_label.trim() || null,
      unit_id: null,
    };

    if (editingResident) {
      const { error } = await supabase
        .schema('nfe_vigia')
        .from('residents')
        .update(payload)
        .eq('id', editingResident.id);

      if (error) {
        toast({ title: 'Erro ao atualizar morador', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Morador atualizado com sucesso' });
        setModalOpen(false);
        fetchResidents();
      }
    } else {
      const { error } = await supabase
        .schema('nfe_vigia')
        .from('residents')
        .insert(payload);

      if (error) {
        toast({ title: 'Erro ao cadastrar morador', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Morador cadastrado com sucesso' });
        setModalOpen(false);
        fetchResidents();
      }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deletingResident) return;
    const { error } = await supabase
      .schema('nfe_vigia')
      .from('residents')
      .delete()
      .eq('id', deletingResident.id);

    if (error) {
      toast({ title: 'Erro ao excluir morador', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Morador excluído com sucesso' });
      fetchResidents();
    }
    setDeleteDialogOpen(false);
    setDeletingResident(null);
  };

  const updateField = (field: keyof ResidentForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Moradores</h1>
        <p className="text-muted-foreground">Gerencie os moradores do seu condomínio.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Users className="h-4 w-4" />
            Lista de Moradores
          </CardTitle>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Novo Morador
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {search ? 'Nenhum morador encontrado.' : 'Nenhum morador cadastrado.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefone</TableHead>
                   <TableHead>Endereço</TableHead>
                   <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((resident) => (
                  <TableRow key={resident.id}>
                    <TableCell className="font-medium">{resident.full_name}</TableCell>
                    <TableCell>{resident.document ?? '—'}</TableCell>
                    <TableCell>{resident.email ?? '—'}</TableCell>
                    <TableCell>{resident.phone ?? '—'}</TableCell>
                    <TableCell>{formatAddress(resident)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(resident)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openDelete(resident)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
      <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingResident ? 'Editar Morador' : 'Novo Morador'}</DialogTitle>
            <DialogDescription>
              {editingResident ? 'Atualize os dados do morador.' : 'Preencha os dados para cadastrar um novo morador.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1">
            <div className="space-y-2">
              <Label htmlFor="full_name">Nome completo *</Label>
              <Input id="full_name" value={form.full_name} onChange={(e) => updateField('full_name', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="document">Documento</Label>
              <Input id="document" value={form.document} onChange={(e) => updateField('document', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block">Bloco (opcional)</Label>
              <Input id="block" placeholder="Ex: Bloco 26" value={form.block} onChange={(e) => updateField('block', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unidade / Apto / Casa (opcional)</Label>
              <Input id="unit" placeholder="Ex: Apto 203" value={form.unit} onChange={(e) => updateField('unit', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit_label">Complemento (opcional)</Label>
              <Input id="unit_label" placeholder="Ex: Quadra B Lote 8" value={form.unit_label} onChange={(e) => updateField('unit_label', e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editingResident ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Morador</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{deletingResident?.full_name}</strong>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
