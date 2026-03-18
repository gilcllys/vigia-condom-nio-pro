import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useCondo } from '@/contexts/CondoContext';
import { useFinancialConfig, getRequiredRoles } from '@/hooks/useFinancialConfig';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { FileText, Search, Clock, ClipboardList, FileCheck2 } from 'lucide-react';
import { differenceInHours } from 'date-fns';

type ActiveTab = 'nf' | 'os' | 'contratos';

// ─── NF types ───────────────────────────────────────────────────────────────

interface ApprovalVote {
  approver_role: string;
  decision: string | null;
}

interface PendingDoc {
  id: string;
  number: string | null;
  amount: number | null;
  supplier: string | null;
  created_at: string;
  status: string;
  nextPendingRole: string | null;
  requiredRoles: string[];
}

// ─── OS types ────────────────────────────────────────────────────────────────

interface PendingOS {
  id: string;
  title: string;
  status: string;
  created_at: string;
  is_emergency: boolean;
  priority: string | null;
  pendingVotes: number;
  totalVotes: number;
  myVotePending: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Todos' },
  { value: 'PENDENTE', label: 'Pendentes' },
  { value: 'PROCESSADO', label: 'Aprovadas' },
  { value: 'CANCELADO', label: 'Canceladas' },
];

const ROLE_PRIORITY = ['SUBSINDICO', 'CONSELHO', 'SINDICO'];

function getNextPendingRole(votes: ApprovalVote[]): string | null {
  for (const role of ROLE_PRIORITY) {
    const vote = votes.find((v) => v.approver_role === role);
    if (!vote || !vote.decision || vote.decision === 'pendente') return role;
  }
  return null;
}

function getTierBadgeFromRole(role: string | null): { label: string; className: string } {
  if (role === 'SINDICO') return { label: 'SÍNDICO', className: 'bg-secondary text-secondary-foreground' };
  if (role === 'CONSELHO') return { label: 'CONSELHO', className: 'bg-warning text-warning-foreground' };
  return { label: 'SUBSÍNDICO', className: 'bg-primary text-primary-foreground' };
}

function getDeadlineInfo(createdAt: string, deadlineHours: number | null): { label: string; expired: boolean } {
  if (!deadlineHours) return { label: '—', expired: false };
  const deadline = new Date(new Date(createdAt).getTime() + deadlineHours * 60 * 60 * 1000);
  const hoursLeft = differenceInHours(deadline, new Date());
  if (hoursLeft <= 0) return { label: 'Prazo expirado', expired: true };
  if (hoursLeft < 24) return { label: `${hoursLeft}h restantes`, expired: false };
  const days = Math.ceil(hoursLeft / 24);
  return { label: `${days} dia${days > 1 ? 's' : ''}`, expired: false };
}

function getStatusBadge(status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (status === 'PROCESSADO') return { label: 'Aprovada', variant: 'secondary' };
  if (status === 'CANCELADO') return { label: 'Cancelada', variant: 'destructive' };
  return { label: 'Pendente', variant: 'default' };
}

const priorityLabel: Record<string, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
  URGENTE: 'Urgente',
};

// ─── Main component ──────────────────────────────────────────────────────────

