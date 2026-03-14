import { Activity, ChevronRight, User } from 'lucide-react';

interface ActivityItem {
  name: string;
  action: string;
  detail: string;
  time: string;
}

const mockActivities: ActivityItem[] = [
  { name: 'João Almeida', action: 'aprovou', detail: 'NF #5678', time: 'há 30 min' },
  { name: 'Ana Souza', action: 'criou nova', detail: 'Ordem de Serviço', time: 'há 1 hora' },
  { name: 'Paulo Mendes', action: 'adicionou um novo', detail: 'morador', time: 'há 2 horas' },
  { name: 'Maria Santos', action: 'rejeitou', detail: 'NF #3245', time: 'há 4 horas' },
];

export function DashboardActivities() {
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
        {mockActivities.map((item, i) => (
          <div key={i} className="flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-muted p-2">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-sm text-foreground">
                <span className="font-semibold">{item.name}</span>{' '}
                {item.action}{' '}
                <span className="font-semibold">{item.detail}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">{item.time}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
