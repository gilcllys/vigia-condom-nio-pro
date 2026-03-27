import { useEffect, useState } from 'react';
import { Activity, ChevronRight, User, Inbox } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useCondo } from '@/contexts/CondoContext';

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (dateDay.getTime() === today.getTime()) return `hoje às ${timeStr}`;
  if (dateDay.getTime() === yesterday.getTime()) return `ontem às ${timeStr}`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ` às ${timeStr}`;
}

interface ActivityItem {
  id: string;
  user_name: string;
  action: string;
  detail: string;
  created_at: string;
}

export function DashboardActivities() {
  const { condoId } = useCondo();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!condoId) {
      setLoading(false);
      return;
    }

    const fetchActivities = async () => {
      setLoading(true);

      try {
        const res = await apiFetch(`/api/data/approvals/?condo_id=${condoId}&ordering=-voted_at&limit=10`);
        const data = await res.json();
        const rows = Array.isArray(data) ? data : data?.results ?? [];

        if (rows.length > 0) {
          const mapped: ActivityItem[] = rows.map((row: any) => ({
            id: row.id,
            user_name: row.approver_role ?? 'Usuário',
            action: row.decision === 'APROVADO' ? 'aprovou' : row.decision === 'REJEITADO' ? 'rejeitou' : row.decision?.toLowerCase() ?? 'votou em',
            detail: `Doc Fiscal #${String(row.fiscal_document_id).slice(0, 8)}`,
            created_at: row.voted_at,
          }));
          setActivities(mapped);
        } else {
          setActivities([]);
        }
      } catch {
        setActivities([]);
      }

      setLoading(false);
    };

    fetchActivities();
  }, [condoId]);

  return (
    <div className="glass-card">
      <div className="flex items-center justify-between p-5 border-b border-border">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">Atividades Recentes</h2>
        </div>
        <button className="text-muted-foreground hover:text-primary transition-colors">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="divide-y divide-border/30">
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-5 py-10 text-muted-foreground">
            <Inbox className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Nenhuma atividade recente.</p>
          </div>
        ) : (
          activities.map((item) => (
            <div key={item.id} className="flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-muted p-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-sm text-foreground">
                  <span className="font-semibold">{item.user_name}</span>{' '}
                  {item.action}{' '}
                  <span className="font-semibold">{item.detail}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateTime(item.created_at)}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
