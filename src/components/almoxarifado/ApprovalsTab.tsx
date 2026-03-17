import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getPublicStorageUrl } from '@/lib/storage-url';
import { useCondo } from '@/contexts/CondoContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useFinancialConfig, getRequiredRoles, getTierLabel } from '@/hooks/useFinancialConfig';
import { CheckCircle, XCircle, Clock, Shield, FileText, AlertTriangle } from 'lucide-react';

interface Approval {
  id: string;
  user_id: string;
  decision: string;
  voted_at: string | null;
  justification: string | null;
  approver_role?: string;
  user_name?: string;
  user_role?: string;
}

const isFinalDecision = (decision: string) => decision === 'aprovado' || decision === 'rejeitado';

interface PendingNF {
  id: string;
  number: string;
  supplier: string;
  amount: number;
  issue_date: string | null;
  status: string;
  file_url: string | null;
  approvals: Approval[];
  quotaExceeded?: boolean;
  quotaCategory?: string;
}

export default function ApprovalsTab() {
  const { condoId, role } = useCondo();
  const { user } = useAuth();
  const { toast } = useToast();
  const { config } = useFinancialConfig(condoId);
  const canView = ['SUBSINDICO', 'CONSELHO', 'SINDICO', 'ADMIN'].includes(role ?? '');

  const [nfs, setNfs] = useState<PendingNF[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [processing, setProcessing] = useState(false);
  const [internalUserId, setInternalUserId] = useState<string | null>(null);
  const [quotaAcknowledged, setQuotaAcknowledged] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!user) return;
    supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setInternalUserId(data?.id ?? null));
  }, [user]);

  const fetchNFs = async () => {
    if (!condoId || !canView) { setLoading(false); return; }
    setLoading(true);

    const { data: docs, error } = await supabase
      .from('fiscal_documents')
      .select('id, number, supplier, amount, issue_date, status, file_url')
      .eq('condo_id', condoId)
      .eq('status', 'PENDENTE')
      .order('created_at', { ascending: false });

    if (error || !docs || docs.length === 0) {
      setNfs([]);
      setLoading(false);
      return;
    }

    // Fetch approvals
    const docIds = docs.map((d: any) => d.id);
    const { data: approvals } = await supabase
      .from('fiscal_document_approvals')
      .select('id, fiscal_document_id, approver_user_id, approver_role, decision, voted_at, justification')
      .in('fiscal_document_id', docIds);

    // User names
    const userIds = [...new Set((approvals ?? []).map((a: any) => a.approver_user_id))];
    let userMap: Record<string, { name: string; role: string }> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, full_name').in('id', userIds);
      const { data: userCondos } = await supabase.from('user_condos').select('user_id, role').eq('condo_id', condoId).in('user_id', userIds);
      (users ?? []).forEach((u: any) => {
        const uc = (userCondos ?? []).find((uc: any) => uc.user_id === u.id);
        userMap[u.id] = { name: u.full_name || 'Usuário', role: uc?.role || '' };
      });
    }

    // Monthly quota check
    let monthlyApproved = 0;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { data: monthDocs } = await supabase
      .from('fiscal_documents')
      .select('amount')
      .eq('condo_id', condoId)
      .in('status', ['PROCESSADO', 'APROVADO'])
      .gte('created_at', monthStart);
    monthlyApproved = (monthDocs ?? []).reduce((sum: number, d: any) => sum + (d.amount ?? 0), 0);

    const merged: PendingNF[] = docs.map((doc: any) => {
      // Check quota (simplified - using generic monthly total since we don't have category on fiscal_documents)
      let quotaExceeded = false;
      const limits = [config?.monthly_limit_manutencao, config?.monthly_limit_limpeza, config?.monthly_limit_seguranca].filter(Boolean);
      const minLimit = limits.length > 0 ? Math.min(...(limits as number[])) : null;
      if (minLimit != null && (monthlyApproved + (doc.amount ?? 0)) > minLimit) {
        quotaExceeded = true;
      }

      return {
        ...doc,
        quotaExceeded,
        approvals: (approvals ?? [])
          .filter((a: any) => a.fiscal_document_id === doc.id)
          .map((a: any) => ({
            ...a,
            user_id: a.approver_user_id,
            user_name: userMap[a.approver_user_id]?.name || 'Usuário',
            user_role: a.approver_role || userMap[a.approver_user_id]?.role || '',
          })),
      };
    });

    // Filter by tier visibility
    const filtered = merged.filter(nf => {
      const requiredRoles = getRequiredRoles(nf.amount ?? 0, config);
      if (role === 'SINDICO' || role === 'ADMIN') {
        const lowerRoles = requiredRoles.filter(r => r !== 'SINDICO');
        const allLowerDecided = lowerRoles.every(tier =>
          nf.approvals.some(a => (a.approver_role ?? a.user_role) === tier && isFinalDecision(a.decision))
        );

        const needsSindicoByTier = requiredRoles.includes('SINDICO') && allLowerDecided;
        const needsSindicoByRejection = nf.approvals.some(a => a.decision === 'rejeitado') && allLowerDecided;
        return needsSindicoByTier || needsSindicoByRejection;
      }

      // SUBSINDICO/CONSELHO veem documentos da sua alçada
      return requiredRoles.includes(role ?? '');
    });

    setNfs(filtered);
    setLoading(false);
  };

  useEffect(() => { fetchNFs(); }, [condoId, canView, config]);

  const handleVote = async (nf: PendingNF, decision: 'aprovado' | 'rejeitado') => {
    if (!internalUserId || !condoId) return;

    if (decision === 'rejeitado' && !justification.trim()) {
      toast({ title: 'Justificativa obrigatória ao rejeitar', variant: 'destructive' });
      return;
    }

    // Check quota acknowledgment
    if (nf.quotaExceeded && !quotaAcknowledged[nf.id]) {
      toast({ title: 'Marque "Ciente do estouro de cota" antes de votar', variant: 'destructive' });
      return;
    }

    setProcessing(true);

    const myPendingApproval = nf.approvals.find(a => a.user_id === internalUserId);

    const votePayload = {
      fiscal_document_id: nf.id,
      approver_user_id: internalUserId,
      approver_role: role,
      condo_id: condoId,
      decision,
      voted_at: new Date().toISOString(),
      justification: decision === 'rejeitado' ? justification.trim() : null,
    };

    const { error: approvalError } = myPendingApproval
      ? await supabase.from('fiscal_document_approvals').update(votePayload).eq('id', myPendingApproval.id)
      : await supabase.from('fiscal_document_approvals').insert(votePayload);

    if (approvalError) {
      toast({ title: 'Erro ao registrar voto', description: approvalError.message, variant: 'destructive' });
      setProcessing(false);
      return;
    }

    // If rejected → update NF status immediately
    if (decision === 'rejeitado') {
      await supabase.from('fiscal_documents').update({ status: 'CANCELADO' }).eq('id', nf.id);
      toast({ title: 'NF rejeitada.' });
      setRejectId(null);
      setJustification('');
      setProcessing(false);
      fetchNFs();
      return;
    }

    // Check if all required roles have approved
    const { data: allApprovals } = await supabase
      .from('fiscal_document_approvals')
      .select('approver_role, decision')
      .eq('fiscal_document_id', nf.id);

    const requiredRoles = getRequiredRoles(nf.amount ?? 0, config);
    const approvedRoles = (allApprovals ?? [])
      .filter((a: any) => a.decision === 'aprovado')
      .map((a: any) => a.approver_role);

    const allRequired = requiredRoles.every(r => approvedRoles.includes(r));

    if (allRequired) {
      await supabase.from('fiscal_documents').update({ status: 'PROCESSADO' }).eq('id', nf.id);
      toast({ title: 'NF aprovada!' });
    } else {
      const remaining = requiredRoles.filter(r => !approvedRoles.includes(r));
      toast({ title: `Voto registrado. Aguardando: ${remaining.join(', ')}` });
    }

    setRejectId(null);
    setJustification('');
    setProcessing(false);
    fetchNFs();
  };

  if (!canView) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Você não tem permissão para visualizar aprovações.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Shield className="h-4 w-4" />
          NFs Pendentes de Aprovação
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
        ) : nfs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma NF pendente de aprovação.</p>
        ) : (
          <div className="space-y-4">
            {nfs.map((nf) => {
              const requiredRoles = getRequiredRoles(nf.amount ?? 0, config);
              const isSindico = role === 'SINDICO' || role === 'ADMIN';
              const myApproval = nf.approvals.find(a => a.user_id === internalUserId);
              const alreadyVoted = myApproval ? isFinalDecision(myApproval.decision) : false;

              const lowerRoles = requiredRoles.filter(r => r !== 'SINDICO');
              const allLowerDecided = lowerRoles.every(tier =>
                nf.approvals.some(a => (a.approver_role ?? a.user_role) === tier && isFinalDecision(a.decision))
              );

              const hasRejection = nf.approvals.some(a => a.decision === 'rejeitado');
              const sindicoCanVoteByTier = isSindico && requiredRoles.includes('SINDICO') && allLowerDecided;
              const sindicoCanVoteByMinerva = isSindico && hasRejection && allLowerDecided;
              const canVote = !alreadyVoted && (
                isSindico
                  ? (sindicoCanVoteByTier || sindicoCanVoteByMinerva)
                  : requiredRoles.includes(role ?? '')
              );

              const tierLabel = getTierLabel(nf.amount ?? 0, config);

              return (
                <div key={nf.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">NF {nf.number}</p>
                        {tierLabel && (
                          <Badge variant="outline" className="text-xs">{tierLabel}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{nf.supplier}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Aprovadores: {requiredRoles.join(', ')}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="font-medium">R$ {nf.amount?.toFixed(2)}</p>
                      {nf.issue_date && (
                        <p className="text-xs text-muted-foreground">{new Date(nf.issue_date).toLocaleDateString('pt-BR')}</p>
                      )}
                      {nf.file_url && (
                        <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => window.open(getPublicStorageUrl(nf.file_url!), '_blank')}>
                          <FileText className="h-3 w-3 mr-1" />
                          Ver NF
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Quota exceeded warning */}
                  {nf.quotaExceeded && (
                    <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                        <p className="text-sm font-medium">⚠️ Esta NF ultrapassa a cota mensal</p>
                      </div>
                      {(canVote || sindicoCanVote) && (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`quota-ack-${nf.id}`}
                            checked={quotaAcknowledged[nf.id] ?? false}
                            onCheckedChange={(checked) =>
                              setQuotaAcknowledged(prev => ({ ...prev, [nf.id]: !!checked }))
                            }
                          />
                          <label htmlFor={`quota-ack-${nf.id}`} className="text-xs text-muted-foreground cursor-pointer">
                            Ciente do estouro de cota
                          </label>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Approval votes */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Votos:</p>
                    <div className="flex flex-wrap gap-2">
                      {nf.approvals.map((a) => (
                        <Badge
                          key={a.id}
                          variant={a.decision === 'aprovado' ? 'default' : a.decision === 'rejeitado' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {a.decision === 'pendente' && <Clock className="h-3 w-3 mr-1" />}
                          {a.decision === 'aprovado' && <CheckCircle className="h-3 w-3 mr-1" />}
                          {a.decision === 'rejeitado' && <XCircle className="h-3 w-3 mr-1" />}
                          {a.user_name} ({a.user_role})
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Action buttons */}
                  {(canVote || sindicoCanVote) && (
                    <div className="space-y-2">
                      {sindicoCanVote && !canVote && (
                        <p className="text-xs text-amber-600 font-medium">⚖️ Voto de minerva necessário</p>
                      )}

                      {rejectId === nf.id ? (
                        <div className="space-y-2">
                          <Label className="text-xs">Justificativa da rejeição *</Label>
                          <Textarea
                            value={justification}
                            onChange={(e) => setJustification(e.target.value)}
                            placeholder="Informe o motivo da rejeição..."
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleVote(nf, 'rejeitado')}
                              disabled={processing}
                            >
                              {processing ? 'Processando...' : 'Confirmar Rejeição'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setRejectId(null); setJustification(''); }}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleVote(nf, 'aprovado')}
                            disabled={processing || (nf.quotaExceeded && !quotaAcknowledged[nf.id])}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setRejectId(nf.id)}
                            disabled={processing || (nf.quotaExceeded && !quotaAcknowledged[nf.id])}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Rejeitar
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
