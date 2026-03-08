import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/activity-log';

const ASSIGNABLE_ROLES = ['MORADOR', 'ZELADOR', 'SUBSINDICO', 'CONSELHO'] as const;

const ROLE_LABELS: Record<string, string> = {
  MORADOR: 'Morador',
  ZELADOR: 'Zelador',
  SUBSINDICO: 'Subsíndico',
  CONSELHO: 'Conselho',
};

interface RoleChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  residentName: string;
  currentRole: string | null;
  userCondoUserId: string | null; // nfe_vigia.user_condos.user_id
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
      toast({ title: 'Este morador não possui conta de usuário vinculada', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .schema('nfe_vigia')
      .from('user_condos')
      .update({ role })
      .eq('user_id', userCondoUserId)
      .eq('condo_id', condoId);

    if (error) {
      toast({ title: 'Erro ao alterar papel', description: error.message, variant: 'destructive' });
    } else {
      await logActivity({
        condoId,
        action: 'update',
        entity: 'user_condo',
        entityId: userCondoUserId,
        description: `Papel de "${residentName}" alterado para ${ROLE_LABELS[role] ?? role}`,
      });
      toast({ title: `Papel alterado para ${ROLE_LABELS[role] ?? role}` });
      onSaved();
      onOpenChange(false);
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar Papel</DialogTitle>
          <DialogDescription>
            Altere o papel de <strong>{residentName}</strong> no condomínio.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Papel</Label>
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
