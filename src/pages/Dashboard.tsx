import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCondo } from '@/contexts/CondoContext';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users,
  FileText,
  Activity,
  Bell,
  CheckCircle2,
  Info,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  DollarSign,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PendingApprovalsCards } from '@/components/dashboard/PendingApprovalsCards';
import { DashboardStatCards } from '@/components/dashboard/DashboardStatCards';
import { DashboardApprovals } from '@/components/dashboard/DashboardApprovals';
import { DashboardAlerts } from '@/components/dashboard/DashboardAlerts';
import { DashboardActivities } from '@/components/dashboard/DashboardActivities';

export default function Dashboard() {
  const { user } = useAuth();
  const { condoId, condoName, role } = useCondo();
  const [counts, setCounts] = useState({ condos: 0, residents: 0, invoices: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!condoId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);

      const [condosRes, residentsRes, invoicesRes] = await Promise.all([
        supabase.schema('nfe_vigia').rpc('get_my_condos'),
        supabase
          .schema('nfe_vigia')
          .from('residents')
          .select('*', { count: 'exact', head: true })
          .eq('condo_id', condoId),
        supabase
          .schema('nfe_vigia')
          .from('invoices')
          .select('*', { count: 'exact', head: true })
          .eq('condo_id', condoId),
      ]);

      const condoCount = Array.isArray(condosRes.data) ? condosRes.data.length : 0;

      setCounts({
        condos: condoCount,
        residents: residentsRes.count ?? 0,
        invoices: invoicesRes.error ? 0 : (invoicesRes.count ?? 0),
      });

      setLoading(false);
    };

    fetchData();
  }, [condoId]);

  return (
    <div className="space-y-6">
      {/* Stat Cards Row */}
      <DashboardStatCards counts={counts} loading={loading} role={role} />

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
