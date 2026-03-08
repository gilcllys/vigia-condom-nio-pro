import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCondo } from '@/contexts/CondoContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Pencil, Trash2, Users, Shield, UserPlus } from 'lucide-react';
import { logActivity } from '@/lib/activity-log';
import RoleChangeDialog from '@/components/moradores/RoleChangeDialog';
import AddEmployeeDialog from '@/components/moradores/AddEmployeeDialog';

interface ResidentRow {
  resident_id: string;
  condo_id: string;
  block: string | null;
  unit: string | null;
  unit_label: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  matched_user_id: string | null;
  matched_user_email: string | null;
  matched_role: string | null;
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

const ROLE_LABELS: Record<string, string> = {
  MORADOR: 'Morador',
  ZELADOR: 'Zelador',
  SINDICO: 'Síndico',
  SUBSINDICO: 'Subsíndico',
  CONSELHO: 'Conselho',
  ADMIN: 'Admin',
};

const ROLE_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  SINDICO: 'default',
  ADMIN: 'default',
  SUBSINDICO: 'secondary',
  CONSELHO: 'secondary',
  ZELADOR: 'outline',
  MORADOR: 'outline',
};

const emptyForm: ResidentForm = { full_name: '', document: '', email: '', phone: '', block: '', unit: '', unit_label: '' };

const formatAddress = (r: ResidentRow) => {
  return [r.block, r.unit, r.unit_label].filter(Boolean).join(' · ') || '—';
};

