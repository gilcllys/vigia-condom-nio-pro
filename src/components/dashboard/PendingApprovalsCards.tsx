import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCondo } from '@/contexts/CondoContext';
import { useFinancialConfig, getRequiredRoles } from '@/hooks/useFinancialConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DollarSign, FileText, CheckCircle2, Gavel, Clock, ArrowRight } from 'lucide-react';
import { differenceInHours } from 'date-fns';

export function PendingApprovalsCards() {
  const { user } = useAuth();
  const { condoId, role } = useCondo();
  const { config } = useFinancialConfig(condoId);
  const navigate = useNavigate();
  const [pendingMyApprovals, setPendingMyApprovals] = useState(0);
  const [minervaCount, setMinervaCount] = useState(0);
  const [pendingNFDocs, setPendingNFDocs] = useState(0);
  const [minExpiry, setMinExpiry] = useState<string | null>(null);
  const [internalUserId, setInternalUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isSindico = role === 'SINDICO' || role === 'ADMIN';
  const isApprover = role === 'SUBSINDICO' || role === 'CONSELHO';
  const showCards = isSindico || isApprover;

  useEffect(() => {
    if (!user) return;
    supabase.from('users').select('id').eq('auth_user_id', user.id).maybeSingle()
      .then(({ data }) => setInternalUserId(data?.id ?? null));
  }, [user]);

  useEffect(() => {
    if (!condoId || !internalUserId || !showCards) {
      setLoading(false);
      return;
    }

    const fetchPending = async () => {
      setLoading(true);

      // OS approvals (existing logic)
      const { data: myApprovals } = await supabase
        .from('service_order_approvals')
        .select('id, expires_at')
        .eq('condo_id', condoId)
        .eq('approver_id', internalUserId)
        .eq('decision', 'pendente');

      const osCount = myApprovals?.length ?? 0;
      const osMinExp = myApprovals?.reduce((min: string | null, a: any) => {
        if (!min || a.expires_at < min) return a.expires_at;
        return min;
      }, null as string | null) ?? null;

      setPendingMyApprovals(osCount);
      setMinExpiry(osMinExp);

      // NF docs pending — filtered by tier
      const { data: pendingDocs } = await supabase
        .from('fiscal_documents')
        .select('id, amount')
        .eq('condo_id', condoId)
        .eq('status', 'PENDENTE');

      let nfCount = 0;
      if (pendingDocs) {
        // Check which NFs this role should see
        const { data: myVotes } = await supabase
          .from('fiscal_document_approvals')
          .select('fiscal_document_id, decision')
          .eq('approver_user_id', internalUserId)
          .in('decision', ['aprovado', 'rejeitado'])
          .in('fiscal_document_id', pendingDocs.map((d: any) => d.id));

        const votedIds = new Set((myVotes ?? []).map((v: any) => v.fiscal_document_id));

        for (const doc of pendingDocs) {
          if (votedIds.has(doc.id)) continue;
          const required = getRequiredRoles(doc.amount ?? 0, config);
          if (isSindico) {
            if (required.includes('SINDICO')) nfCount++;
          } else if (required.includes(role ?? '')) {
            nfCount++;
          }
        }
      }
      setPendingNFDocs(nfCount);

      // Minerva for síndico
      if (isSindico) {
        const { data: minerva } = await supabase
          .from('service_order_approvals')
          .select('id')
          .eq('condo_id', condoId)
          .eq('is_minerva', true)
          .is('minerva_justification', null);
        setMinervaCount(minerva?.length ?? 0);
      }

      setLoading(false);
    };

    fetchPending();
  }, [condoId, internalUserId, showCards, config]);

  if (!showCards || loading) return null;

  const hasAnyPending = pendingMyApprovals > 0 || minervaCount > 0 || pendingNFDocs > 0;
  if (!hasAnyPending) return null;

  const expiryLabel = (expiry: string | null) => {
    if (!expiry) return null;
    const hours = differenceInHours(new Date(expiry), new Date());
    if (hours <= 0) return 'Expirado';
    return `Expira em ${hours}h`;
  };

  const cards = [
    { show: pendingMyApprovals > 0, icon: DollarSign, label: 'Aprovações de OS pendentes', count: pendingMyApprovals, expiry: minExpiry, path: '/ordens-servico' },
    { show: isSindico && minervaCount > 0, icon: Gavel, label: 'Votos de minerva pendentes', count: minervaCount, expiry: null, path: '/ordens-servico' },
    { show: pendingNFDocs > 0, icon: FileText, label: 'NFs aguardando seu voto', count: pendingNFDocs, expiry: null, path: '/almoxarifado' },
  ].filter(c => c.show);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ icon: Icon, label, count, expiry, path }, i) => (
        <Card key={i} className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(path)}>
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
