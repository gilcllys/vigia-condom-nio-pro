import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, authApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/activity-log';

interface AddEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  condoId: string;
  onSaved: () => void;
}

interface EmployeeForm {
  full_name: string;
  email: string;
  password: string;
  phone: string;
}

const emptyForm: EmployeeForm = { full_name: '', email: '', password: '', phone: '' };

export default function AddEmployeeDialog({ open, onOpenChange, condoId, onSaved }: AddEmployeeDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const updateField = (field: keyof EmployeeForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.email.trim() || !form.password.trim()) {
      toast({ title: 'Nome, email e senha são obrigatórios', variant: 'destructive' });
      return;
    }
    if (form.password.length < 6) {
      toast({ title: 'A senha deve ter no mínimo 6 caracteres', variant: 'destructive' });
      return;
    }

    setSaving(true);

    try {
      // 1. Create auth user via signUp
      const signUpResult = await authApi.signUp(form.email.trim(), form.password.trim());

      if (!signUpResult.ok) {
        const errMsg = signUpResult.data?.message || signUpResult.data?.error || 'Erro desconhecido';
        toast({ title: 'Erro ao criar conta', description: errMsg, variant: 'destructive' });
        setSaving(false);
        return;
      }

      const authUserId = signUpResult.data?.user?.id;
      if (!authUserId) {
        toast({ title: 'Erro inesperado: ID do usuário não retornado', variant: 'destructive' });
        setSaving(false);
        return;
      }

      // 2. Create nfe_vigia.users record via signup-register endpoint
      const userRes = await apiFetch('/api/data/signup-register/', {
        method: 'POST',
        body: JSON.stringify({
          auth_user_id: authUserId,
          condo_id: condoId,
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          profile: 'ZELADOR',
          phone: form.phone.trim() || null,
          password: form.password.trim(),
          redirect_to: null,
        }),
      });

      if (!userRes.ok) {
        const errData = await userRes.json().catch(() => ({}));
        toast({ title: 'Erro ao criar perfil do funcionário', description: errData.error || 'Erro desconhecido', variant: 'destructive' });
        setSaving(false);
        return;
      }

      const insertedUser = await userRes.json();

      // 3. Create nfe_vigia.user_condos record
      const condoRes = await apiFetch('/api/data/user-condos/', {
        method: 'POST',
        body: JSON.stringify({
          user_id: insertedUser.id || insertedUser.user_id,
          condo_id: condoId,
          role: 'ZELADOR',
          is_default: true,
        }),
      });

      if (!condoRes.ok) {
        const errData = await condoRes.json().catch(() => ({}));
        toast({ title: 'Erro ao vincular funcionário', description: errData.error || 'Erro desconhecido', variant: 'destructive' });
        setSaving(false);
        return;
      }

      await logActivity({
        condoId,
        action: 'create',
        entity: 'user',
        entityId: insertedUser.id || insertedUser.user_id,
        description: `Funcionário "${form.full_name.trim()}" adicionado como Zelador`,
      });

      toast({ title: 'Funcionário adicionado com sucesso' });
      setForm(emptyForm);
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Erro ao adicionar funcionário', description: err.message || 'Tente novamente.', variant: 'destructive' });
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar Funcionário</DialogTitle>
          <DialogDescription>
            O funcionário será criado com o papel de <strong>Zelador</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="emp_name">Nome completo *</Label>
            <Input id="emp_name" value={form.full_name} onChange={(e) => updateField('full_name', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emp_email">Email *</Label>
            <Input id="emp_email" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emp_password">Senha *</Label>
            <Input id="emp_password" type="password" value={form.password} onChange={(e) => updateField('password', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emp_phone">Telefone</Label>
            <Input id="emp_phone" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Adicionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
