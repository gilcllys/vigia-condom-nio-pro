import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
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
import { DollarSign, Plus, Send, Trash2, FileText, Calendar } from 'lucide-react';

interface Budget {
  id: string;
  provider_name: string;
  description: string | null;
  total_value: number;
  file_url: string | null;
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
  condoId: string;
  isEmergency: boolean;
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

export function OSBudgetsCard({ orderId, condoId, isEmergency, isSindico, isAdmin = false, canCriticalActions, status, onSubmittedForApproval }: Props) {
  const { toast } = useToast();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    provider_id: '',
    provider_name: '',
    description: '',
    amount: '',
    valid_until: '',
  });
  const [file, setFile] = useState<File | null>(null);

  const isNotFinished = status !== 'FINALIZADA' && status !== 'CANCELADA';
  const canManage = (isSindico || isAdmin || canCriticalActions) && isNotFinished;
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

  const fetchProviders = async () => {
    const { data } = await supabase
      .schema('nfe_vigia')
      .from('providers')
      .select('id, trade_name, risk_score')
      .eq('condo_id', condoId)
      .eq('status', 'ativo')
      .order('trade_name');
    setProviders(data ?? []);
  };

  useEffect(() => { fetchBudgets(); }, [orderId]);
  useEffect(() => { if (condoId) fetchProviders(); }, [condoId]);

  const handleOpenModal = () => {
    setForm({ provider_id: '', provider_name: '', description: '', amount: '', valid_until: '' });
    setFile(null);
    setModalOpen(true);
  };

  const handleProviderChange = (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    setForm(prev => ({
      ...prev,
      provider_id: providerId,
      provider_name: provider?.trade_name ?? '',
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
    if (!form.provider_id && !form.provider_name.trim()) {
      toast({ title: 'Selecione ou informe o prestador', variant: 'destructive' });
      return;
    }

    setSaving(true);

    const providerName = form.provider_name.trim() || providers.find(p => p.id === form.provider_id)?.trade_name || '';

    const { data: { user } } = await supabase.auth.getUser();

    const insertPayload = {
      service_order_id: orderId,
      condo_id: condoId,
      provider_name: providerName,
      description: form.description.trim(),
      total_value: parseFloat(form.amount),
      status: 'pendente',
      valid_until: form.valid_until || null,
      created_by_user_id: user?.id ?? null,
    };
    console.log('[OSBudgetsCard] Insert payload:', JSON.stringify(insertPayload, null, 2));

    const { error } = await supabase.schema('nfe_vigia').from('budgets').insert(insertPayload);

    if (error) {
      console.error('[OSBudgetsCard] Insert error:', JSON.stringify(error, null, 2));
      toast({ title: 'Erro ao adicionar orçamento', variant: 'destructive' });
    } else {
      toast({ title: 'Orçamento adicionado com sucesso' });
      setModalOpen(false);
      fetchBudgets();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.schema('nfe_vigia').from('budgets').delete().eq('id', id);
    if (!error) fetchBudgets();
  };

  const pendingBudgets = budgets.filter(b => (b.status ?? 'pendente') === 'pendente');

  const handleSubmitForApproval = async () => {
    if (pendingBudgets.length < minBudgets) {
      toast({
        title: `Mínimo de ${minBudgets} orçamento(s) pendente(s) necessário(s)`,
        description: isEmergency
          ? 'OS emergencial requer ao menos 1 orçamento.'
          : 'São necessários ao menos 3 orçamentos para enviar para aprovação.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    const { data: config } = await supabase
      .schema('nfe_vigia')
      .from('condo_financial_config')
      .select('approval_deadline_hours')
      .eq('condo_id', condoId)
      .maybeSingle();

    const deadlineHours = config?.approval_deadline_hours ?? 48;

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

    const approvalRecords = approvers.map((a: any) => ({
      service_order_id: orderId,
      condo_id: condoId,
      approver_id: a.user_id,
      approver_role: a.role,
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
        <div className="flex gap-2 flex-wrap">
          {canManage && (
            <>
              <Button size="sm" variant="outline" onClick={handleOpenModal}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar Orçamento
              </Button>
              {pendingBudgets.length >= minBudgets && (
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
            {canManage && !isEmergency && (
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
                        {i + 1}. {b.provider_name}
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
                      {b.file_url && (
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          Arquivo anexo
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
                <Input
                  value={form.provider_name}
                  onChange={(e) => setForm(prev => ({ ...prev, provider_name: e.target.value }))}
                  placeholder="Nome do prestador"
                />
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
              <Label>Arquivo (PDF ou imagem)</Label>
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
