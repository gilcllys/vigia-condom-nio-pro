import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
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

    console.log('[RoleChangeDialog] Salvando role:', { role, userCondoUserId, condoId });

    // Update role in user_condos
    const { data: ucData, error: ucError, count: ucCount } = await supabase
      .from('user_condos')
      .update({ role })
      .eq('user_id', userCondoUserId)
      .eq('condo_id', condoId)
      .select();

    console.log('[RoleChangeDialog] user_condos update result:', { ucData, ucError, ucCount });

    if (ucError) {
      toast({ title: 'Erro ao alterar função', description: ucError.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    if (!ucData || ucData.length === 0) {
      console.warn('[RoleChangeDialog] user_condos update afetou 0 linhas! Possível bloqueio por RLS.');
      toast({ title: 'Função não alterada', description: 'A atualização não afetou nenhum registro. Verifique suas permissões.', variant: 'destructive' });
      setSaving(false);
      return;
    }

    // Also update profile in nfe_vigia.users
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .update({ profile: role })
      .eq('id', userCondoUserId)
      .select();

    console.log('[RoleChangeDialog] users update result:', { usersData, usersError });

    await logActivity({
      condoId,
      action: 'update',
      entity: 'user_condo',
      entityId: userCondoUserId,
      description: `Função de "${residentName}" alterada para ${ROLE_LABELS[role] ?? role}`,
    });
    toast({ title: `Função alterada para ${ROLE_LABELS[role] ?? role}` });
    onSaved();
    onOpenChange(false);
    setSaving(false);
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
