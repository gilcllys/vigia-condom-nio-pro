import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCondo } from '@/contexts/CondoContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Clock, Shield } from 'lucide-react';

interface Approval {
  id: string;
  user_id: string;
  decision: string;
  voted_at: string | null;
  justification: string | null;
  user_name?: string;
  user_role?: string;
}

interface PendingNF {
  id: string;
  number: string;
  supplier: string;
  amount: number;
  issue_date: string | null;
  status: string;
  file_url: string | null;
  approvals: Approval[];
}

export default function ApprovalsTab() {
  const { condoId, role } = useCondo();
  const { user } = useAuth();
  const { toast } = useToast();
  const canView = ['SUBSINDICO', 'CONSELHO', 'SINDICO', 'ADMIN'].includes(role ?? '');

  const [nfs, setNfs] = useState<PendingNF[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [processing, setProcessing] = useState(false);
  const [internalUserId, setInternalUserId] = useState<string | null>(null);

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

    if (error) {
      console.error('Error fetching NFs:', error);
      setLoading(false);
      return;
    }

    if (!docs || docs.length === 0) {
      setNfs([]);
      setLoading(false);
      return;
    }

    // Fetch approvals for all docs
    const docIds = docs.map((d: any) => d.id);
    const { data: approvals } = await supabase
      .from('fiscal_document_approvals')
      .select('id, fiscal_document_id, user_id, decision, voted_at, justification')
      .in('fiscal_document_id', docIds);

    // Fetch user names and roles for approvers
    const userIds = [...new Set((approvals ?? []).map((a: any) => a.user_id))];
    let userMap: Record<string, { name: string; role: string }> = {};

    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', userIds);

      const { data: userCondos } = await supabase
        .from('user_condos')
        .select('user_id, role')
        .eq('condo_id', condoId)
        .in('user_id', userIds);

      (users ?? []).forEach((u: any) => {
        const uc = (userCondos ?? []).find((uc: any) => uc.user_id === u.id);
        userMap[u.id] = { name: u.full_name || 'Usuário', role: uc?.role || '' };
      });
    }

    const merged: PendingNF[] = docs.map((doc: any) => ({
      ...doc,
      approvals: (approvals ?? [])
        .filter((a: any) => a.fiscal_document_id === doc.id)
        .map((a: any) => ({
          ...a,
          user_name: userMap[a.user_id]?.name || 'Usuário',
          user_role: userMap[a.user_id]?.role || '',
        })),
    }));

    setNfs(merged);
    setLoading(false);
  };

  useEffect(() => {
    fetchNFs();
  }, [condoId, canView]);

  const handleVote = async (nf: PendingNF, decision: 'aprovado' | 'rejeitado') => {
    if (!internalUserId || !condoId) return;

    if (decision === 'rejeitado' && !justification.trim()) {
      toast({ title: 'Justificativa obrigatória ao rejeitar', variant: 'destructive' });
      return;
    }

    setProcessing(true);

    // Insert approval record
    const { error: approvalError } = await supabase
      .from('fiscal_document_approvals')
      .insert({
        fiscal_document_id: nf.id,
        user_id: internalUserId,
        condo_id: condoId,
        decision,
        voted_at: new Date().toISOString(),
        justification: decision === 'rejeitado' ? justification.trim() : null,
      });

    if (approvalError) {
      toast({ title: 'Erro ao registrar voto', description: approvalError.message, variant: 'destructive' });
      setProcessing(false);
      return;
    }

    // Recalculate approval status
    const { data: allApprovals } = await supabase
      .from('fiscal_document_approvals')
      .select('user_id, decision')
      .eq('fiscal_document_id', nf.id);

    // Get roles of approvers
    const approverIds = (allApprovals ?? []).map((a: any) => a.user_id);
    const { data: approverCondos } = await supabase
      .from('user_condos')
      .select('user_id, role')
      .eq('condo_id', condoId)
      .in('user_id', approverIds);

    const roleMap: Record<string, string> = {};
    (approverCondos ?? []).forEach((uc: any) => {
      roleMap[uc.user_id] = uc.role;
    });

    const approvalsWithRoles = (allApprovals ?? []).map((a: any) => ({
      ...a,
      role: roleMap[a.user_id] || '',
    }));

    const subsindicoVote = approvalsWithRoles.find((a: any) => a.role === 'SUBSINDICO');
    const conselhoVotes = approvalsWithRoles.filter((a: any) => a.role === 'CONSELHO');

    const allVoted = approvalsWithRoles.every((a: any) => a.decision !== 'pendente');
    const hasRejection = approvalsWithRoles.some((a: any) => a.decision === 'rejeitado');

    let newStatus = 'pendente';

    if (role === 'SINDICO' || role === 'ADMIN') {
      // Sindico vote of minerva
      if (decision === 'aprovado') {
        newStatus = 'aprovado';
        await supabase
          .from('fiscal_documents')
          .update({ status: 'PROCESSADO' })
          .eq('id', nf.id);
      } else {
        newStatus = 'rejeitado';
        await supabase
          .from('fiscal_documents')
          .update({ status: 'CANCELADO' })
          .eq('id', nf.id);
      }
    } else if (allVoted) {
      if (hasRejection) {
        // Goes to sindico for minerva vote - keep as pendente
        newStatus = 'pendente';
      } else {
        // All approved
        const subApproved = subsindicoVote?.decision === 'aprovado';
        const conselhoApproved = conselhoVotes.filter((c: any) => c.decision === 'aprovado').length;
        const conselhoMajority = conselhoApproved > conselhoVotes.length / 2;

        if (subApproved && conselhoMajority) {
          newStatus = 'aprovado';
          await supabase
            .from('fiscal_documents')
            .update({ status: 'PROCESSADO' })
            .eq('id', nf.id);
        }
      }
    }

    const statusMsg = newStatus === 'aprovado'
      ? 'NF aprovada!'
      : newStatus === 'rejeitado'
        ? 'NF rejeitada.'
        : hasRejection
          ? 'Voto registrado. Aguardando decisão do síndico (voto de minerva).'
          : 'Voto registrado.';

    toast({ title: statusMsg });
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
              const myApproval = nf.approvals.find(a => a.user_id === internalUserId);
              const canVote = myApproval && myApproval.decision === 'pendente';
              const isSindico = role === 'SINDICO' || role === 'ADMIN';
              const hasRejection = nf.approvals.some(a => a.decision === 'rejeitado');
              const allNonSindicoVoted = nf.approvals
                .filter(a => !['SINDICO', 'ADMIN'].includes(a.user_role ?? ''))
                .every(a => a.decision !== 'pendente');
              const sindicoCanVote = isSindico && hasRejection && allNonSindicoVoted;

              return (
                <div key={nf.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">NF {nf.number}</p>
                      <p className="text-sm text-muted-foreground">{nf.supplier}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">R$ {nf.amount?.toFixed(2)}</p>
                      {nf.issue_date && (
                        <p className="text-xs text-muted-foreground">{new Date(nf.issue_date).toLocaleDateString('pt-BR')}</p>
                      )}
                    </div>
                  </div>

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
                            disabled={processing}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setRejectId(nf.id)}
                            disabled={processing}
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
