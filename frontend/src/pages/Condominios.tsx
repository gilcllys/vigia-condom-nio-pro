import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useCondo } from '@/contexts/CondoContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  Building2,
  Plus,
  Pencil,
  Link2,
  CheckCircle2,
  Loader2,
  ArrowRightLeft,
} from 'lucide-react';
import InviteLinkDialog from '@/components/moradores/InviteLinkDialog';

interface CondoItem {
  condo_id: string;
  condo_name: string;
  role: string;
  is_default: boolean;
}

interface CondoForm {
  name: string;
  document: string;
}

const emptyForm: CondoForm = { name: '', document: '' };

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  SINDICO: 'Síndico',
  SUBSINDICO: 'Subsíndico',
  CONSELHO: 'Conselho',
  ZELADOR: 'Zelador',
  MORADOR: 'Morador',
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-primary/15 text-primary border-primary/30',
  SINDICO: 'bg-primary/15 text-primary border-primary/30',
  SUBSINDICO: 'bg-warning/15 text-warning border-warning/30',
  CONSELHO: 'bg-success/15 text-success border-success/30',
  ZELADOR: 'bg-secondary/20 text-secondary-foreground border-secondary/30',
  MORADOR: 'bg-muted/40 text-muted-foreground border-border',
};

export default function Condominios() {
  const { condoId, condoName, switchCondo, refresh } = useCondo();
  const { toast } = useToast();

  const [condos, setCondos] = useState<CondoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CondoForm>(emptyForm);
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editingCondo, setEditingCondo] = useState<CondoItem | null>(null);
  const [editForm, setEditForm] = useState<CondoForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Invite link dialog
  const [inviteCondoId, setInviteCondoId] = useState<string | null>(null);

  // Switch confirm
  const [switchConfirm, setSwitchConfirm] = useState<CondoItem | null>(null);

  const fetchCondos = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/data/condos/my/');
      if (!res.ok) throw new Error('Erro ao carregar condomínios');
      const data = await res.json();
      setCondos((Array.isArray(data) ? data : data.results ?? []) as CondoItem[]);
    } catch (err: any) {
      toast({ title: 'Erro ao carregar condomínios', description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCondos();
  }, []);

  // ── Create ──────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch('/api/data/condos/onboard/', {
        method: 'POST',
        body: JSON.stringify({
          p_name: createForm.name.trim(),
          p_document: createForm.document.trim() || null,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || 'Erro ao criar condomínio');
      }
      toast({ title: 'Condomínio criado com sucesso!' });
      setCreateOpen(false);
      setCreateForm(emptyForm);
      await fetchCondos();
      await refresh();
    } catch (err: any) {
      toast({ title: 'Erro ao criar condomínio', description: err.message, variant: 'destructive' });
    }
    setCreating(false);
  };

  // ── Edit ────────────────────────────────────────────────────────────────────

  const openEdit = (condo: CondoItem) => {
    setEditingCondo(condo);
    setEditForm({ name: condo.condo_name, document: '' });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editingCondo || !editForm.name.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/data/condos/${editingCondo.condo_id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editForm.name.trim() }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || 'Erro ao atualizar condomínio');
      }
      toast({ title: 'Condomínio atualizado com sucesso!' });
      setEditOpen(false);
      setEditingCondo(null);
      await fetchCondos();
      // Refresh context if we edited the active condo
      if (editingCondo.condo_id === condoId) await refresh();
    } catch (err: any) {
      toast({ title: 'Erro ao atualizar condomínio', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  // ── Switch ──────────────────────────────────────────────────────────────────

  const handleSwitch = async (condo: CondoItem) => {
    if (condo.condo_id === condoId) return;
    setSwitchConfirm(null);
    setSwitching(condo.condo_id);
    const success = await switchCondo(condo.condo_id);
    if (!success) {
      toast({ title: 'Erro ao trocar condomínio', variant: 'destructive' });
    } else {
      toast({ title: `Condomínio ativo: ${condo.condo_name}` });
      await fetchCondos();
    }
    setSwitching(null);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Condomínios</h1>
          <p className="text-sm text-muted-foreground">Gerencie todos os condomínios vinculados à sua conta.</p>
        </div>
        <Button onClick={() => { setCreateForm(emptyForm); setCreateOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Condomínio
        </Button>
      </div>

      {/* Active condo banner */}
      {condoName && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Condomínio ativo</p>
            <p className="text-xs text-muted-foreground">{condoName}</p>
          </div>
        </div>
      )}

      {/* Condos grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : condos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="rounded-full bg-muted p-4">
            <Building2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Nenhum condomínio encontrado</p>
            <p className="text-xs text-muted-foreground mt-1">Crie o primeiro condomínio para começar.</p>
          </div>
          <Button onClick={() => { setCreateForm(emptyForm); setCreateOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Criar condomínio
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {condos.map((condo) => {
            const isActive = condo.condo_id === condoId;
            const isSwitching = switching === condo.condo_id;
            return (
              <Card
                key={condo.condo_id}
                className={`relative overflow-hidden transition-all ${
                  isActive ? 'border-primary/40 shadow-md shadow-primary/10' : 'hover:border-border'
                }`}
              >
                {isActive && (
                  <div className="absolute inset-x-0 top-0 h-0.5 bg-primary" />
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`rounded-lg p-2 shrink-0 ${
                        isActive ? 'bg-primary/10' : 'bg-muted'
                      }`}>
                        <Building2 className={`h-4 w-4 ${
                          isActive ? 'text-primary' : 'text-muted-foreground'
                        }`} />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold text-foreground truncate">
                          {condo.condo_name}
                        </CardTitle>
                        {isActive && (
                          <span className="text-[10px] text-primary font-medium">● Ativo</span>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 ${
                        ROLE_COLORS[condo.role] ?? 'bg-muted/40 text-muted-foreground border-border'
                      }`}
                    >
                      {ROLE_LABELS[condo.role] ?? condo.role}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    {!isActive && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-xs h-8"
                        disabled={isSwitching}
                        onClick={() => setSwitchConfirm(condo)}
                      >
                        {isSwitching
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <ArrowRightLeft className="h-3 w-3" />
                        }
                        Definir como ativo
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-xs h-8"
                      onClick={() => openEdit(condo)}
                    >
                      <Pencil className="h-3 w-3" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-xs h-8"
                      onClick={() => setInviteCondoId(condo.condo_id)}
                    >
                      <Link2 className="h-3 w-3" />
                      Convite
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Novo Condomínio
            </DialogTitle>
            <DialogDescription>
              Preencha os dados para criar um novo condomínio. Você será definido como ADMIN.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="create-name">Nome do condomínio *</Label>
              <Input
                id="create-name"
                placeholder="Ex: Residencial Flores"
                value={createForm.name}
                onChange={(e) => setCreateForm(f => ({ ...f, name: e.target.value }))}
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-doc">CNPJ (opcional)</Label>
              <Input
                id="create-doc"
                placeholder="00.000.000/0000-00"
                value={createForm.document}
                onChange={(e) => setCreateForm(f => ({ ...f, document: e.target.value }))}
                disabled={creating}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating || !createForm.name.trim()}>
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Criar Condomínio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ────────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Editar Condomínio
            </DialogTitle>
            <DialogDescription>
              Atualize o nome do condomínio <strong>{editingCondo?.condo_name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome do condomínio *</Label>
              <Input
                id="edit-name"
                placeholder="Ex: Residencial Flores"
                value={editForm.name}
                onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                disabled={saving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={saving || !editForm.name.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Switch Confirm ─────────────────────────────────────────────────── */}
      <AlertDialog open={!!switchConfirm} onOpenChange={(open) => { if (!open) setSwitchConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trocar condomínio ativo?</AlertDialogTitle>
            <AlertDialogDescription>
              Você será redirecionado para o contexto de{' '}
              <strong>{switchConfirm?.condo_name}</strong>. Todas as telas passarão a exibir os dados deste condomínio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => switchConfirm && handleSwitch(switchConfirm)}>
              Confirmar troca
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Invite Link Dialog ─────────────────────────────────────────────── */}
      {inviteCondoId && (
        <InviteLinkDialog
          open={!!inviteCondoId}
          onOpenChange={(open) => { if (!open) setInviteCondoId(null); }}
          condoId={inviteCondoId}
        />
      )}
    </div>
  );
}
