import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { logSOActivity } from '@/lib/so-activity-log';
import { Shield, ThumbsUp, ThumbsDown, Clock, Gavel } from 'lucide-react';
import { formatDistanceToNow, differenceInHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Approval {
  id: string;
  approver_id: string;
  approver_role: string;
  decision: string;
  justification: string | null;
  expires_at: string;
  responded_at: string | null;
  is_minerva: boolean;
  minerva_justification: string | null;
  approver_name?: string;
}

interface Props {
  orderId: string;
  condoId: string;
  approvalType: 'ORCAMENTO' | 'NF' | 'FINAL';
  title: string;
  isSindico: boolean;
  canCriticalActions: boolean;
  onDecisionMade: () => void;
}

const roleLabel: Record<string, string> = {
  SUBSINDICO: 'Subsíndico',
  CONSELHO: 'Conselho',
  SINDICO: 'Síndico',
};

const decisionBadge = (d: string) => {
  switch (d) {
    case 'aprovado': return <Badge className="bg-green-600 text-white text-xs">Aprovado</Badge>;
    case 'rejeitado': return <Badge variant="destructive" className="text-xs">Rejeitado</Badge>;
    case 'neutro': return <Badge variant="secondary" className="text-xs">Neutro (prazo expirado)</Badge>;
    default: return <Badge variant="outline" className="text-xs">Pendente</Badge>;
  }
};

export function OSApprovalCard({ orderId, condoId, approvalType, title, isSindico, canCriticalActions, onDecisionMade }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [justification, setJustification] = useState('');
  const [minervaJustification, setMinervaJustification] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [internalUserId, setInternalUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/data/users/?auth_user_id=${user.id}`)
      .then(res => res.json())
      .then(data => {
        const arr = data.results ?? data;
        const u = Array.isArray(arr) ? arr[0] : null;
        setInternalUserId(u?.id ?? null);
      })
      .catch(() => setInternalUserId(null));
  }, [user]);

  const fetchApprovals = async () => {
    setLoading(true);
    const res = await apiFetch(`/api/data/os-approvals/?service_order_id=${orderId}&approval_type=${approvalType}&ordering=created_at`);
    const json = await res.json();
    const data: any[] = json.results ?? json;

    if (data && data.length > 0) {
      // Fetch approver names
      const userIds = [...new Set(data.map((a: any) => a.approver_id))];
      const nameMap: Record<string, string> = {};
      for (const uid of userIds) {
        try {
          const uRes = await apiFetch(`/api/data/users/${uid}/`);
          if (uRes.ok) {
            const uData = await uRes.json();
            nameMap[uid] = uData.full_name;
          }
        } catch {}
      }
      setApprovals(data.map((a: any) => ({ ...a, approver_name: nameMap[a.approver_id] ?? 'Usuário' })));
    } else {
      setApprovals([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchApprovals(); }, [orderId, approvalType]);

  // Check for expired approvals
  useEffect(() => {
    const checkExpired = async () => {
      const expired = approvals.filter(a => a.decision === 'pendente' && new Date(a.expires_at) < new Date());
      for (const a of expired) {
        await apiFetch(`/api/data/os-approvals/${a.id}/`, {
          method: 'PATCH',
          body: JSON.stringify({ decision: 'neutro', is_minerva: true, responded_at: new Date().toISOString() }),
        });
      }
      if (expired.length > 0) fetchApprovals();
    };
    if (approvals.length > 0) checkExpired();
  }, [approvals.length]);

  const myApproval = approvals.find(a => a.approver_id === internalUserId && a.decision === 'pendente');

  const handleDecision = async (decision: 'aprovado' | 'rejeitado') => {
    if (!myApproval) return;
    if (decision === 'rejeitado' && !justification.trim()) {
      toast({ title: 'Justificativa obrigatória para rejeição', variant: 'destructive' });
      return;
    }
    setActionLoading(true);

    const res = await apiFetch(`/api/data/os-approvals/${myApproval.id}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        decision,
        justification: justification.trim() || null,
        responded_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      toast({ title: 'Erro ao registrar voto', variant: 'destructive' });
    } else {
      const roleName = roleLabel[myApproval.approver_role] ?? myApproval.approver_role;
      const actionDesc = decision === 'aprovado'
        ? `${myApproval.approver_name} (${roleName}) aprovou`
        : `${myApproval.approver_name} (${roleName}) rejeitou — Motivo: ${justification.trim()}`;

      await logSOActivity({
        serviceOrderId: orderId,
        action: decision === 'aprovado' ? 'APROVACAO_REGISTRADA' as any : 'REJEICAO_REGISTRADA' as any,
        description: actionDesc,
      });

      toast({ title: decision === 'aprovado' ? 'Voto de aprovação registrado' : 'Voto de rejeição registrado' });
      setJustification('');
      fetchApprovals();
      onDecisionMade();
    }
    setActionLoading(false);
  };

  // Minerva logic
  const allResponded = approvals.length > 0 && approvals.every(a => a.decision !== 'pendente');
  const hasRejection = approvals.some(a => a.decision === 'rejeitado' || a.decision === 'neutro');
  const allApproved = allResponded && approvals.every(a => a.decision === 'aprovado');
  const needsMinerva = allResponded && hasRejection && canCriticalActions;

  const handleMinerva = async (decision: 'aprovado' | 'cancelado') => {
    if (!minervaJustification.trim()) {
      toast({ title: 'Justificativa obrigatória para voto de minerva', variant: 'destructive' });
      return;
    }
    setActionLoading(true);

    // Update all approvals for this order with minerva info
    // We need to update each one individually since there's no bulk update by filter
    let hasError = false;
    for (const a of approvals) {
      const res = await apiFetch(`/api/data/os-approvals/${a.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_minerva: true,
          minerva_justification: `Síndico exerceu voto de minerva — ${decision === 'aprovado' ? 'Aprovado' : 'Cancelado'} — Motivo: ${minervaJustification.trim()}`,
        }),
      });
      if (!res.ok) hasError = true;
    }

    if (!hasError) {
      await logSOActivity({
        serviceOrderId: orderId,
        action: 'MINERVA_EXERCIDO' as any,
        description: `Síndico exerceu voto de minerva — ${decision === 'aprovado' ? 'Aprovado' : 'Cancelado'} — Motivo: ${minervaJustification.trim()}`,
      });
      toast({ title: `Voto de minerva registrado: ${decision === 'aprovado' ? 'Aprovado' : 'Cancelado'}` });
      setMinervaJustification('');
      fetchApprovals();
      onDecisionMade();
    }
    setActionLoading(false);
  };

  if (approvals.length === 0 && !loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          {title}
          {approvals.length > 0 && (
            <Badge variant="secondary" className="text-xs ml-auto">
              {approvals.filter(a => a.decision !== 'pendente').length}/{approvals.length} votos
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-2">Carregando...</p>
        ) : (
          <>
            {/* Votes list */}
            <div className="space-y-2">
              {approvals.map(a => {
                const hoursLeft = differenceInHours(new Date(a.expires_at), new Date());
                return (
                  <div key={a.id} className="flex items-center justify-between rounded-md border border-border p-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-foreground">
                        {a.approver_name} <span className="text-muted-foreground">({roleLabel[a.approver_role] ?? a.approver_role})</span>
                      </p>
                      {a.decision === 'pendente' && hoursLeft > 0 && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Expira em {hoursLeft}h
                        </p>
                      )}
                      {a.justification && (
                        <p className="text-xs text-muted-foreground">Motivo: {a.justification}</p>
                      )}
                    </div>
                    {decisionBadge(a.decision)}
                  </div>
                );
              })}
            </div>

            {/* My vote */}
            {myApproval && (
              <div className="rounded-md border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">Seu voto</p>
                <div className="space-y-2">
                  <Label>Justificativa {' '}<span className="text-muted-foreground">(obrigatória para rejeição)</span></Label>
                  <Textarea
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                    placeholder="Descreva o motivo..."
                    rows={2}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleDecision('aprovado')} disabled={actionLoading}>
                    <ThumbsUp className="h-4 w-4 mr-1" /> Aprovar
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDecision('rejeitado')}
                    disabled={actionLoading || !justification.trim()}
                  >
                    <ThumbsDown className="h-4 w-4 mr-1" /> Rejeitar
                  </Button>
                </div>
              </div>
            )}

            {/* Result */}
            {allApproved && (
              <div className="rounded-md bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 p-3">
                <p className="text-sm font-medium text-green-700 dark:text-green-400">✓ Aprovação unânime</p>
              </div>
            )}

            {/* Minerva vote */}
            {needsMinerva && (
              <div className="rounded-md border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Gavel className="h-4 w-4 text-amber-600" />
                  <p className="text-sm font-medium text-foreground">Voto de Minerva — Decisão do Síndico</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Houve rejeição ou prazo expirado. Você pode aprovar mesmo assim ou cancelar.
                </p>
                <div className="space-y-2">
                  <Label>Justificativa *</Label>
                  <Textarea
                    value={minervaJustification}
                    onChange={(e) => setMinervaJustification(e.target.value)}
                    placeholder="Descreva o motivo da sua decisão..."
                    rows={2}
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleMinerva('aprovado')} disabled={actionLoading || !minervaJustification.trim()}>
                    <ThumbsUp className="h-4 w-4 mr-1" /> Aprovar mesmo assim
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleMinerva('cancelado')} disabled={actionLoading || !minervaJustification.trim()}>
                    <ThumbsDown className="h-4 w-4 mr-1" /> Cancelar OS
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
