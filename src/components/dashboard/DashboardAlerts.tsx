import { Bell, ChevronRight, AlertTriangle } from 'lucide-react';

interface AlertItem {
  text: string;
  highlight?: string;
  type: 'warning' | 'danger';
}

const mockAlerts: AlertItem[] = [
  { text: 'Cota de Água ', highlight: 'ultrapassada!', type: 'warning' },
  { text: 'Orçamento de Manutenção ', highlight: 'excedido!', type: 'danger' },
  { text: 'Fundo de Reserva ', highlight: 'baixo!', type: 'danger' },
];

export function DashboardAlerts() {
  return (
    <div className="glass-card">
      <div className="flex items-center justify-between p-5 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">Alertas</h2>
        </div>
        <button className="text-muted-foreground hover:text-primary transition-colors">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {mockAlerts.map((alert, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 p-3 rounded-md border-l-4 ${
              alert.type === 'warning'
                ? 'border-l-warning bg-warning/5'
                : 'border-l-destructive bg-destructive/5'
            }`}
          >
            <AlertTriangle className={`h-4 w-4 shrink-0 ${
              alert.type === 'warning' ? 'text-warning' : 'text-destructive'
            }`} />
            <p className="text-sm text-foreground">
              {alert.text}
              {alert.highlight && (
                <span className={`font-semibold ${
                  alert.type === 'warning' ? 'text-warning' : 'text-destructive'
                }`}>{alert.highlight}</span>
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
