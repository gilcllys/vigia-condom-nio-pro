import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/activity-log';

const ASSIGNABLE_ROLES = ['MORADOR', 'ZELADOR', 'SUBSINDICO', 'CONSELHO', 'SINDICO'] as const;

const ROLE_LABELS: Record<string, string> = {
  MORADOR: 'Morador',
  ZELADOR: 'Zelador',
  SUBSINDICO: 'Subsíndico',
  CONSELHO: 'Conselheiro(a)',
  SINDICO: 'Síndico',
};

interface RoleChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  residentName: string;
  currentRole: string | null;
  userCondoUserId: string | null;
  condoId: string;
  onSaved: () => void;
}

export default function RoleChangeDialog({
  open,
  onOpenChange,
  residentName,
  currentRole,
  userCondoUserId,
  condoId,
  onSaved,
}: RoleChangeDialogProps) {
  const { toast } = useToast();
  const [role, setRole] = useState(currentRole ?? 'MORADOR');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!userCondoUserId) {
      toast({ title: 'Este morador não possui conta de acesso vinculada', variant: 'destructive' });
      return;
    }

    setSaving(true);

    try {
      const res = await apiFetch('/api/data/user-condos/change-role/', {
        method: 'POST',
        body: JSON.stringify({
          user_condo_id: userCondoUserId,
          new_role: role,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast({ title: 'Erro ao alterar função', description: errData.error || 'Tente novamente.', variant: 'destructive' });
        setSaving(false);
        return;
      }

      try {
        await logActivity({
          condoId,
          action: 'update',
          entity: 'user_condo',
          entityId: userCondoUserId,
          description: `Função de "${residentName}" alterada para ${ROLE_LABELS[role] ?? role}`,
        });
      } catch (e) {
        console.warn('[RoleChangeDialog] logActivity falhou (ignorado):', e);
      }
      toast({ title: `Função alterada para ${ROLE_LABELS[role] ?? role}` });
      onOpenChange(false);
      setSaving(false);
      onSaved();
    } catch (err: any) {
      toast({ title: 'Erro ao alterar função', description: err.message || 'Tente novamente.', variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar Função</DialogTitle>
          <DialogDescription>
            Altere a função de <strong>{residentName}</strong> no condomínio.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Função</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
