import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCondo } from '@/contexts/CondoContext';
import { supabase } from '@/lib/supabase';
import { DashboardStatCards } from '@/components/dashboard/DashboardStatCards';
import { DashboardApprovals } from '@/components/dashboard/DashboardApprovals';
import { DashboardAlerts } from '@/components/dashboard/DashboardAlerts';
import { DashboardActivities } from '@/components/dashboard/DashboardActivities';
import { DashboardRiskCard } from '@/components/dashboard/DashboardRiskCard';

export default function Dashboard() {
  const { user } = useAuth();
  const { condoId, condoName, role } = useCondo();
  const [counts, setCounts] = useState({ nfsPendentes: 0, aprovacoesPendentes: 0, budgetTotal: 0, budgetUsed: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!condoId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);

      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

      const [nfsRes, aprovRes, configRes, spendingRes] = await Promise.all([
        supabase
          .from('fiscal_documents')
          .select('*', { count: 'exact', head: true })
          .eq('condo_id', condoId)
          .eq('status', 'PENDENTE'),
        supabase
          .from('fiscal_document_approvals')
          .select('*', { count: 'exact', head: true })
          .eq('condo_id', condoId)
          .eq('decision', 'PENDENTE'),
        supabase
          .from('condo_financial_config')
          .select('annual_budget')
          .eq('condo_id', condoId)
          .maybeSingle(),
        supabase
          .from('fiscal_documents')
          .select('amount')
          .eq('condo_id', condoId)
          .eq('status', 'APROVADO')
          .gte('created_at', startOfMonth),
      ]);

      const budgetTotal = (configRes.data as { annual_budget: number | null } | null)?.annual_budget ?? 0;
      const spendingData = spendingRes.data as { amount: number | null }[] | null;
      const budgetUsed = spendingData?.reduce((sum, d) => sum + (d.amount ?? 0), 0) ?? 0;

      setCounts({
        nfsPendentes: nfsRes.count ?? 0,
        aprovacoesPendentes: aprovRes.count ?? 0,
        budgetTotal,
        budgetUsed,
      });

      setLoading(false);
    };

    fetchData();
  }, [condoId]);

  return (
    <div className="space-y-6">
      {/* Top row: 4 cards — Risco de Fraude, Orçamento Mensal, NFs Pendentes, Aprovações Pendentes */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardRiskCard />
        <DashboardStatCards counts={counts} loading={loading} role={role} />
      </div>

      {/* Middle row: Approvals + Alerts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DashboardApprovals />
        </div>
        <DashboardAlerts />
      </div>

      {/* Activities */}
      <DashboardActivities />
    </div>
  );
}
