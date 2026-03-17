import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useCondo } from '@/contexts/CondoContext';
import { useFinancialConfig, getRequiredRoles } from '@/hooks/useFinancialConfig';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Search, Clock } from 'lucide-react';
import { differenceInHours } from 'date-fns';

interface PendingDoc {
  id: string;
  number: string | null;
  amount: number | null;
  supplier: string | null;
  created_at: string;
  requiredRoles: string[];
}

function getTierBadge(roles: string[]): { label: string; className: string } {
  if (roles.includes('SINDICO')) return { label: 'SÍNDICO', className: 'bg-secondary text-secondary-foreground' };
  if (roles.includes('CONSELHO')) return { label: 'CONSELHO', className: 'bg-warning text-warning-foreground' };
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

export default function Aprovacoes() {
  const navigate = useNavigate();
  const { condoId } = useCondo();
  const { config } = useFinancialConfig(condoId);
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!condoId) { setLoading(false); return; }

    const fetchPending = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('fiscal_documents')
        .select('id, number, amount, supplier, created_at')
        .eq('condo_id', condoId)
        .eq('status', 'PENDENTE')
        .order('created_at', { ascending: false });

      if (data) {
        setDocs(data.map((d: any) => ({
          ...d,
          requiredRoles: getRequiredRoles(d.amount ?? 0, config),
        })));
      }
      setLoading(false);
    };

    fetchPending();
  }, [condoId, config]);

  const deadlineHours = config?.approval_deadline_hours ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Aprovações Pendentes</h1>
      </div>

      <div className="glass-card">
        {/* Table header */}
        <div className="grid grid-cols-6 gap-4 px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-border/50">
          <span>Documento</span>
          <span>Fornecedor</span>
          <span>Valor</span>
          <span>Alçada</span>
          <span>Prazo</span>
          <span className="text-right">Ações</span>
        </div>

        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : docs.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">Nenhuma aprovação pendente.</div>
        ) : (
          docs.map((doc) => {
            const tier = getTierBadge(doc.requiredRoles);
            const deadline = getDeadlineInfo(doc.created_at, deadlineHours);
            return (
              <div key={doc.id} className="grid grid-cols-6 gap-4 px-5 py-4 items-center border-b border-border/30 hover:bg-muted/30 transition-colors">
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
    </div>
  );
}
