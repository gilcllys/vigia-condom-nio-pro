import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { getPublicStorageUrl } from '@/lib/storage-url';
import { useCondo } from '@/contexts/CondoContext';
import { useAuth } from '@/contexts/AuthContext';
import { useFinancialConfig, getRequiredRoles } from '@/hooks/useFinancialConfig';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowLeft, FileText, DollarSign, Clock, User, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { differenceInHours, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

interface FiscalDoc {
  id: string;
  number: string | null;
  amount: number | null;
  supplier: string | null;
  issue_date: string | null;
  document_type: string | null;
  file_url: string | null;
  created_at: string;
  status: string;
}

interface ApprovalVote {
  id: string;
  approver_role: string;
  decision: string;
  voted_at: string | null;
  justification: string | null;
  approver_user_id: string;
}

const isFinalDecision = (decision: string) => decision === 'aprovado' || decision === 'rejeitado';

function getDeadlineInfo(createdAt: string, deadlineHours: number | null): { label: string; expired: boolean; hoursLeft: number } {
  if (!deadlineHours) return { label: '—', expired: false, hoursLeft: Infinity };
  const deadline = new Date(new Date(createdAt).getTime() + deadlineHours * 60 * 60 * 1000);
  const hoursLeft = differenceInHours(deadline, new Date());
  if (hoursLeft <= 0) return { label: 'Prazo expirado', expired: true, hoursLeft: 0 };
  if (hoursLeft < 24) return { label: `${hoursLeft}h restantes`, expired: false, hoursLeft };
  const days = Math.ceil(hoursLeft / 24);
  return { label: `${days} dia${days > 1 ? 's' : ''} restante${days > 1 ? 's' : ''}`, expired: false, hoursLeft };
}

export default function AprovacaoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { condoId, role: contextRole } = useCondo();
  const { config } = useFinancialConfig(condoId);

  const [doc, setDoc] = useState<FiscalDoc | null>(null);
  const [votes, setVotes] = useState<ApprovalVote[]>([]);
  const [internalUserId, setInternalUserId] = useState<string | null>(null);
  const [userCondoRole, setUserCondoRole] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // The effective role: prefer direct user_condos lookup, fallback to context
  const role = userCondoRole || contextRole;

  // Get internal user id AND their role from user_condos for the active condo
  useEffect(() => {
    if (!user || !condoId) return;

    const fetchUserInfo = async () => {
      // Fetch internal user id
      const userRes = await apiFetch(`/api/data/users/?auth_user_id=${user.id}`);
      if (!userRes.ok) return;
      const userData = await userRes.json();
      const userList = Array.isArray(userData) ? userData : userData.results ?? [];
      const userId = userList[0]?.id ?? null;
      setInternalUserId(userId);

      // Fetch role from user_condos scoped to the active condo
      if (userId) {
        const ucRes = await apiFetch(`/api/data/user-condos/?user_id=${userId}&condo_id=${condoId}`);
        if (ucRes.ok) {
          const ucData = await ucRes.json();
          const ucList = Array.isArray(ucData) ? ucData : ucData.results ?? [];
          if (ucList[0]?.role) setUserCondoRole(ucList[0].role);
        }
      }
    };

    fetchUserInfo();
  }, [user, condoId]);

  // Fetch document and votes
  useEffect(() => {
    if (!id || !condoId) return;

    const fetchAll = async () => {
      setLoading(true);
      const [docRes, votesRes] = await Promise.all([
        apiFetch(`/api/data/fiscal-documents/${id}/`),
        apiFetch(`/api/data/approvals/?fiscal_document_id=${id}&ordering=voted_at`),
      ]);

      if (docRes.ok) {
        const docData = await docRes.json();
        setDoc(docData as FiscalDoc);
      }
      if (votesRes.ok) {
        const votesData = await votesRes.json();
        const votesList = Array.isArray(votesData) ? votesData : votesData.results ?? [];
        setVotes(
          (votesList as ApprovalVote[]).map((vote) => ({
            ...vote,
            decision: (!vote.decision || (vote.decision !== 'aprovado' && vote.decision !== 'rejeitado'))
              ? 'pendente'
              : vote.decision,
          }))
        );
      }
      setLoading(false);
    };

    fetchAll();
  }, [id, condoId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/aprovacoes')} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <p className="text-muted-foreground text-center py-12">Documento não encontrado.</p>
      </div>
    );
  }

  const requiredRoles = getRequiredRoles(doc.amount ?? 0, config);
  const deadlineHours = config?.approval_deadline_hours ?? null;
  const deadline = getDeadlineInfo(doc.created_at, deadlineHours);

  const myApproverRole = role === 'ADMIN' ? 'SINDICO' : role;
  const myVotes = votes.filter(v => v.approver_user_id === internalUserId);
  const myVote = myVotes.find(v => isFinalDecision(v.decision)) ?? myVotes[0];
  // Also check if the role's slot already has a final decision (any user of this role voted)
  const roleAlreadyDecided = myApproverRole
    ? votes.some(v => v.approver_role === myApproverRole && isFinalDecision(v.decision))
    : false;
  const alreadyVoted = (myVote ? isFinalDecision(myVote.decision) : false) || roleAlreadyDecided;

  // Check if the user's role is required for this document
  const roleIsRequired = role ? requiredRoles.includes(role) : false;

  // Síndico or ADMIN can act as síndico
  const isSindico = role === 'SINDICO' || role === 'ADMIN';

  // Síndico can only act after lower tiers have decided or deadline expired
  let sindicoBlocked = false;
  let sindicoBlockedReason = '';

  if (isSindico && requiredRoles.includes('SINDICO')) {
    const lowerTiers = requiredRoles.filter(r => r !== 'SINDICO');
    const allLowerDecided = lowerTiers.every(tier =>
      votes.some(v => v.approver_role === tier && isFinalDecision(v.decision))
    );

    if (!allLowerDecided && !deadline.expired) {
      sindicoBlocked = true;
      sindicoBlockedReason = 'Aguardando decisão dos aprovadores anteriores';
    }
  }

  const canAct = doc.status === 'PENDENTE' && !alreadyVoted && (roleIsRequired || isSindico) && !sindicoBlocked;

  const handleDecision = async (decision: 'aprovado' | 'rejeitado') => {
    if (!internalUserId || !condoId || !id || !role) return;
    setSubmitting(true);

    const votePayload = {
      fiscal_document_id: id,
      condo_id: condoId,
      approver_user_id: internalUserId,
      approver_role: role === 'ADMIN' ? 'SINDICO' : role,
      decision,
      justification: justification.trim() || null,
      voted_at: new Date().toISOString(),
    };

    const existingPendingVote = votes.find(v => v.approver_user_id === internalUserId);

    try {
      const res = existingPendingVote
        ? await apiFetch(`/api/data/approvals/${existingPendingVote.id}/`, { method: 'PATCH', body: JSON.stringify(votePayload) })
        : await apiFetch('/api/data/approvals/', { method: 'POST', body: JSON.stringify(votePayload) });

      if (!res.ok) {
        toast.error('Erro ao registrar decisão.');
        setSubmitting(false);
        return;
      }

      // Check if all required votes are in to auto-update status
      const allVotesRes = await apiFetch(`/api/data/approvals/?fiscal_document_id=${id}`);
      const allVotesData = allVotesRes.ok ? await allVotesRes.json() : [];
      const allVotes = Array.isArray(allVotesData) ? allVotesData : allVotesData.results ?? [];

      if (decision === 'rejeitado') {
        await apiFetch(`/api/data/fiscal-documents/${id}/`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'CANCELADO' }),
        });

        // Reverse any ENTRADA stock movements linked to this NF (safety net)
        const movementsRes = await apiFetch(`/api/data/stock-movements/?fiscal_document_id=${id}&move_type=ENTRADA`);
        const movementsData = movementsRes.ok ? await movementsRes.json() : [];
        const existingMovements = Array.isArray(movementsData) ? movementsData : movementsData.results ?? [];

        if (existingMovements.length > 0) {
          for (const mv of existingMovements) {
            await apiFetch('/api/data/stock-movements/', {
              method: 'POST',
              body: JSON.stringify({
                condo_id: condoId,
                item_id: mv.item_id,
                move_type: 'SAIDA',
                qty: mv.qty,
                fiscal_document_id: id,
              }),
            });
          }
        }

        toast.success('Documento rejeitado.');
      } else {
        const allApproved = requiredRoles.every(r =>
          (allVotes as any[]).some(v => v.approver_role === r && v.decision === 'aprovado')
        );
        if (allApproved) {
          await apiFetch(`/api/data/fiscal-documents/${id}/`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'PROCESSADO' }),
          });

          // Create ENTRADA stock movements for each item linked to this NF
          const nfItemsRes = await apiFetch(`/api/data/fiscal-documents/${id}/items/`);
          const nfItemsData = nfItemsRes.ok ? await nfItemsRes.json() : [];
          const nfItems = Array.isArray(nfItemsData) ? nfItemsData : nfItemsData.results ?? [];

          if (nfItems.length > 0) {
            for (const item of nfItems) {
              await apiFetch('/api/data/stock-movements/', {
                method: 'POST',
                body: JSON.stringify({
                  condo_id: condoId,
                  item_id: item.stock_item_id,
                  move_type: 'ENTRADA',
                  qty: item.qty,
                  fiscal_document_id: id,
                }),
              });
            }
          }

          toast.success('Documento aprovado por todos os níveis.');
        } else {
          toast.success('Voto registrado com sucesso.');
        }
      }
    } catch {
      toast.error('Erro ao registrar decisão.');
    }

    setSubmitting(false);
    navigate('/aprovacoes');
  };

  // Determine if we should show the action section
  const showActionSection = doc.status === 'PENDENTE' && !alreadyVoted && (roleIsRequired || isSindico);

  return (
    <div className="space-y-6 max-w-4xl">
      <Button variant="ghost" onClick={() => navigate('/aprovacoes')} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Voltar às Aprovações
      </Button>

      {/* Document info — visible to ALL roles */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            NF #{doc.number ?? '—'}
          </h1>
          <Badge variant={doc.status === 'PENDENTE' ? 'default' : doc.status === 'PROCESSADO' ? 'secondary' : 'destructive'}>
            {{ PENDENTE: 'Pendente', PROCESSADO: 'Aprovado', CANCELADO: 'Cancelado' }[doc.status] ?? doc.status}
          </Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Valor:</span>
            <span className="font-semibold text-foreground">
              {doc.amount != null ? `R$ ${doc.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Fornecedor:</span>
            <span className="font-semibold text-foreground">{doc.supplier ?? '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Prazo:</span>
            <span className={`font-semibold ${deadline.expired ? 'text-destructive' : 'text-foreground'}`}>{deadline.label}</span>
          </div>
          {doc.issue_date && (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Emissão:</span>
              <span className="font-semibold text-foreground">{format(new Date(doc.issue_date), 'dd/MM/yyyy', { locale: ptBR })}</span>
            </div>
          )}
          {doc.document_type && (
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Tipo:</span>
              <span className="font-semibold text-foreground">{doc.document_type}</span>
            </div>
          )}
        </div>

        {doc.file_url && (
          <a href={getPublicStorageUrl(doc.file_url)} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
            Ver documento anexado →
          </a>
        )}
      </div>

      {/* Approval levels */}
      <div className="glass-card p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Níveis de Aprovação</h2>
        <div className="space-y-3">
          {requiredRoles.map((r) => {
            const roleVotes = votes.filter(v => v.approver_role === r);
            const vote = roleVotes.find(v => isFinalDecision(v.decision)) ?? roleVotes[0];
            return (
              <div key={r} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs">{r === 'SUBSINDICO' ? 'SUBSÍNDICO' : r}</Badge>
                  {vote ? (
                    <div className="flex items-center gap-2 text-sm">
                      {vote.decision === 'aprovado' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      {vote.decision === 'rejeitado' && <XCircle className="h-4 w-4 text-destructive" />}
                      {vote.decision === 'pendente' && <Clock className="h-3 w-3 text-muted-foreground" />}

                      <span className={
                        vote.decision === 'aprovado'
                          ? 'text-emerald-600'
                          : vote.decision === 'rejeitado'
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                      }>
                        {vote.decision === 'aprovado' ? 'Aprovado' : vote.decision === 'rejeitado' ? 'Rejeitado' : 'Aguardando'}
                      </span>

                      {vote.voted_at && isFinalDecision(vote.decision) && (() => {
                        const d = new Date(vote.voted_at);
                        return !isNaN(d.getTime()) ? (
                          <span className="text-muted-foreground">
                            em {format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Aguardando
                    </span>
                  )}
                </div>
                {vote?.justification && (
                  <span className="text-xs text-muted-foreground italic max-w-[200px] truncate">"{vote.justification}"</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action section — role-aware */}
      {showActionSection && (
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-base font-semibold text-foreground">Sua Decisão</h2>

          <Textarea
            placeholder="Observação (opcional)"
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={3}
          />

          <div className="flex gap-3">
            {sindicoBlocked ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button disabled className="gap-2">
                      <CheckCircle2 className="h-4 w-4" /> Aprovar
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {sindicoBlockedReason}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button
                onClick={() => handleDecision('aprovado')}
                disabled={submitting || !canAct}
                className="gap-2"
              >
                <CheckCircle2 className="h-4 w-4" /> Aprovar
              </Button>
            )}

            {sindicoBlocked ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="destructive" disabled className="gap-2">
                      <XCircle className="h-4 w-4" /> Rejeitar
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {sindicoBlockedReason}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="destructive"
                onClick={() => handleDecision('rejeitado')}
                disabled={submitting || !canAct}
                className="gap-2"
              >
                <XCircle className="h-4 w-4" /> Rejeitar
              </Button>
            )}
          </div>
        </div>
      )}

      {alreadyVoted && (
        <div className="glass-card p-6 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 mx-auto mb-2 text-green-500" />
          Você já registrou seu voto neste documento.
        </div>
      )}
    </div>
  );
}
