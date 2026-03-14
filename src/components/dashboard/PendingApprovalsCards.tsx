import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCondo } from '@/contexts/CondoContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DollarSign, FileText, CheckCircle2, Gavel, Clock, ArrowRight } from 'lucide-react';
import { differenceInHours } from 'date-fns';

interface PendingCount {
  type: string;
  count: number;
  minExpiry: string | null;
}

export function PendingApprovalsCards() {
  const { user } = useAuth();
  const { condoId, role } = useCondo();
  const navigate = useNavigate();
  const [pendingBudgets, setPendingBudgets] = useState<PendingCount>({ type: 'budgets', count: 0, minExpiry: null });
  const [pendingNFs, setPendingNFs] = useState<PendingCount>({ type: 'nfs', count: 0, minExpiry: null });
  const [pendingFinal, setPendingFinal] = useState<PendingCount>({ type: 'final', count: 0, minExpiry: null });
  const [minervaCount, setMinervaCount] = useState(0);
  const [internalUserId, setInternalUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [pendingNFDocs, setPendingNFDocs] = useState(0);
  const isSindico = role === 'SINDICO' || role === 'ADMIN';
  const isApprover = role === 'SUBSINDICO' || role === 'CONSELHO';
  const showCards = isSindico || isApprover;

  useEffect(() => {
    if (!user) return;
    supabase.schema('nfe_vigia').from('users').select('id').eq('auth_user_id', user.id).maybeSingle()
      .then(({ data }) => setInternalUserId(data?.id ?? null));
  }, [user]);

  useEffect(() => {
    if (!condoId || !internalUserId || !showCards) {
      setLoading(false);
      return;
    }

    const fetchPending = async () => {
      setLoading(true);

      if (isApprover) {
        // Approver sees their own pending approvals
        const { data: myApprovals } = await supabase
          .schema('nfe_vigia')
          .from('approvals')
          .select('id, approver_role, expires_at')
          .eq('condo_id', condoId)
          .eq('approver_id', internalUserId)
          .eq('decision', 'pendente');

        const totalCount = myApprovals?.length ?? 0;
        const minExp = myApprovals?.reduce((min: string | null, a: any) => {
          if (!min || a.expires_at < min) return a.expires_at;
          return min;
        }, null as string | null) ?? null;

        setPendingBudgets({ type: 'budgets', count: totalCount, minExpiry: minExp });
        setPendingNFs({ type: 'nfs', count: 0, minExpiry: null });
        setPendingFinal({ type: 'final', count: 0, minExpiry: null });
      }

      // Fetch pending fiscal_documents for approvers
      if (isApprover || isSindico) {
        const { count } = await supabase
          .schema('nfe_vigia')
          .from('fiscal_documents')
          .select('*', { count: 'exact', head: true })
          .eq('condo_id', condoId)
          .eq('status', 'PENDENTE');
        setPendingNFDocs(count ?? 0);
      }

      if (isSindico) {
        // Síndico sees minerva votes needed
        const { data: minerva } = await supabase
          .schema('nfe_vigia')
          .from('approvals')
          .select('id')
          .eq('condo_id', condoId)
          .eq('is_minerva', true)
          .is('minerva_justification', null);

        setMinervaCount(minerva?.length ?? 0);

        const { data: myApprovals } = await supabase
          .schema('nfe_vigia')
          .from('approvals')
          .select('id, approver_role, expires_at')
          .eq('condo_id', condoId)
          .eq('approver_id', internalUserId)
          .eq('decision', 'pendente');

        const totalCount = myApprovals?.length ?? 0;
        const minExp = myApprovals?.reduce((min: string | null, a: any) => {
          if (!min || a.expires_at < min) return a.expires_at;
          return min;
        }, null as string | null) ?? null;

        setPendingBudgets({ type: 'budgets', count: totalCount, minExpiry: minExp });
        setPendingNFs({ type: 'nfs', count: 0, minExpiry: null });
        setPendingFinal({ type: 'final', count: 0, minExpiry: null });
      }

      setLoading(false);
    };

    fetchPending();
  }, [condoId, internalUserId, showCards]);

  if (!showCards || loading) return null;

  const hasAnyPending = pendingBudgets.count > 0 || pendingNFs.count > 0 || pendingFinal.count > 0 || minervaCount > 0 || pendingNFDocs > 0;
  if (!hasAnyPending) return null;

  const expiryLabel = (expiry: string | null) => {
    if (!expiry) return null;
    const hours = differenceInHours(new Date(expiry), new Date());
    if (hours <= 0) return 'Expirado';
    return `Expira em ${hours}h`;
  };

  const cards = [
    { show: pendingBudgets.count > 0, icon: DollarSign, label: 'Orçamentos aguardando aprovação', count: pendingBudgets.count, expiry: pendingBudgets.minExpiry },
    { show: pendingNFs.count > 0, icon: FileText, label: 'NFs aguardando aprovação', count: pendingNFs.count, expiry: pendingNFs.minExpiry },
    { show: pendingFinal.count > 0, icon: CheckCircle2, label: 'OS aguardando aprovação final', count: pendingFinal.count, expiry: pendingFinal.minExpiry },
    { show: isSindico && minervaCount > 0, icon: Gavel, label: 'Votos de minerva pendentes', count: minervaCount, expiry: null },
  ].filter(c => c.show);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ icon: Icon, label, count, expiry }, i) => (
        <Card key={i} className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/ordens-servico')}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            <div className="rounded-md bg-amber-100 dark:bg-amber-900 p-2">
              <Icon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-foreground">{count}</p>
            {expiry && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Clock className="h-3 w-3" /> {expiryLabel(expiry)}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
