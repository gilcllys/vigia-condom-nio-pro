import { useEffect, useState } from 'react';
import { FileText, ChevronRight, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { useCondo } from '@/contexts/CondoContext';
import { useFinancialConfig, getRequiredRoles } from '@/hooks/useFinancialConfig';
import { differenceInHours } from 'date-fns';

interface PendingDoc {
  id: string;
  number: string | null;
  amount: number | null;
  created_at: string;
  requiredRoles: string[];
  tierLabel: string;
}

function getTierBadge(roles: string[]): { label: string; className: string } {
  if (roles.includes('SINDICO')) return { label: 'SÍNDICO', className: 'bg-secondary text-secondary-foreground' };
  if (roles.includes('CONSELHO')) return { label: 'CONSELHO', className: 'bg-warning text-warning-foreground' };
  return { label: 'SUBSÍNDICO', className: 'bg-primary text-primary-foreground' };
}

function getDeadlineLabel(createdAt: string, deadlineHours: number | null): string {
  if (!deadlineHours) return '—';
  const deadline = new Date(new Date(createdAt).getTime() + deadlineHours * 60 * 60 * 1000);
  const hoursLeft = differenceInHours(deadline, new Date());
  if (hoursLeft <= 0) return 'Prazo expirado';
  if (hoursLeft < 24) return `${hoursLeft}h restantes`;
  const days = Math.ceil(hoursLeft / 24);
  return `${days} dia${days > 1 ? 's' : ''} restante${days > 1 ? 's' : ''}`;
}

export function DashboardApprovals() {
  const navigate = useNavigate();
  const { condoId } = useCondo();
  const { config } = useFinancialConfig(condoId);
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!condoId) { setLoading(false); return; }

    const fetchPending = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/data/fiscal-documents/?condo_id=${condoId}&status=PENDENTE&ordering=-created_at&limit=5`);
        const data = await res.json();
        const rows = Array.isArray(data) ? data : data?.results ?? [];

        setDocs(rows.map((d: any) => {
          const roles = getRequiredRoles(d.amount ?? 0, config);
          return {
            id: d.id,
            number: d.number,
            amount: d.amount,
            created_at: d.created_at,
            requiredRoles: roles,
            tierLabel: getTierBadge(roles).label,
          };
        }));
      } catch {
        setDocs([]);
      }
      setLoading(false);
    };

    fetchPending();
  }, [condoId, config]);

  const deadlineHours = config?.approval_deadline_hours ?? null;

  return (
    <div className="glass-card">
      <div className="flex items-center justify-between p-5 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">Aprovações Pendentes</h2>
        </div>
        <button onClick={() => navigate('/aprovacoes')} className="text-muted-foreground hover:text-primary transition-colors">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-5 gap-4 px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-border/50">
        <span>Documento</span>
        <span>Valor</span>
        <span>Alçada</span>
        <span>Prazo</span>
        <span className="text-right">Ações</span>
      </div>

      {loading ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">Carregando...</div>
      ) : docs.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhuma aprovação pendente.</div>
      ) : (
        docs.map((doc) => {
          const tier = getTierBadge(doc.requiredRoles);
          return (
            <div key={doc.id} className="grid grid-cols-5 gap-4 px-5 py-4 items-center border-b border-border/30 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">NF #{doc.number ?? '—'}</span>
              </div>
              <span className="text-sm text-foreground">
                {doc.amount != null ? `R$ ${doc.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
              </span>
              <Badge className={`${tier.className} text-xs w-fit`}>{tier.label}</Badge>
              <span className="text-sm text-muted-foreground">{getDeadlineLabel(doc.created_at, deadlineHours)}</span>
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
  );
}
