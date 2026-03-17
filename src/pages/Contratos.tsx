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
import { supabase } from '@/lib/supabase';
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
  const { condoId, role } = useCondo();
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

    let query = supabase
      .from('contracts')
      .select('*')
      .eq('condo_id', condoId)
      .order('created_at', { ascending: false });

    if (filterStatus !== 'ALL') query = query.eq('status', filterStatus);
    if (filterType !== 'ALL') query = query.eq('contract_type', filterType);

    const [contractsRes, providersRes] = await Promise.all([
      query,
      supabase.from('providers').select('id, trade_name').eq('condo_id', condoId),
    ]);

    const provs = ((providersRes.data ?? []) as any[]).map(p => ({ id: p.id, name: p.trade_name || p.name || '—' })) as Provider[];
    setProviders(provs);
    const provMap = new Map(provs.map(p => [p.id, p.name]));

    setContracts(
      ((contractsRes.data ?? []) as any[]).map(c => ({
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
    const { error } = await supabase.from('contracts').insert({
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
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Erro ao criar contrato', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Contrato criado com sucesso' });
      setNewOpen(false);
      setForm({ title: '', description: '', contract_type: 'SERVICO', value: '', start_date: '', end_date: '', provider_id: '' });
      fetchContracts();
    }
  };

  const handleSendForApproval = async (contract: Contract) => {
    if (!condoId) return;
    setSendingApproval(contract.id);

    const { data: existingApprovals } = await supabase
      .from('fiscal_document_approvals')
      .select('id')
      .eq('fiscal_document_id', contract.id)
      .limit(1);

    if ((existingApprovals?.length ?? 0) > 0) {
      toast({ title: 'Contrato já foi enviado para aprovação' });
      setSendingApproval(null);
      return;
    }

    // Get approvers (SUBSINDICO + CONSELHO)
    const { data: approvers } = await supabase
      .from('user_condos')
      .select('user_id, role')
      .eq('condo_id', condoId)
      .in('role', ['SUBSINDICO', 'CONSELHO'])
      .eq('status', 'ativo');

    if (!approvers || approvers.length === 0) {
      toast({ title: 'Nenhum aprovador encontrado', description: 'Cadastre um Subsíndico ou Conselheiro antes.', variant: 'destructive' });
      setSendingApproval(null);
      return;
    }

    // Update contract status
    const { error: updateError } = await supabase
      .from('contracts')
      .update({ status: 'AGUARDANDO_APROVACAO' })
      .eq('id', contract.id);

    if (updateError) {
      toast({ title: 'Erro ao enviar para aprovação', description: updateError.message, variant: 'destructive' });
      setSendingApproval(null);
      return;
    }

    // Create approval records in fiscal_document_approvals (reusing same table/flow)
    const records = approvers.map((a: any) => ({
      fiscal_document_id: contract.id,
      condo_id: condoId,
      approver_user_id: a.user_id,
      approver_role: a.role,
      decision: 'pendente',
      voted_at: null,
    }));

    const { error: approvalError } = await supabase
      .from('fiscal_document_approvals')
      .insert(records);

    if (approvalError) {
      // Revert status if approval records fail
      await supabase.from('contracts').update({ status: 'RASCUNHO' }).eq('id', contract.id);
      toast({ title: 'Erro ao criar registros de aprovação', description: approvalError.message, variant: 'destructive' });
    } else {
      toast({ title: 'Contrato enviado para aprovação' });
      fetchContracts();
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
