import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { logSOActivity } from '@/lib/so-activity-log';
import { DollarSign, Plus, Send, Trash2 } from 'lucide-react';

interface Budget {
  id: string;
  provider_name: string;
  description: string | null;
  amount: number;
  file_url: string | null;
  created_at: string;
}

interface Props {
  orderId: string;
  condoId: string;
  isEmergency: boolean;
  isSindico: boolean;
  canCriticalActions: boolean;
  status: string;
  onSubmittedForApproval: () => void;
}

export function OSBudgetsCard({ orderId, condoId, isEmergency, isSindico, canCriticalActions, status, onSubmittedForApproval }: Props) {
  const { toast } = useToast();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ provider_name: '', description: '', amount: '' });

  const canManage = canCriticalActions && (status === 'ABERTA' || status === 'EM_EXECUCAO');
  const minBudgets = isEmergency ? 1 : 3;

  const fetchBudgets = async () => {
    setLoading(true);
    const { data } = await supabase
      .schema('nfe_vigia')
      .from('budgets')
      .select('*')
      .eq('service_order_id', orderId)
      .order('created_at', { ascending: true });
    setBudgets(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchBudgets(); }, [orderId]);

  const handleAdd = async () => {
    if (!form.provider_name.trim() || !form.amount) {
      toast({ title: 'Preencha fornecedor e valor', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.schema('nfe_vigia').from('budgets').insert({
      service_order_id: orderId,
      provider_name: form.provider_name.trim(),
      description: form.description.trim() || null,
      amount: parseFloat(form.amount),
    });
    if (error) {
      toast({ title: 'Erro ao adicionar orçamento', variant: 'destructive' });
    } else {
      toast({ title: 'Orçamento adicionado' });
      setForm({ provider_name: '', description: '', amount: '' });
      setModalOpen(false);
      fetchBudgets();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.schema('nfe_vigia').from('budgets').delete().eq('id', id);
    if (!error) fetchBudgets();
  };

  const handleSubmitForApproval = async () => {
    if (budgets.length < minBudgets) {
      toast({
        title: `Mínimo de ${minBudgets} orçamento(s) necessário(s)`,
        description: isEmergency ? 'OS emergencial requer ao menos 1 orçamento.' : 'São necessários ao menos 3 orçamentos para enviar para aprovação.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    // Get approval deadline from condo config
    const { data: config } = await supabase
      .schema('nfe_vigia')
      .from('condo_financial_config')
      .select('approval_deadline_hours')
      .eq('condo_id', condoId)
      .maybeSingle();

    const deadlineHours = config?.approval_deadline_hours ?? 48;

    // Get all SUBSINDICO and CONSELHO approvers for this condo
    const { data: approvers } = await supabase
      .schema('nfe_vigia')
      .from('user_condos')
      .select('user_id, role')
      .eq('condo_id', condoId)
      .in('role', ['SUBSINDICO', 'CONSELHO'])
      .eq('status', 'ativo');

    if (!approvers || approvers.length === 0) {
      toast({ title: 'Nenhum aprovador encontrado', description: 'Cadastre Subsíndico ou Conselheiros antes de enviar para aprovação.', variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    const expiresAt = new Date(Date.now() + deadlineHours * 60 * 60 * 1000).toISOString();

    // Create approval records
    const approvalRecords = approvers.map((a: any) => ({
      service_order_id: orderId,
      condo_id: condoId,
      approver_id: a.user_id,
      approver_role: a.role,
      approval_type: 'ORCAMENTO',
      decision: 'pendente',
      expires_at: expiresAt,
    }));

    const { error } = await supabase.schema('nfe_vigia').from('approvals').insert(approvalRecords);

    if (error) {
      toast({ title: 'Erro ao enviar para aprovação', variant: 'destructive' });
    } else {
      await logSOActivity({
        serviceOrderId: orderId,
        action: 'ENVIADA_APROVACAO',
        description: 'Orçamentos enviados para aprovação — aguardando Subsíndico e Conselheiros',
      });
      toast({ title: 'Orçamentos enviados para aprovação' });
      onSubmittedForApproval();
    }
    setSubmitting(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Orçamentos
          {budgets.length > 0 && (
            <Badge variant="secondary" className="text-xs">{budgets.length}</Badge>
          )}
        </CardTitle>
        <div className="flex gap-2">
          {canManage && (
            <>
              <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
              {budgets.length >= minBudgets && (
                <Button size="sm" onClick={handleSubmitForApproval} disabled={submitting}>
                  <Send className="h-4 w-4 mr-1" />
                  {submitting ? 'Enviando...' : 'Enviar p/ aprovação'}
                </Button>
              )}
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
        ) : budgets.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">Nenhum orçamento registrado.</p>
            {canManage && !isEmergency && (
              <p className="text-xs text-muted-foreground mt-1">
                Adicione ao menos 3 orçamentos para enviar para aprovação.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {budgets.map((b, i) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {i + 1}. {b.provider_name}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      R$ {b.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </Badge>
                  </div>
                  {b.description && (
                    <p className="text-xs text-muted-foreground truncate">{b.description}</p>
                  )}
                </div>
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(b.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Orçamento</DialogTitle>
            <DialogDescription>Informe os dados do orçamento recebido.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Fornecedor *</Label>
              <Input
                value={form.provider_name}
                onChange={(e) => setForm(p => ({ ...p, provider_name: e.target.value }))}
                placeholder="Nome do fornecedor"
              />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Detalhes do orçamento..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? 'Salvando...' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
