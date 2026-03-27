import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useCondo } from '@/contexts/CondoContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useFinancialConfig, getRequiredRoles, getTierLabel } from '@/hooks/useFinancialConfig';
import { FileText } from 'lucide-react';

interface Approval {
  id: string;
  approver_role: string;
  decision: string | null;
  voted_at: string | null;
}

interface PendingNF {
  id: string;
  number: string;
  supplier: string;
  amount: number;
  issue_date: string | null;
  status: string;
  approvals: Approval[];
}

const isFinalDecision = (decision: string | null) => decision === 'aprovado' || decision === 'rejeitado';

export default function ApprovalsTab() {
  const { condoId, role } = useCondo();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { config } = useFinancialConfig(condoId);
  const canView = ['SUBSINDICO', 'CONSELHO', 'SINDICO', 'ADMIN'].includes(role ?? '');

  const [nfs, setNfs] = useState<PendingNF[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNFs = async () => {
    if (!condoId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      // Fetch pending fiscal documents
      const docsRes = await apiFetch(`/api/data/fiscal-documents/?condo_id=${condoId}&status=PENDENTE`);
      const docsData = await docsRes.json();
      const docs = Array.isArray(docsData) ? docsData : docsData?.results ?? [];

      if (docs.length === 0) {
        setNfs([]);
        setLoading(false);
        return;
      }

      const docIds = docs.map((d: any) => d.id);

      // Fetch approvals for these documents
      const approvalsRes = await apiFetch(`/api/data/approvals/?condo_id=${condoId}`);
      const approvalsData = await approvalsRes.json();
      const allApprovals = Array.isArray(approvalsData) ? approvalsData : approvalsData?.results ?? [];

      const merged: PendingNF[] = docs.map((doc: any) => ({
        ...doc,
        approvals: allApprovals
          .filter((a: any) => a.fiscal_document_id === doc.id)
          .map((a: any) => ({
            ...a,
            decision: (!a.decision || (!a.voted_at && (a.decision !== 'aprovado' && a.decision !== 'rejeitado'))) ? 'pendente' : a.decision,
          })),
      }));

      const filtered = merged.filter(nf => {
        const requiredRoles = getRequiredRoles(nf.amount ?? 0, config);
        if (role === 'SINDICO' || role === 'ADMIN') {
          const lowerRoles = requiredRoles.filter(r => r !== 'SINDICO');
          const allLowerDecided = lowerRoles.every(tier =>
            nf.approvals.some(a => a.approver_role === tier && isFinalDecision(a.decision))
          );
          const needsSindicoByTier = requiredRoles.includes('SINDICO') && allLowerDecided;
          const needsSindicoByRejection = nf.approvals.some(a => a.decision === 'rejeitado') && allLowerDecided;
          return needsSindicoByTier || needsSindicoByRejection;
        }
        return requiredRoles.includes(role ?? '');
      });

      setNfs(filtered);
    } catch (err) {
      console.error('Error fetching approvals:', err);
      toast({ title: 'Erro ao carregar aprovações', variant: 'destructive' });
      setNfs([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNFs();
  }, [condoId, canView, config]);

  if (!canView) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
            Você não tem permissão para visualizar aprovações.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Aprovações Pendentes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : nfs.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhuma aprovação pendente.</p>
        ) : (
          <div className="space-y-3">
            {nfs.map(nf => {
              const requiredRoles = getRequiredRoles(nf.amount ?? 0, config);
              const approvedRoles = nf.approvals.filter(a => a.decision === 'aprovado').map(a => a.approver_role);
              const pendingRoles = requiredRoles.filter(r => !approvedRoles.includes(r));
              const hasRejection = nf.approvals.some(a => a.decision === 'rejeitado');
              return (
                <div key={nf.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">NF {nf.number}</p>
                      <Badge variant="outline">{getTierLabel(nf.amount ?? 0, config)}</Badge>
                      {hasRejection && <Badge variant="destructive">Rejeitada</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{nf.supplier}</p>
                    <p className="text-sm font-medium">R$ {(nf.amount ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    {pendingRoles.length > 0 && <p className="text-xs text-muted-foreground">Aguardando: {pendingRoles.join(', ')}</p>}
                  </div>
                  <Button onClick={() => navigate(`/aprovacoes/${nf.id}`)} variant="default" size="sm">Analisar</Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
