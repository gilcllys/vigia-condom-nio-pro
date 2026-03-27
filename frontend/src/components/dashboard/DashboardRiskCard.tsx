import { useEffect, useState } from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle2, ChevronRight, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { useCondo } from '@/contexts/CondoContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';

interface RiskNF {
  id: string;
  number: string | null;
  amount: number | null;
  supplier: string | null;
  description?: string | null;
  riskLevel: 'ALTO' | 'ATENCAO' | 'OK';
  riskReason: string;
}

interface RiskyProvider {
  id: string;
  name: string;
  risk_level: string | null;
  risk_score: number | null;
}

const GENERIC_WORDS = ['reparo', 'manutenção', 'manutencao', 'serviço', 'servico', 'adequação', 'adequacao', 'geral'];

function hasGenericDescription(text: string | null | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const hasGeneric = GENERIC_WORDS.some(w => lower.includes(w));
  if (!hasGeneric) return false;
  const specifics = /bloco|unidade|apto|apartamento|sala|torre|andar|área|piscina|elevador|portaria|garagem/i;
  return !specifics.test(lower);
}

function getRiskBadge(level: 'ALTO' | 'ATENCAO' | 'OK') {
  switch (level) {
    case 'ALTO':
      return { label: 'ALTO RISCO', className: 'bg-destructive text-destructive-foreground', icon: ShieldAlert };
    case 'ATENCAO':
      return { label: 'ATENÇÃO', className: 'bg-warning text-warning-foreground', icon: AlertTriangle };
    default:
      return { label: 'OK', className: 'bg-emerald-500/20 text-emerald-400', icon: CheckCircle2 };
  }
}

export function DashboardRiskCard() {
  const { condoId } = useCondo();
  const [riskNFs, setRiskNFs] = useState<RiskNF[]>([]);
  const [riskyProviders, setRiskyProviders] = useState<RiskyProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!condoId) { setLoading(false); return; }

    const fetchData = async () => {
      setLoading(true);

      try {
        const [nfRes, provRes] = await Promise.all([
          apiFetch(`/api/data/fiscal-documents/?condo_id=${condoId}&status=PENDENTE`),
          apiFetch(`/api/data/providers/?condo_id=${condoId}`),
        ]);

        const nfData = await nfRes.json();
        const provData = await provRes.json();
        const nfRows = Array.isArray(nfData) ? nfData : nfData?.results ?? [];
        const provRows = Array.isArray(provData) ? provData : provData?.results ?? [];

        const providerNames = new Set(provRows.map((p: any) => p.name?.toLowerCase().trim()));

        const analyzed: RiskNF[] = nfRows.map((nf: any) => {
          const supplierRegistered = nf.supplier && providerNames.has(nf.supplier.toLowerCase().trim());
          const genericDesc = hasGenericDescription(nf.supplier);

          let riskLevel: 'ALTO' | 'ATENCAO' | 'OK' = 'OK';
          let riskReason = 'Fornecedor cadastrado';

          if (!supplierRegistered) {
            riskLevel = 'ALTO';
            riskReason = 'Fornecedor não cadastrado';
          } else if (genericDesc) {
            riskLevel = 'ATENCAO';
            riskReason = 'Descrição genérica';
          }

          return {
            id: nf.id,
            number: nf.number,
            amount: nf.amount,
            supplier: nf.supplier,
            riskLevel,
            riskReason,
          };
        });

        setRiskNFs(analyzed);
        setRiskyProviders(
          provRows.filter((p: any) => p.risk_level === 'ALTO' || (p.risk_score ?? 0) > 70) as RiskyProvider[]
        );
      } catch {
        setRiskNFs([]);
        setRiskyProviders([]);
      }
      setLoading(false);
    };

    fetchData();
  }, [condoId]);

  const highCount = riskNFs.filter(n => n.riskLevel === 'ALTO').length;
  const warnCount = riskNFs.filter(n => n.riskLevel === 'ATENCAO').length;
  const totalRisk = highCount + warnCount;

  return (
    <>
      <div
        className="glass-card p-5 cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200"
        onClick={() => setModalOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setModalOpen(true)}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="rounded-lg p-2.5 bg-destructive/10">
            <ShieldAlert className="h-5 w-5 text-destructive" />
          </div>
          {totalRisk > 0 && (
            <span className="text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center bg-destructive text-destructive-foreground">
              {totalRisk}
            </span>
          )}
        </div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Risco de Fraude</p>
        {loading ? (
          <div className="h-8 w-20 bg-muted/50 rounded animate-pulse" />
        ) : (
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold tabular-nums text-foreground">{totalRisk}</p>
            <span className="text-sm text-muted-foreground">alerta{totalRisk !== 1 ? 's' : ''}</span>
          </div>
        )}
        {!loading && (
          <div className="flex gap-2 mt-2">
            {highCount > 0 && <Badge className="bg-destructive text-destructive-foreground text-[10px]">{highCount} alto</Badge>}
            {warnCount > 0 && <Badge className="bg-warning text-warning-foreground text-[10px]">{warnCount} atenção</Badge>}
          </div>
        )}
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Análise de Risco de NFe
            </DialogTitle>
            <DialogDescription>NFs pendentes e prestadores com risco elevado</DialogDescription>
          </DialogHeader>

          {/* NFs section */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">NFs Pendentes ({riskNFs.length})</h3>
            {riskNFs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma NF pendente.</p>
            ) : (
              <div className="space-y-2">
                {riskNFs.map(nf => {
                  const badge = getRiskBadge(nf.riskLevel);
                  const Icon = badge.icon;
                  return (
                    <div key={nf.id} className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3 bg-card/50">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">NF #{nf.number ?? '—'}</p>
                        <p className="text-xs text-muted-foreground truncate">{nf.supplier ?? 'Sem fornecedor'}</p>
                        {nf.amount != null && (
                          <p className="text-xs text-muted-foreground">R$ {nf.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-3 shrink-0">
                        <Badge className={`${badge.className} text-[10px] gap-1`}>
                          <Icon className="h-3 w-3" />
                          {badge.label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground max-w-[120px] truncate">{nf.riskReason}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Risky providers section */}
          {riskyProviders.length > 0 && (
            <div className="space-y-2 mt-4">
              <h3 className="text-sm font-semibold text-foreground">Prestadores com Risco Elevado ({riskyProviders.length})</h3>
              <div className="space-y-2">
                {riskyProviders.map(p => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3 bg-card/50">
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-destructive text-destructive-foreground text-[10px]">
                        {p.risk_level ?? 'ALTO'} — Score: {p.risk_score ?? '—'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2 text-xs"
                onClick={() => { setModalOpen(false); window.location.href = '/prestadores'; }}
              >
                Ver todos os prestadores <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
