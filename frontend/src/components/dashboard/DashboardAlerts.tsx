import { useEffect, useState } from 'react';
import { Bell, ChevronRight, AlertTriangle, Info } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useCondo } from '@/contexts/CondoContext';

interface AlertItem {
  text: string;
  type: 'warning' | 'danger';
}

export function DashboardAlerts() {
  const { condoId } = useCondo();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!condoId) {
      setLoading(false);
      return;
    }

    const fetchAlerts = async () => {
      setLoading(true);

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      try {
        const [osRes, stockRes, nfRejRes] = await Promise.all([
          apiFetch(`/api/data/service-orders/?condo_id=${condoId}&status=AGUARDANDO_APROVACAO&created_before=${yesterday}&count_only=true`),
          apiFetch(`/api/data/stock-items/?condo_id=${condoId}`),
          apiFetch(`/api/data/fiscal-documents/?condo_id=${condoId}&status=REJEITADO&created_after=${thirtyDaysAgo}&count_only=true`),
        ]);

        const newAlerts: AlertItem[] = [];

        const osData = await osRes.json();
        const osCount = osData?.count ?? 0;
        if (osCount > 0) {
          newAlerts.push({
            text: `${osCount} ${osCount === 1 ? 'ordem de serviço aguarda' : 'ordens de serviço aguardam'} aprovação há mais de 24h`,
            type: 'warning',
          });
        }

        const stockData = await stockRes.json();
        const stockItems = Array.isArray(stockData) ? stockData : stockData?.results ?? [];
        const lowStock = stockItems.filter(
          (item: any) => (item.current_qty ?? 0) < (item.min_qty ?? 0)
        );
        if (lowStock.length > 0) {
          newAlerts.push({
            text: `${lowStock.length} ${lowStock.length === 1 ? 'item do estoque abaixo' : 'itens do estoque abaixo'} do estoque mínimo`,
            type: 'danger',
          });
        }

        const nfRejData = await nfRejRes.json();
        const nfRejCount = nfRejData?.count ?? 0;
        if (nfRejCount > 0) {
          newAlerts.push({
            text: `${nfRejCount} ${nfRejCount === 1 ? 'nota fiscal rejeitada' : 'notas fiscais rejeitadas'} nos últimos 30 dias`,
            type: 'danger',
          });
        }

        setAlerts(newAlerts);
      } catch {
        setAlerts([]);
      }
      setLoading(false);
    };

    fetchAlerts();
  }, [condoId]);

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
        {loading ? (
          <div className="text-center text-sm text-muted-foreground py-4">Carregando...</div>
        ) : alerts.length === 0 ? (
          <div className="flex items-center gap-3 p-3 rounded-md border-l-4 border-l-primary/30 bg-primary/5">
            <Info className="h-4 w-4 shrink-0 text-primary/60" />
            <p className="text-sm text-muted-foreground">Nenhum alerta no momento</p>
          </div>
        ) : (
          alerts.map((alert, i) => (
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
              <p className="text-sm text-foreground">{alert.text}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
