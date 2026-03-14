import { Users, FileText, AlertTriangle, DollarSign, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';

interface DashboardStatCardsProps {
  counts: { residents: number; condos: number; invoices: number };
  loading: boolean;
  role: string | null;
}

export function DashboardStatCards({ counts, loading, role }: DashboardStatCardsProps) {
  // Budget mock data (replace with real data later)
  const budgetUsed = 45320;
  const budgetTotal = 60000;
  const budgetPercent = Math.round((budgetUsed / budgetTotal) * 100);

  const cards = [
    {
      icon: Users,
      label: 'Moradores',
      value: counts.residents,
      iconColor: 'text-primary',
      iconBg: 'bg-primary/10',
    },
    {
      icon: AlertTriangle,
      label: 'NFs Pendentes',
      value: counts.invoices,
      iconColor: 'text-warning',
      iconBg: 'bg-warning/10',
      badge: counts.invoices > 0 ? '⚠' : undefined,
    },
    {
      icon: DollarSign,
      label: 'Orçamento Mensal',
      value: null,
      iconColor: 'text-primary',
      iconBg: 'bg-primary/10',
      custom: (
        <div>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            R$ {budgetUsed.toLocaleString('pt-BR')}
            <span className="text-sm font-normal text-muted-foreground"> / {budgetTotal.toLocaleString('pt-BR')}</span>
          </p>
          <Progress value={budgetPercent} className="mt-2 h-2" />
          <p className="text-xs text-muted-foreground mt-1">{budgetPercent}% Utilizado</p>
        </div>
      ),
    },
    {
      icon: Clock,
      label: 'Aprovações Pendentes',
      value: 5,
      iconColor: 'text-destructive',
      iconBg: 'bg-destructive/10',
      badge: '!',
      badgeColor: 'bg-destructive',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ icon: Icon, label, value, iconColor, iconBg, badge, badgeColor, custom }) => (
        <div
          key={label}
          className="glass-card p-5 relative overflow-hidden"
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
    </div>
  );
}
