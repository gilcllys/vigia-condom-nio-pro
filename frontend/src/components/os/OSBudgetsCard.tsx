import { useEffect, useState } from 'react';
import { apiFetch, authApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { logSOActivity } from '@/lib/so-activity-log';
import { sendApprovalEmails } from '@/lib/send-approval-email';
import { useCondo } from '@/contexts/CondoContext';
import { DollarSign, Plus, Send, Trash2, FileText, Calendar } from 'lucide-react';

interface Budget {
  id: string;
  provider_id: string | null;
  description: string | null;
  total_value: number;
  status: string | null;
  valid_until: string | null;
  created_at: string;
}

interface Provider {
  id: string;
  trade_name: string;
  risk_score: number | null;
}

interface Props {
  orderId: string;
  orderTitle?: string;
  condoId: string;
  priority: string;
  executorType: string | null;
  isSindico: boolean;
  isAdmin?: boolean;
  canCriticalActions: boolean;
  status: string;
  onSubmittedForApproval: () => void;
}

const statusBadge: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pendente: { label: 'Pendente', variant: 'outline' },
  aprovado: { label: 'Aprovado', variant: 'default' },
  rejeitado: { label: 'Rejeitado', variant: 'destructive' },
};

export function OSBudgetsCard({ orderId, orderTitle, condoId, priority, executorType, isSindico, isAdmin = false, canCriticalActions, status, onSubmittedForApproval }: Props) {
  const { toast } = useToast();
  const { condoName } = useCondo();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    provider_id: '',
    description: '',
    amount: '',
    valid_until: '',
  });


  const isNotFinished = status !== 'FINALIZADA' && status !== 'CANCELADA';
  const canManage = (isSindico || isAdmin || canCriticalActions) && isNotFinished;

  const fetchBudgets = async () => {
    setLoading(true);
    const res = await apiFetch(`/api/data/budgets/?service_order_id=${orderId}&ordering=created_at`);
    const json = await res.json();
    setBudgets(json.results ?? json ?? []);
    setLoading(false);
  };

  const fetchProviders = async () => {
    const res = await apiFetch(`/api/data/providers/?condo_id=${condoId}&status=ativo&ordering=trade_name`);
    const json = await res.json();
    const data: any[] = json.results ?? json ?? [];
    setProviders(data.map((p: any) => ({ id: p.id, trade_name: p.trade_name, risk_score: p.risk_score })));
  };

  useEffect(() => { fetchBudgets(); }, [orderId]);
  useEffect(() => { if (condoId) fetchProviders(); }, [condoId]);

  // EQUIPE_INTERNA: skip budgets entirely (after all hooks)
  if (executorType === 'EQUIPE_INTERNA') return null;
  // ALTA priority: 0 budgets needed (emergency), BAIXA: 3 required
  const minBudgets = priority === 'ALTA' ? 0 : 3;

  const handleOpenModal = () => {
    setForm({ provider_id: '', description: '', amount: '', valid_until: '' });
    setModalOpen(true);
  };

  const handleProviderChange = (providerId: string) => {
    setForm(prev => ({
      ...prev,
      provider_id: providerId,
    }));
  };

  const handleAdd = async () => {
    if (!form.description.trim()) {
      toast({ title: 'Descrição do serviço é obrigatória', variant: 'destructive' });
      return;
    }
    if (!form.amount || parseFloat(form.amount) <= 0) {
      toast({ title: 'Informe um valor válido', variant: 'destructive' });
      return;
    }
    if (!form.provider_id) {
      toast({ title: 'Selecione o prestador', variant: 'destructive' });
      return;
    }

    setSaving(true);

    const authUser = await authApi.getUser();
    const authUid = authUser?.id;

    let nfeUserId: string | null = null;
    if (authUid) {
      const uRes = await apiFetch(`/api/data/users/?auth_user_id=${authUid}`);
      const uJson = await uRes.json();
      const uArr = uJson.results ?? uJson;
      const userData = Array.isArray(uArr) ? uArr[0] : null;
      nfeUserId = userData?.id ?? null;
    }

    const insertPayload = {
      service_order_id: orderId,
      condo_id: condoId,
      provider_id: form.provider_id || null,
      description: form.description.trim(),
      total_value: parseFloat(form.amount),
      status: 'pendente',
      valid_until: form.valid_until || null,
      created_by_user_id: nfeUserId,
    };

    const res = await apiFetch('/api/data/budgets/', {
      method: 'POST',
      body: JSON.stringify(insertPayload),
    });

    if (!res.ok) {
      toast({ title: 'Erro ao adicionar orçamento', variant: 'destructive' });
    } else {
      toast({ title: 'Orçamento adicionado com sucesso' });
      setModalOpen(false);
      fetchBudgets();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const res = await apiFetch(`/api/data/budgets/${id}/`, { method: 'DELETE' });
    if (res.ok) fetchBudgets();
  };

  const pendingBudgets = budgets.filter(b => (b.status ?? 'pendente') === 'pendente');

  const handleSubmitForApproval = async () => {
    if (pendingBudgets.length < minBudgets) {
      toast({
        title: `Mínimo de ${minBudgets} orçamento(s) pendente(s) necessário(s)`,
        description: priority === 'ALTA'
          ? 'OS emergencial requer ao menos 1 orçamento.'
          : 'São necessários ao menos 3 orçamentos para enviar para aprovação.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    const configRes = await apiFetch(`/api/data/condos/${condoId}/financial-config/`);
    let deadlineHours = 48;
    if (configRes.ok) {
      const config = await configRes.json();
      deadlineHours = config?.approval_deadline_hours ?? 48;
    }

    const approversRes = await apiFetch(`/api/data/users/?condo_id=${condoId}&role=SUBSINDICO,CONSELHO&status=ativo`);
    const approversJson = await approversRes.json();
    const approvers: any[] = approversJson.results ?? approversJson ?? [];

    if (approvers.length === 0) {
      toast({ title: 'Nenhum aprovador encontrado', description: 'Cadastre Subsíndico ou Conselheiros antes de enviar para aprovação.', variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    const expiresAt = new Date(Date.now() + deadlineHours * 60 * 60 * 1000).toISOString();

    const approvalRecords = approvers.map((a: any) => ({
      service_order_id: orderId,
      condo_id: condoId,
      approver_id: a.user_id,
      approver_role: a.role,
      approval_type: 'ORCAMENTO',
      decision: 'pendente',
      expires_at: expiresAt,
    }));

    // Delete any existing budget approvals before inserting (idempotent re-submission)
    await apiFetch(`/api/data/os-approvals/?service_order_id=${orderId}&approval_type=ORCAMENTO`, {
      method: 'DELETE',
    });

    const insertRes = await apiFetch('/api/data/os-approvals/', {
      method: 'POST',
      body: JSON.stringify(approvalRecords),
    });

    if (!insertRes.ok) {
      const errData = await insertRes.json().catch(() => ({}));
      toast({ title: 'Erro ao enviar para aprovação', description: errData.message ?? errData.detail ?? '', variant: 'destructive' });
    } else {
      // Update service order status to AGUARDANDO_APROVACAO
      await apiFetch(`/api/data/service-orders/${orderId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'AGUARDANDO_APROVACAO' }),
      });
      await logSOActivity({
        serviceOrderId: orderId,
        action: 'ENVIADA_APROVACAO',
        description: 'Orçamentos enviados para aprovação — aguardando Subsíndico e Conselheiros',
      });
      toast({ title: 'Orçamentos enviados para aprovação' });

      // Notificar aprovadores por e-mail (fire-and-forget)
      void sendApprovalEmails('OS_ORCAMENTO', approvers.map((a: any) => a.user_id), {
        title: orderTitle ?? `OS ${orderId.slice(0, 8)}`,
        condo_name: condoName ?? condoId,
      });

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
        <div className="flex gap-2 flex-wrap">
          {canManage && (
            <>
              <Button size="sm" variant="outline" onClick={handleOpenModal}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar Orçamento
              </Button>
              {pendingBudgets.length >= minBudgets && status === 'ABERTA' && (
                <Button size="sm" onClick={handleSubmitForApproval} disabled={submitting}>
                  <Send className="h-4 w-4 mr-1" />
                  {submitting ? 'Enviando...' : 'Enviar p/ Aprovação'}
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
            {canManage && priority !== 'ALTA' && (
              <p className="text-xs text-muted-foreground mt-1">
                Adicione ao menos 3 orçamentos para enviar para aprovação.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {budgets.map((b, i) => {
              const st = statusBadge[b.status ?? 'pendente'] ?? statusBadge.pendente;
              return (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">
                        {i + 1}. {providers.find(p => p.id === b.provider_id)?.trade_name ?? 'Prestador'}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        R$ {b.total_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </Badge>
                      <Badge variant={st.variant} className="text-xs">{st.label}</Badge>
                    </div>
                    {b.description && (
                      <p className="text-xs text-muted-foreground truncate">{b.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {b.valid_until && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Válido até {new Date(b.valid_until).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(b.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Orçamento</DialogTitle>
            <DialogDescription>Informe os dados do orçamento recebido.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Prestador *</Label>
              {providers.length > 0 ? (
                <Select value={form.provider_id} onValueChange={handleProviderChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o prestador" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map(p => {
                      const score = p.risk_score;
                      const riskLabel = score === null ? '' : score >= 80 ? ' 🟢' : score >= 60 ? ' 🟡' : score >= 40 ? ' 🟠' : ' 🔴';
                      return (
                        <SelectItem key={p.id} value={p.id}>{p.trade_name}{riskLabel}</SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum prestador cadastrado.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Descrição do serviço *</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descreva o serviço orçado..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label>Data de validade</Label>
              <Input
                type="date"
                value={form.valid_until}
                onChange={(e) => setForm(prev => ({ ...prev, valid_until: e.target.value }))}
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
