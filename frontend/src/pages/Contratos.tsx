import { useEffect, useState } from 'react';
import { Plus, FileSignature, AlertTriangle, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api';
import { sendApprovalEmails } from '@/lib/send-approval-email';
import { useCondo } from '@/contexts/CondoContext';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { differenceInDays, format } from 'date-fns';

interface Contract {
  id: string;
  title: string;
  description: string | null;
  contract_type: string;
  value: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  file_url: string | null;
  provider_id: string | null;
  created_at: string;
  provider_name?: string;
}

interface Provider {
  id: string;
  name: string;
}

const CONTRACT_TYPES = [
  { value: 'SERVICO', label: 'Serviço' },
  { value: 'MANUTENCAO', label: 'Manutenção' },
  { value: 'LIMPEZA', label: 'Limpeza' },
  { value: 'SEGURANCA', label: 'Segurança' },
  { value: 'OUTROS', label: 'Outros' },
];

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Todos' },
  { value: 'RASCUNHO', label: 'Rascunho' },
  { value: 'AGUARDANDO_APROVACAO', label: 'Aguardando Aprovação' },
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'ENCERRADO', label: 'Encerrado' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

function getStatusBadge(status: string) {
  switch (status) {
    case 'RASCUNHO': return { label: 'Rascunho', className: 'bg-muted text-muted-foreground' };
    case 'AGUARDANDO_APROVACAO': return { label: 'Aguardando', className: 'bg-warning text-warning-foreground' };
    case 'ATIVO': return { label: 'Ativo', className: 'bg-emerald-500/20 text-emerald-400' };
    case 'ENCERRADO': return { label: 'Encerrado', className: 'bg-muted text-muted-foreground' };
    case 'CANCELADO': return { label: 'Cancelado', className: 'bg-destructive/20 text-destructive' };
    default: return { label: status, className: 'bg-muted text-muted-foreground' };
  }
}

function getExpiryBadge(endDate: string | null) {
  if (!endDate) return null;
  const days = differenceInDays(new Date(endDate), new Date());
  if (days < 0) return { label: 'Vencido', className: 'bg-destructive text-destructive-foreground' };
  if (days < 30) return { label: `${days}d`, className: 'bg-destructive text-destructive-foreground' };
  if (days < 60) return { label: `${days}d`, className: 'bg-warning text-warning-foreground' };
  return null;
}

function getTypeBadge(type: string) {
  const found = CONTRACT_TYPES.find(t => t.value === type);
  return found?.label ?? type;
}

export default function Contratos() {
  const { condoId, condoName, role } = useCondo();
  const { user } = useAuth();
  const { toast } = useToast();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [newOpen, setNewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingApproval, setSendingApproval] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    title: '',
    description: '',
    contract_type: 'SERVICO',
    value: '',
    start_date: '',
    end_date: '',
    provider_id: '',
  });

  const canCreate = role === 'SINDICO' || role === 'ADMIN';
  const isSindico = role === 'SINDICO' || role === 'ADMIN';

  const fetchContracts = async () => {
    if (!condoId) return;
    setLoading(true);

    const params = new URLSearchParams({ condo_id: condoId, ordering: '-created_at' });
    if (filterStatus !== 'ALL') params.append('status', filterStatus);
    if (filterType !== 'ALL') params.append('contract_type', filterType);

    const [contractsRes, providersRes] = await Promise.all([
      apiFetch(`/api/data/contracts/?${params}`),
      apiFetch(`/api/data/providers/?condo_id=${condoId}`),
    ]);

    const contractsData = contractsRes.ok ? await contractsRes.json() : [];
    const providersData = providersRes.ok ? await providersRes.json() : [];

    const contractsList = Array.isArray(contractsData) ? contractsData : contractsData.results ?? [];
    const providersList = Array.isArray(providersData) ? providersData : providersData.results ?? [];

    const provs = (providersList as any[]).map(p => ({ id: p.id, name: p.trade_name || p.name || '—' })) as Provider[];
    setProviders(provs);
    const provMap = new Map(provs.map(p => [p.id, p.name]));

    setContracts(
      (contractsList as any[]).map(c => ({
        ...c,
        provider_name: c.provider_id ? provMap.get(c.provider_id) ?? '—' : '—',
      }))
    );
    setLoading(false);
  };

  useEffect(() => { fetchContracts(); }, [condoId, filterStatus, filterType]);

  const handleCreate = async () => {
    if (!form.title.trim()) {
      toast({ title: 'Título obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/data/contracts/', {
        method: 'POST',
        body: JSON.stringify({
          condo_id: condoId,
          title: form.title.trim(),
          description: form.description.trim() || null,
          contract_type: form.contract_type,
          value: form.value ? parseFloat(form.value) : null,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          provider_id: form.provider_id || null,
          status: 'RASCUNHO',
          created_by: user?.id,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || 'Erro ao criar contrato');
      }
      toast({ title: 'Contrato criado com sucesso' });
      setNewOpen(false);
      setForm({ title: '', description: '', contract_type: 'SERVICO', value: '', start_date: '', end_date: '', provider_id: '' });
      fetchContracts();
    } catch (err: any) {
      toast({ title: 'Erro ao criar contrato', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleSendForApproval = async (contract: Contract) => {
    if (!condoId) return;
    setSendingApproval(contract.id);

    try {
      // Check for existing approvals
      const existingRes = await apiFetch(`/api/data/approvals/?fiscal_document_id=${contract.id}&limit=1`);
      const existingData = existingRes.ok ? await existingRes.json() : [];
      const existingList = Array.isArray(existingData) ? existingData : existingData.results ?? [];

      if (existingList.length > 0) {
        toast({ title: 'Contrato já foi enviado para aprovação' });
        setSendingApproval(null);
        return;
      }

      // Get approvers (SUBSINDICO + CONSELHO)
      const approversRes = await apiFetch(`/api/data/user-condos/?condo_id=${condoId}&role=SUBSINDICO,CONSELHO&status=ativo`);
      const approversData = approversRes.ok ? await approversRes.json() : [];
      const approvers = Array.isArray(approversData) ? approversData : approversData.results ?? [];

      if (approvers.length === 0) {
        toast({ title: 'Nenhum aprovador encontrado', description: 'Cadastre um Subsíndico ou Conselheiro antes.', variant: 'destructive' });
        setSendingApproval(null);
        return;
      }

      // Update contract status
      const updateRes = await apiFetch(`/api/data/contracts/${contract.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'AGUARDANDO_APROVACAO' }),
      });

      if (!updateRes.ok) {
        const errData = await updateRes.json().catch(() => ({}));
        throw new Error(errData.detail || 'Erro ao enviar para aprovação');
      }

      // Create approval records
      const records = approvers.map((a: any) => ({
        fiscal_document_id: contract.id,
        condo_id: condoId,
        approver_user_id: a.user_id,
        approver_role: a.role,
      }));

      const approvalRes = await apiFetch('/api/data/approvals/bulk/', {
        method: 'POST',
        body: JSON.stringify(records),
      });

      if (!approvalRes.ok) {
        // Revert status if approval records fail
        await apiFetch(`/api/data/contracts/${contract.id}/`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'RASCUNHO' }),
        });
        const errData = await approvalRes.json().catch(() => ({}));
        throw new Error(errData.detail || 'Erro ao criar registros de aprovação');
      }

      toast({ title: 'Contrato enviado para aprovação' });

      // Notificar aprovadores por e-mail (fire-and-forget)
      void sendApprovalEmails('CONTRATO', records.map((r: any) => r.approver_user_id), {
        title: contract.title,
        amount: contract.value ?? undefined,
        condo_name: condoName ?? condoId ?? '',
      });

      fetchContracts();
    } catch (err: any) {
      toast({ title: err.message || 'Erro ao enviar para aprovação', variant: 'destructive' });
    }

    setSendingApproval(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contratos</h1>
          <p className="text-sm text-muted-foreground">Gestão de contratos com prestadores</p>
        </div>
        {canCreate && (
          <Button onClick={() => setNewOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Contrato
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os tipos</SelectItem>
            {CONTRACT_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Prestador</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Vigência</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vencimento</TableHead>
              {isSindico && <TableHead>Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : contracts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  <FileSignature className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  Nenhum contrato encontrado.
                </TableCell>
              </TableRow>
            ) : (
              contracts.map(c => {
                const statusBadge = getStatusBadge(c.status);
                const expiryBadge = c.status === 'ATIVO' ? getExpiryBadge(c.end_date) : null;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-foreground">{c.title}</TableCell>
                    <TableCell className="text-muted-foreground">{c.provider_name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{getTypeBadge(c.contract_type)}</Badge></TableCell>
                    <TableCell className="text-foreground">
                      {c.value != null ? `R$ ${c.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {c.start_date ? format(new Date(c.start_date), 'dd/MM/yy') : '—'}
                      {' → '}
                      {c.end_date ? format(new Date(c.end_date), 'dd/MM/yy') : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${statusBadge.className} text-[10px]`}>{statusBadge.label}</Badge>
                    </TableCell>
                    <TableCell>
                      {expiryBadge ? (
                        <Badge className={`${expiryBadge.className} text-[10px] gap-1`}>
                          <AlertTriangle className="h-3 w-3" />
                          {expiryBadge.label}
                        </Badge>
                      ) : '—'}
                    </TableCell>
                    {isSindico && (
                      <TableCell>
                        {c.status === 'RASCUNHO' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-xs"
                            onClick={() => handleSendForApproval(c)}
                            disabled={sendingApproval === c.id}
                          >
                            <Send className="h-3 w-3" />
                            {sendingApproval === c.id ? 'Enviando...' : 'Enviar p/ Aprovação'}
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* New contract dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Contrato</DialogTitle>
            <DialogDescription>Preencha os dados do contrato</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Contrato de manutenção predial" />
            </div>
            <div>
              <Label>Prestador</Label>
              <Select value={form.provider_id} onValueChange={v => setForm(f => ({ ...f, provider_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar prestador" /></SelectTrigger>
                <SelectContent>
                  {providers.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo</Label>
                <Select value={form.contract_type} onValueChange={v => setForm(f => ({ ...f, contract_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTRACT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor (R$)</Label>
                <Input type="number" step="0.01" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0,00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Início</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div>
                <Label>Término</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Detalhes do contrato..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Salvando...' : 'Criar Contrato'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