export default function Aprovacoes() {
  const navigate = useNavigate();
  const { condoId } = useCondo();
  const { config } = useFinancialConfig(condoId);
  const deadlineHours = config?.approval_deadline_hours ?? null;

  // NF state
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [loadingNF, setLoadingNF] = useState(true);
  const [filterStatus, setFilterStatus] = useState('PENDENTE');

  // OS state
  const [pendingOS, setPendingOS] = useState<PendingOS[]>([]);
  const [loadingOS, setLoadingOS] = useState(true);

  // Tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>('nf');

  // ── Fetch NFs ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!condoId) { setLoadingNF(false); return; }

    const fetchNFs = async () => {
      setLoadingNF(true);

      let docQuery = supabase
        .from('fiscal_documents')
        .select('id, number, amount, supplier, created_at, status')
        .eq('condo_id', condoId)
        .order('created_at', { ascending: false });

      if (filterStatus !== 'ALL') {
        docQuery = docQuery.eq('status', filterStatus);
      }

      const { data: docData } = await docQuery;

      if (!docData || docData.length === 0) {
        setDocs([]);
        setLoadingNF(false);
        return;
      }

      const docIds = (docData as any[]).map(d => d.id);
      const { data: approvalsData } = await supabase
        .from('fiscal_document_approvals')
        .select('fiscal_document_id, approver_role, decision')
        .in('fiscal_document_id', docIds);

      const approvalsMap = new Map<string, ApprovalVote[]>();
      for (const a of (approvalsData ?? []) as any[]) {
        const list = approvalsMap.get(a.fiscal_document_id) ?? [];
        list.push({ approver_role: a.approver_role, decision: a.decision });
        approvalsMap.set(a.fiscal_document_id, list);
      }

      const mapped = (docData as any[]).map(d => {
        const votes: ApprovalVote[] = approvalsMap.get(d.id) ?? [];
        const nextPendingRole = getNextPendingRole(votes);
        return {
          id: d.id,
          number: d.number,
          amount: d.amount,
          supplier: d.supplier,
          created_at: d.created_at,
          status: d.status,
          nextPendingRole,
          requiredRoles: getRequiredRoles(d.amount ?? 0, config),
        };
      });

      if (filterStatus === 'PENDENTE') {
        setDocs(mapped.filter(d => d.nextPendingRole !== null));
      } else {
        setDocs(mapped);
      }
      setLoadingNF(false);
    };

    fetchNFs();
  }, [condoId, config, filterStatus]);

  // ── Fetch OS Orçamentos ────────────────────────────────────────────────────

  useEffect(() => {
    if (!condoId) { setLoadingOS(false); return; }

    const fetchOS = async () => {
      setLoadingOS(true);

      // Fetch current internal user id for "my vote" detection
      const { data: { user: authUser } } = await supabase.auth.getUser();
      let internalUserId: string | null = null;
      if (authUser) {
        const { data: userRow } = await supabase
          .schema('nfe_vigia')
          .from('users')
          .select('id')
          .eq('auth_user_id', authUser.id)
          .maybeSingle();
        internalUserId = userRow?.id ?? null;
      }

      const { data: orders } = await supabase
        .schema('nfe_vigia')
        .from('service_orders')
        .select('id, title, status, created_at, is_emergency, priority')
        .eq('condo_id', condoId)
        .eq('status', 'AGUARDANDO_APROVACAO')
        .order('created_at', { ascending: false });

      if (!orders || orders.length === 0) {
        setPendingOS([]);
        setLoadingOS(false);
        return;
      }

      const orderIds = (orders as any[]).map(o => o.id);
      const { data: approvalsData } = await supabase
        .schema('nfe_vigia')
        .from('approvals')
        .select('service_order_id, approver_id, decision')
        .in('service_order_id', orderIds)
        .eq('approval_type', 'ORCAMENTO');

      const approvalsMap = new Map<string, { total: number; pending: number; myPending: boolean }>();
      for (const a of (approvalsData ?? []) as any[]) {
        const current = approvalsMap.get(a.service_order_id) ?? { total: 0, pending: 0, myPending: false };
        current.total++;
        if (a.decision === 'pendente') {
          current.pending++;
          if (internalUserId && a.approver_id === internalUserId) current.myPending = true;
        }
        approvalsMap.set(a.service_order_id, current);
      }

      const mapped: PendingOS[] = (orders as any[]).map(o => {
        const ap = approvalsMap.get(o.id) ?? { total: 0, pending: 0, myPending: false };
        return {
          id: o.id,
          title: o.title,
          status: o.status,
          created_at: o.created_at,
          is_emergency: o.is_emergency,
          priority: o.priority,
          pendingVotes: ap.pending,
          totalVotes: ap.total,
          myVotePending: ap.myPending,
        };
      });

      setPendingOS(mapped);
      setLoadingOS(false);
    };

    fetchOS();
  }, [condoId]);

  // ── Render ────────────────────────────────────────────────────────────────

  const TAB_ITEMS: { value: ActiveTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { value: 'nf', label: 'Notas Fiscais', icon: <FileText className="h-4 w-4" /> },
    { value: 'os', label: 'Orçamentos de OS', icon: <ClipboardList className="h-4 w-4" />, badge: pendingOS.length > 0 ? pendingOS.length : undefined },
    { value: 'contratos', label: 'Contratos', icon: <FileCheck2 className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Aprovações</h1>

      {/* Tab bar */}
      <div className="inline-flex h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground gap-0.5">
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              'inline-flex items-center gap-2 whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-all',
              activeTab === tab.value
                ? 'bg-background text-foreground shadow-sm'
                : 'hover:bg-background/50 hover:text-foreground'
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && (
              <Badge variant="default" className="ml-1 text-xs px-1.5 py-0">{tab.badge}</Badge>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: NFs ─────────────────────────────────────────────────────── */}
      {activeTab === 'nf' && (
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <p className="text-sm text-muted-foreground">Aprovações de Notas Fiscais do almoxarifado</p>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrar status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="glass-card">
            <div className="grid grid-cols-7 gap-4 px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-border/50">
              <span>Documento</span>
              <span>Fornecedor</span>
              <span>Valor</span>
              <span>Alçada</span>
              <span>Prazo</span>
              <span>Status</span>
              <span className="text-right">Ações</span>
            </div>

            {loadingNF ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">Carregando...</div>
            ) : docs.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">Nenhuma NF encontrada para este filtro.</div>
            ) : (
              docs.map((doc) => {
                const tier = getTierBadgeFromRole(doc.nextPendingRole);
                const deadline = getDeadlineInfo(doc.created_at, deadlineHours);
                return (
                  <div key={doc.id} className="grid grid-cols-7 gap-4 px-5 py-4 items-center border-b border-border/30 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">NF #{doc.number ?? '—'}</span>
                    </div>
                    <span className="text-sm text-foreground truncate">{doc.supplier ?? '—'}</span>
                    <span className="text-sm text-foreground">
                      {doc.amount != null ? `R$ ${doc.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                    </span>
                    <Badge className={`${tier.className} text-xs w-fit`}>{tier.label}</Badge>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span className={deadline.expired ? 'text-destructive font-medium' : ''}>{deadline.label}</span>
                    </div>
                    <Badge variant={getStatusBadge(doc.status).variant} className="text-xs w-fit">
                      {getStatusBadge(doc.status).label}
                    </Badge>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-primary/30 text-primary hover:bg-primary/10 gap-1"
                        onClick={() => navigate(`/aprovacoes/${doc.id}`)}
                      >
                        <Search className="h-3 w-3" />
                        Analisar
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
      )}

      {/* ── Tab: OS Orçamentos ───────────────────────────────────────────── */}
      {activeTab === 'os' && (
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">Ordens de Serviço aguardando aprovação de orçamentos</p>
          </div>

          <div className="glass-card">
            <div className="grid grid-cols-6 gap-4 px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-border/50">
              <span className="col-span-2">Ordem de Serviço</span>
              <span>Prioridade</span>
              <span>Votos pendentes</span>
              <span>Meu voto</span>
              <span className="text-right">Ações</span>
            </div>

            {loadingOS ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">Carregando...</div>
            ) : pendingOS.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                Nenhuma OS aguardando aprovação de orçamentos.
              </div>
            ) : (
              pendingOS.map((os) => (
                <div key={os.id} className="grid grid-cols-6 gap-4 px-5 py-4 items-center border-b border-border/30 hover:bg-muted/30 transition-colors">
                  <div className="col-span-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <Clipboard className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground truncate">{os.title}</span>
                      {os.is_emergency && (
                        <Badge variant="destructive" className="text-xs">Emergencial</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground pl-6">OS #{os.id.slice(0, 8)}</p>
                  </div>
                  <span className="text-sm text-foreground">
                    {os.priority ? (priorityLabel[os.priority] ?? os.priority) : '—'}
                  </span>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{os.pendingVotes}/{os.totalVotes}</span>
                  </div>
                  <div>
                    {os.totalVotes === 0 ? (
                      <Badge variant="outline" className="text-xs">Sem aprovadores</Badge>
                    ) : os.myVotePending ? (
                      <Badge className="bg-primary text-primary-foreground text-xs">Aguardando seu voto</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Já votado</Badge>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-primary/30 text-primary hover:bg-primary/10 gap-1"
                      onClick={() => navigate(`/ordens-servico/${os.id}`)}
                    >
                      <Search className="h-3 w-3" />
                      Ver OS
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
      )}

      {/* ── Tab: Contratos ───────────────────────────────────────────────── */}
      {activeTab === 'contratos' && (
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">Contratos aguardando aprovação</p>
          </div>
          <div className="glass-card px-5 py-12 text-center text-sm text-muted-foreground">
            Aprovação de contratos será disponibilizada em breve.
          </div>
      )}
    </div>
  );
}
