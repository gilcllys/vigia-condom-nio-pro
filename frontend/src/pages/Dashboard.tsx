import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCondo } from '@/contexts/CondoContext';
import { apiFetch } from '@/lib/api';
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

      try {
        const res = await apiFetch(`/api/data/dashboard/stats/?condo_id=${condoId}`);
        const data = await res.json();

        setCounts({
          nfsPendentes: data.nfs_pendentes ?? 0,
          aprovacoesPendentes: data.aprovacoes_pendentes ?? 0,
          budgetTotal: data.budget_total ?? 0,
          budgetUsed: data.budget_used ?? 0,
        });
      } catch {
        setCounts({ nfsPendentes: 0, aprovacoesPendentes: 0, budgetTotal: 0, budgetUsed: 0 });
      }

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
