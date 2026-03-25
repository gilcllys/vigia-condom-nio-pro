import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
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

    // 1. Create auth user via signUp (does NOT affect current session when email confirmation is on)
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password.trim(),
      options: {
        data: { full_name: form.full_name.trim() },
      },
    });

    if (signUpError) {
      toast({ title: 'Erro ao criar conta', description: signUpError.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    const authUserId = signUpData.user?.id;
    if (!authUserId) {
      toast({ title: 'Erro inesperado: ID do usuário não retornado', variant: 'destructive' });
      setSaving(false);
      return;
    }

    // 2. Create nfe_vigia.users record
    const { data: insertedUser, error: userError } = await supabase
      .schema('nfe_vigia')
      .from('users')
      .insert({
        auth_user_id: authUserId,
        condo_id: condoId,
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        profile: 'ZELADOR',
        phone: form.phone.trim() || null,
      })
      .select('id')
      .single();

    if (userError) {
      toast({ title: 'Erro ao criar perfil do funcionário', description: userError.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    // 3. Create nfe_vigia.user_condos record
    const { error: condoError } = await supabase
      .schema('nfe_vigia')
      .from('user_condos')
      .insert({
        user_id: insertedUser.id,
        condo_id: condoId,
        role: 'ZELADOR',
        is_default: true,
      });

    if (condoError) {
      toast({ title: 'Erro ao vincular funcionário', description: condoError.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    await logActivity({
      condoId,
      action: 'create',
      entity: 'user',
      entityId: insertedUser.id,
      description: `Funcionário "${form.full_name.trim()}" adicionado como Zelador`,
    });

    toast({ title: 'Funcionário adicionado com sucesso' });
    setForm(emptyForm);
    onSaved();
    onOpenChange(false);
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
