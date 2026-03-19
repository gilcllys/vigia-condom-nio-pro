import { AlertTriangle, DollarSign, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useNavigate } from 'react-router-dom';

interface DashboardStatCardsProps {
  counts: { nfsPendentes: number; aprovacoesPendentes: number; budgetTotal: number; budgetUsed: number };
  loading: boolean;
  role: string | null;
}

export function DashboardStatCards({ counts, loading, role }: DashboardStatCardsProps) {
  const navigate = useNavigate();
  const { nfsPendentes, aprovacoesPendentes, budgetTotal, budgetUsed } = counts;

  const budgetPercent = budgetTotal > 0 ? Math.min(100, Math.round((budgetUsed / budgetTotal) * 100)) : 0;

  // Order: Orçamento Mensal, NFs Pendentes, Aprovações Pendentes
  // (Risco de Fraude is rendered first by Dashboard.tsx before these cards)
  const cards = [
    {
      icon: DollarSign,
      label: 'Orçamento Mensal',
      value: null,
      iconColor: 'text-primary',
      iconBg: 'bg-primary/10',
      path: '/configuracoes',
      custom: (
        <div>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            R$ {budgetUsed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            <span className="text-sm font-normal text-muted-foreground"> / {budgetTotal.toLocaleString('pt-BR')}</span>
          </p>
          <Progress value={budgetPercent} className="mt-2 h-2" />
          <p className="text-xs text-muted-foreground mt-1">{budgetPercent}% Utilizado</p>
        </div>
      ),
    },
    {
      icon: AlertTriangle,
      label: 'NFs Pendentes',
      value: nfsPendentes,
      iconColor: 'text-warning',
      iconBg: 'bg-warning/10',
      badge: nfsPendentes > 0 ? '⚠' : undefined,
      path: '/notas-fiscais?status=pendente',
    },
    {
      icon: Clock,
      label: 'Aprovações Pendentes',
      value: aprovacoesPendentes,
      iconColor: 'text-destructive',
      iconBg: 'bg-destructive/10',
      badge: aprovacoesPendentes > 0 ? '!' : undefined,
      badgeColor: 'bg-destructive',
      path: '/aprovacoes',
    },
  ];

  return (
    <>
      {cards.map(({ icon: Icon, label, value, iconColor, iconBg, badge, badgeColor, custom, path }) => (
        <div
          key={label}
          className="glass-card p-5 relative overflow-hidden cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200"
          onClick={() => navigate(path)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate(path)}
        >
          <div className="flex items-center justify-between mb-3">
            <div className={`rounded-lg p-2.5 ${iconBg}`}>
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
            {badge && (
              <span className={`text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center ${badgeColor ?? 'bg-warning'} text-warning-foreground`}>
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
          {loading ? (
            <Skeleton className="h-8 w-20" />
          ) : custom ? (
            custom
          ) : (
            <p className="text-3xl font-bold tabular-nums text-foreground">{value}</p>
          )}
        </div>
      ))}
    </>
  );
}