export default function Moradores() {
  const { condoId, role: currentUserRole } = useCondo();
  const { toast } = useToast();

  const canManageRoles = currentUserRole === 'SINDICO' || currentUserRole === 'ADMIN';

  const [residents, setResidents] = useState<ResidentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingResident, setEditingResident] = useState<ResidentRow | null>(null);
  const [form, setForm] = useState<ResidentForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingResident, setDeletingResident] = useState<ResidentRow | null>(null);

  // Role management
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<{ name: string; role: string | null; userId: string | null } | null>(null);
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);

  const fetchResidents = async () => {
    if (!condoId) return;
    setLoading(true);
    const { data, error } = await supabase
      .schema('nfe_vigia')
      .rpc('list_residents_with_user_match', { _condo_id: condoId });

    if (error) {
      console.error('Error fetching residents:', error);
      toast({ title: 'Erro ao carregar moradores', description: error.message, variant: 'destructive' });
    } else {
      setResidents((data as ResidentRow[]) ?? []);
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

  const openEdit = (resident: ResidentRow) => {
    setEditingResident(resident);
    setForm({
      full_name: resident.full_name,
      document: '',
      email: resident.email ?? '',
      phone: resident.phone ?? '',
      block: resident.block ?? '',
      unit: resident.unit ?? '',
      unit_label: resident.unit_label ?? '',
    });
    setModalOpen(true);
  };

  const openDelete = (resident: ResidentRow) => {
    setDeletingResident(resident);
    setDeleteDialogOpen(true);
  };

  const openRoleChange = (resident: ResidentRow) => {
    setRoleTarget({
      name: resident.full_name,
      role: resident.matched_role ?? null,
      userId: resident.matched_user_id ?? null,
    });
    setRoleDialogOpen(true);
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
        .eq('id', editingResident.resident_id);

      if (error) {
        toast({ title: 'Erro ao atualizar morador', description: error.message, variant: 'destructive' });
      } else {
        await logActivity({
          condoId,
          action: 'update',
          entity: 'resident',
          entityId: editingResident.resident_id,
          description: `Morador "${form.full_name.trim()}" atualizado`,
        });
        toast({ title: 'Morador atualizado com sucesso' });
        setModalOpen(false);
        fetchResidents();
      }
    } else {
      const { data: inserted, error } = await supabase
        .schema('nfe_vigia')
        .from('residents')
        .insert(payload)
        .select('id')
        .single();

      if (error) {
        toast({ title: 'Erro ao cadastrar morador', description: error.message, variant: 'destructive' });
      } else {
        await logActivity({
          condoId,
          action: 'create',
          entity: 'resident',
          entityId: inserted?.id ?? '',
          description: `Morador "${form.full_name.trim()}" cadastrado`,
        });
        toast({ title: 'Morador cadastrado com sucesso' });
        setModalOpen(false);
        fetchResidents();
      }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deletingResident || !condoId) return;
    const { error } = await supabase
      .schema('nfe_vigia')
      .from('residents')
      .delete()
      .eq('id', deletingResident.resident_id);

    if (error) {
      toast({ title: 'Erro ao excluir morador', description: error.message, variant: 'destructive' });
    } else {
      await logActivity({
        condoId,
        action: 'delete',
        entity: 'resident',
        entityId: deletingResident.id,
        description: `Morador "${deletingResident.full_name}" excluído`,
      });
      toast({ title: 'Morador excluído com sucesso' });
      fetchResidents();
    }
    setDeleteDialogOpen(false);
    setDeletingResident(null);
  };

  const updateField = (field: keyof ResidentForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRoleSaved = () => {
    fetchUserCondos();
  };

  const handleEmployeeSaved = () => {
    fetchResidents();
    fetchUserCondos();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Moradores</h1>
        <p className="text-muted-foreground">Gerencie os moradores do seu condomínio.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Users className="h-4 w-4" />
            Lista de Moradores
          </CardTitle>
          <div className="flex items-center gap-2">
            {canManageRoles && (
              <Button size="sm" variant="outline" onClick={() => setEmployeeDialogOpen(true)}>
                <UserPlus className="h-4 w-4 mr-1" />
                Adicionar Funcionário
              </Button>
            )}
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Novo Morador
            </Button>
          </div>
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Endereço</TableHead>
                    <TableHead className="w-[130px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((resident) => {
                    const uc = resident.email ? emailToUserCondo.get(resident.email.toLowerCase()) : undefined;
                    const role = uc?.role ?? null;
                    return (
                      <TableRow key={resident.id}>
                        <TableCell className="font-medium">{resident.full_name}</TableCell>
                        <TableCell>
                          {role ? (
                            <Badge variant={ROLE_VARIANTS[role] ?? 'outline'}>
                              {ROLE_LABELS[role] ?? role}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>{resident.document ?? '—'}</TableCell>
                        <TableCell>{resident.email ?? '—'}</TableCell>
                        <TableCell>{resident.phone ?? '—'}</TableCell>
                        <TableCell>{formatAddress(resident)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {canManageRoles && (
                              <Button variant="ghost" size="icon" onClick={() => openRoleChange(resident)} title={uc ? "Alterar papel" : "Este morador não possui conta vinculada"}>
                                <Shield className={`h-4 w-4 ${!uc ? 'opacity-50' : ''}`} />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => openEdit(resident)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openDelete(resident)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[calc(100vh-32px)] w-full max-w-[min(720px,calc(100vw-32px))] flex flex-col px-4 sm:px-6 overflow-y-auto">
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
          <DialogFooter className="sticky bottom-0 bg-background pt-4 border-t border-border">
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

      {/* Role Change Dialog */}
      {roleTarget && condoId && (
        <RoleChangeDialog
          open={roleDialogOpen}
          onOpenChange={setRoleDialogOpen}
          residentName={roleTarget.name}
          currentRole={roleTarget.role}
          userCondoUserId={roleTarget.userId}
          condoId={condoId}
          onSaved={handleRoleSaved}
        />
      )}

      {/* Add Employee Dialog */}
      {condoId && (
        <AddEmployeeDialog
          open={employeeDialogOpen}
          onOpenChange={setEmployeeDialogOpen}
          condoId={condoId}
          onSaved={handleEmployeeSaved}
        />
      )}
    </div>
  );
}
