import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useCondo } from '@/contexts/CondoContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/activity-log';
import { logSOActivity } from '@/lib/so-activity-log';
import { ArrowLeft, FileDown, Send, Package, Play, CheckCircle2, XCircle } from 'lucide-react';

import { OSInfoCard } from '@/components/os/OSInfoCard';
import { OSExecutionCard } from '@/components/os/OSExecutionCard';
import { OSPhotosCard } from '@/components/os/OSPhotosCard';
import { OSTimelineCard } from '@/components/os/OSTimelineCard';
import { OSMaterialsCard } from '@/components/os/OSMaterialsCard';
import { generateOSPdfBlob } from '@/components/os/os-pdf';
import { OSFiscalDocsCard } from '@/components/os/OSFiscalDocsCard';
import { OSBudgetsCard } from '@/components/os/OSBudgetsCard';
import { OSApprovalCard } from '@/components/os/OSApprovalCard';
import { OSStockMaterialDialog } from '@/components/os/OSStockMaterialDialog';

interface ServiceOrderDetail {
  id: string;
  condo_id: string;
  title: string;
  description: string | null;
  location: string | null;
  status: string;
  priority: string | null;
  executor_type: string | null;
  created_by: string;
  created_at: string;
  executor_name: string | null;
  execution_notes: string | null;
  is_emergency: boolean;
  emergency_justification: string | null;
  started_at: string | null;
  finished_at: string | null;
  provider_id: string | null;
  ticket_id: string | null;
  final_pdf_url: string | null;
}

interface SOActivity {
  id: string;
  activity_type: string;
  description: string | null;
  user_id: string;
  created_at: string;
}

interface SOMaterial {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  cost: number | null;
}

interface SODocument {
  id: string;
  photo_type: string;
  file_url: string;
  file_name?: string | null;
  observation?: string | null;
  created_at: string;
}

const statusLabel: Record<string, string> = {
  ABERTA: 'Aberta',
  EM_EXECUCAO: 'Em Execução',
  AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
};

const statusVariant = (s: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (s) {
    case 'ABERTA': return 'default';
    case 'EM_EXECUCAO': return 'secondary';
    case 'AGUARDANDO_APROVACAO': return 'outline';
    case 'FINALIZADA': return 'secondary';
    case 'CANCELADA': return 'destructive';
    default: return 'outline';
  }
};

export default function OrdemServicoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { condoId, condoName, role } = useCondo();
  const { toast } = useToast();

  const [order, setOrder] = useState<ServiceOrderDetail | null>(null);
  const [activities, setActivities] = useState<SOActivity[]>([]);
  const [materials, setMaterials] = useState<SOMaterial[]>([]);
  const [documents, setDocuments] = useState<SODocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [sendingFinalApproval, setSendingFinalApproval] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [orcamentoApprovals, setOrcamentoApprovals] = useState<any[]>([]);
  const [finalApprovals, setFinalApprovals] = useState<any[]>([]);

  const fetchAll = async () => {
    if (!id || !condoId) return;
    setLoading(true);

    const [orderRes, activitiesRes, materialsRes, docsRes] = await Promise.all([
      supabase.schema('nfe_vigia').from('service_orders').select('*').eq('id', id).eq('condo_id', condoId).single(),
      supabase.schema('nfe_vigia').from('service_order_activities').select('*').eq('service_order_id', id).order('created_at', { ascending: false }),
      supabase.schema('nfe_vigia').from('service_order_materials').select('*').eq('service_order_id', id),
      supabase.schema('nfe_vigia').from('service_order_photos').select('*').eq('service_order_id', id).order('created_at', { ascending: false }),
    ]);

    if (orderRes.error || !orderRes.data) {
      toast({ title: 'Ordem de serviço não encontrada', variant: 'destructive' });
      navigate('/ordens-servico', { replace: true });
      return;
    }

    setOrder(orderRes.data);
    setActivities(activitiesRes.data ?? []);
    setMaterials(materialsRes.data ?? []);
    setDocuments(docsRes.data ?? []);

    // Fetch approval records to determine phase
    const [orcRes, finalRes] = await Promise.all([
      supabase.schema('nfe_vigia').from('approvals').select('*').eq('service_order_id', id).eq('approval_type', 'ORCAMENTO'),
      supabase.schema('nfe_vigia').from('approvals').select('*').eq('service_order_id', id).eq('approval_type', 'FINAL'),
    ]);
    setOrcamentoApprovals(orcRes.data ?? []);
    setFinalApprovals(finalRes.data ?? []);

    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, [id, condoId]);

  // Permissions
  const [canCriticalActions, setCanCriticalActions] = useState(false);
  const isSindico = role === 'SINDICO';
  const isAdmin = role === 'ADMIN';
  const isZelador = role === 'ZELADOR';
  const isSubSindico = role === 'SUBSINDICO';
  const isConselho = role === 'CONSELHO';
  const canApprove = isSindico || isAdmin || isSubSindico || isConselho;

  useEffect(() => {
    const checkCritical = async () => {
      const { data } = await supabase.schema('nfe_vigia').rpc('is_current_user_sindico_aal2');
      setCanCriticalActions(!!data);
    };
    checkCritical();
  }, [condoId]);

  // Signed URLs for photos
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const generateSignedUrls = async () => {
      const urls: Record<string, string> = {};
      for (const doc of documents) {
        if (!doc.file_url) continue;
        const { data, error } = await supabase.storage.from('service-order-photos').createSignedUrl(doc.file_url, 3600);
        if (data && !error) urls[doc.id] = data.signedUrl;
      }
      setPhotoUrls(urls);
    };
    if (documents.length > 0) generateSignedUrls();
  }, [documents]);

  const changeStatus = async (newStatus: string) => {
    if (!order || !condoId) return;
    setActionLoading(true);

    const updatePayload: Record<string, any> = { status: newStatus };
    if (newStatus === 'EM_EXECUCAO') updatePayload.started_at = new Date().toISOString();

    const { error } = await supabase.schema('nfe_vigia').from('service_orders').update(updatePayload).eq('id', order.id);

    if (error) {
      toast({ title: 'Erro ao alterar status', description: 'Não foi possível atualizar. Tente novamente.', variant: 'destructive' });
    } else {
      const soActionMap: Record<string, import('@/lib/so-activity-log').SOAction> = {
        EM_EXECUCAO: 'EXECUCAO_INICIADA',
        AGUARDANDO_APROVACAO: 'ENVIADA_APROVACAO',
        FINALIZADA: 'OS_FINALIZADA',
        CANCELADA: 'OS_CANCELADA',
      };
      const soAction = soActionMap[newStatus];
      if (soAction) await logSOActivity({ serviceOrderId: order.id, action: soAction });

      await logActivity({
        condoId,
        action: 'update',
        entity: 'service_order' as any,
        entityId: order.id,
        description: `OS "${order.title}" alterada para ${statusLabel[newStatus] ?? newStatus}`,
      });
      toast({ title: `Status alterado para ${statusLabel[newStatus]}` });
      fetchAll();
    }
    setActionLoading(false);
  };

  const handleSendFinalApproval = async () => {
    if (!order || !condoId) return;

    // Require final photo before sending for final approval
    const hasFinalPhoto = documents.some(d => d.photo_type === 'EXECUCAO_FINAL');
    if (!hasFinalPhoto) {
      toast({ title: 'Foto final obrigatória', description: 'Adicione ao menos uma foto da execução final antes de enviar para aprovação final.', variant: 'destructive' });
      return;
    }

    setSendingFinalApproval(true);

    const { data: config } = await supabase
      .schema('nfe_vigia')
      .from('condo_financial_config')
      .select('approval_deadline_hours')
      .eq('condo_id', condoId)
      .maybeSingle();

    const deadlineHours = config?.approval_deadline_hours ?? 48;

    const { data: approvers } = await supabase
      .schema('nfe_vigia')
      .from('user_condos')
      .select('user_id, role')
      .eq('condo_id', condoId)
      .in('role', ['SUBSINDICO', 'CONSELHO'])
      .eq('status', 'ativo');

    if (!approvers || approvers.length === 0) {
      toast({ title: 'Nenhum aprovador encontrado', variant: 'destructive' });
      setSendingFinalApproval(false);
      return;
    }

    const expiresAt = new Date(Date.now() + deadlineHours * 60 * 60 * 1000).toISOString();

    await supabase.schema('nfe_vigia').from('approvals')
      .delete()
      .eq('service_order_id', order.id)
      .eq('approval_type', 'FINAL');

    const records = approvers.map((a: any) => ({
      service_order_id: order.id,
      condo_id: condoId,
      approver_id: a.user_id,
      approver_role: a.role,
      approval_type: 'FINAL',
      decision: 'pendente',
      expires_at: expiresAt,
    }));

    const { error } = await supabase.schema('nfe_vigia').from('approvals').insert(records);

    if (error) {
      toast({ title: 'Erro ao enviar para aprovação final', variant: 'destructive' });
    } else {
      // Change status to AGUARDANDO_APROVACAO
      await supabase.schema('nfe_vigia').from('service_orders').update({ status: 'AGUARDANDO_APROVACAO' }).eq('id', order.id);
      await logSOActivity({
        serviceOrderId: order.id,
        action: 'APROVACAO_FINAL_ENVIADA',
        description: 'OS enviada para aprovação final — aguardando Subsíndico e Conselheiros',
      });
      toast({ title: 'OS enviada para aprovação final' });
      fetchAll();
    }
    setSendingFinalApproval(false);
  };

  const handleFinalizeWithPdf = async () => {
    if (!order || !condoId) return;
    setFinalizing(true);

    try {
      const photosWithUrls = documents
        .map((d) => ({ photo_type: d.photo_type, signedUrl: photoUrls[d.id], observation: d.observation }))
        .filter((p) => !!p.signedUrl);

      const pdfBlob = await generateOSPdfBlob(order, activities, materials, condoName, photosWithUrls, finalApprovals);

      // Upload PDF to Supabase Storage
      const pdfPath = `os-pdfs/${order.id}/OS-${order.id.slice(0, 8)}-final.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('service-order-photos')
        .upload(pdfPath, pdfBlob, { contentType: 'application/pdf', upsert: true });

      if (uploadError) {
        console.error('PDF upload error:', uploadError);
        toast({ title: 'Erro ao salvar PDF', description: uploadError.message, variant: 'destructive' });
        setFinalizing(false);
        return;
      }

      // Update service order: status FINALIZADA + final_pdf_url
      const { error: updateError } = await supabase.schema('nfe_vigia').from('service_orders').update({
        status: 'FINALIZADA',
        final_pdf_url: pdfPath,
        finished_at: new Date().toISOString(),
      }).eq('id', order.id);

      if (updateError) {
        toast({ title: 'Erro ao finalizar OS', variant: 'destructive' });
        setFinalizing(false);
        return;
      }

      await logSOActivity({ serviceOrderId: order.id, action: 'OS_FINALIZADA', description: 'OS finalizada com geração de PDF' });
      await logActivity({ condoId, action: 'update', entity: 'service_order' as any, entityId: order.id, description: `OS "${order.title}" finalizada` });

      // Download PDF for user
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `OS-${order.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: 'OS finalizada e PDF gerado com sucesso!' });
      fetchAll();
    } catch (e) {
      console.error('Finalize error:', e);
      toast({ title: 'Erro ao finalizar OS', variant: 'destructive' });
    }
    setFinalizing(false);
  };

  const handleGeneratePdf = async () => {
    if (!order) return;
    setPdfLoading(true);
    try {
      const photosWithUrls = documents
        .map((d) => ({ photo_type: d.photo_type, signedUrl: photoUrls[d.id], observation: d.observation }))
        .filter((p) => !!p.signedUrl);

      const blob = await generateOSPdfBlob(order, activities, materials, condoName, photosWithUrls, finalApprovals);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `OS-${order.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('PDF generation error:', e);
      toast({ title: 'Erro ao gerar PDF', variant: 'destructive' });
    }
    setPdfLoading(false);
  };

  const canEditExecution = (canCriticalActions || isZelador) && (order?.status === 'EM_EXECUCAO' || order?.status === 'AGUARDANDO_APROVACAO');
  const canUploadFinalPhotos = (canCriticalActions || isZelador) && (order?.status === 'EM_EXECUCAO' || order?.status === 'AGUARDANDO_APROVACAO');

  // Determine phase from approval records
  const hasPendingOrcamento = orcamentoApprovals.some(a => a.decision === 'pendente');
  const orcamentoAllApproved = orcamentoApprovals.length > 0 && orcamentoApprovals.every(a => a.decision === 'aprovado');
  const hasPendingFinal = finalApprovals.some(a => a.decision === 'pendente');
  const finalAllApproved = finalApprovals.length > 0 && finalApprovals.every(a => a.decision === 'aprovado');
  const finalAnyNonPending = finalApprovals.length > 0 && finalApprovals.every(a => a.decision !== 'pendente');

  // Show "Iniciar Execução" when:
  // - EQUIPE_INTERNA in ABERTA (no budget approval needed)
  // - PRESTADOR_EXTERNO in AGUARDANDO_APROVACAO and orcamento all approved
  const showIniciarExecucao = canCriticalActions && (
    (order?.executor_type === 'EQUIPE_INTERNA' && order?.status === 'ABERTA') ||
    (order?.executor_type === 'PRESTADOR_EXTERNO' && order?.status === 'AGUARDANDO_APROVACAO' && orcamentoAllApproved)
  );

  // Show "Enviar p/ Aprovação Final" when EM_EXECUCAO
  const showEnviarAprovacaoFinal = canCriticalActions && order?.status === 'EM_EXECUCAO';

  // Show "Finalizar e Criar PDF" when AGUARDANDO_APROVACAO + final approved (or minerva approved)
  const showFinalizarPdf = canCriticalActions && order?.status === 'AGUARDANDO_APROVACAO' &&
    finalApprovals.length > 0 && finalAnyNonPending &&
    (finalAllApproved || finalApprovals.some(a => a.is_minerva));

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/ordens-servico')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{order.title}</h1>
          <p className="text-sm text-muted-foreground">OS #{order.id.slice(0, 8)}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={handleGeneratePdf} disabled={pdfLoading}>
            <FileDown className="h-4 w-4 mr-1" />
            {pdfLoading ? 'Gerando...' : 'PDF'}
          </Button>
          <Badge variant={statusVariant(order.status)} className="text-sm px-3 py-1">
            {statusLabel[order.status] ?? order.status}
          </Badge>
        </div>
      </div>

      {/* Action buttons */}
      {order.status !== 'FINALIZADA' && order.status !== 'CANCELADA' && (
        <div className="flex flex-wrap gap-2">
          {/* Iniciar Execução */}
          {showIniciarExecucao && (
            <Button size="sm" variant="outline" onClick={() => changeStatus('EM_EXECUCAO')} disabled={actionLoading}>
              <Play className="h-4 w-4 mr-1" /> Iniciar Execução
            </Button>
          )}
          {/* Enviar p/ Aprovação Final */}
          {showEnviarAprovacaoFinal && (
            <Button size="sm" variant="outline" onClick={handleSendFinalApproval} disabled={sendingFinalApproval}>
              <Send className="h-4 w-4 mr-1" />
              {sendingFinalApproval ? 'Enviando...' : 'Enviar p/ Aprovação Final'}
            </Button>
          )}
          {/* Finalizar e Criar PDF */}
          {showFinalizarPdf && (
            <Button size="sm" onClick={handleFinalizeWithPdf} disabled={finalizing}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              {finalizing ? 'Finalizando...' : 'Finalizar e Criar PDF'}
            </Button>
          )}
          {/* Cancel */}
          {canCriticalActions && (
            <Button size="sm" variant="destructive" onClick={() => changeStatus('CANCELADA')} disabled={actionLoading}>
              <XCircle className="h-4 w-4 mr-1" /> Cancelar
            </Button>
          )}
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <OSInfoCard
          description={order.description}
          location={order.location}
          priority={order.priority}
          createdAt={order.created_at}
          createdBy={order.created_by}
          isEmergency={order.is_emergency}
          emergencyJustification={order.emergency_justification}
          startedAt={order.started_at}
          finishedAt={order.finished_at}
          providerId={order.provider_id}
          ticketId={order.ticket_id}
        />
        <OSExecutionCard
          orderId={order.id}
          status={order.status}
          executorType={order.executor_type}
          executorName={order.executor_name}
          executionNotes={order.execution_notes}
          startedAt={order.started_at}
          finishedAt={order.finished_at}
          canEdit={canEditExecution}
          onSaved={fetchAll}
        />
      </div>

      {/* Budgets — only for PRESTADOR_EXTERNO */}
      {condoId && order.executor_type !== 'EQUIPE_INTERNA' && (
        <OSBudgetsCard
          orderId={order.id}
          condoId={condoId}
          priority={order.priority ?? 'BAIXA'}
          executorType={order.executor_type}
          isSindico={isSindico}
          isAdmin={isAdmin}
          canCriticalActions={canCriticalActions}
          status={order.status}
          onSubmittedForApproval={fetchAll}
        />
      )}

      {/* Budget Approval — only if orcamento approvals exist */}
      {condoId && orcamentoApprovals.length > 0 && (
        <OSApprovalCard
          orderId={order.id}
          condoId={condoId}
          approvalType="ORCAMENTO"
          title="Aprovação de Orçamentos"
          isSindico={isSindico}
          canCriticalActions={canCriticalActions}
          onDecisionMade={fetchAll}
        />
      )}

      {/* Photos */}
      <OSPhotosCard
        orderId={order.id}
        photos={documents}
        photoUrls={photoUrls}
        canUploadFinalPhotos={canUploadFinalPhotos}
        onUploaded={fetchAll}
      />

      {/* Fiscal Documents */}
      {condoId && (
        <OSFiscalDocsCard
          orderId={order.id}
          condoId={condoId}
          canAttach={isSindico || isAdmin}
          canCriticalActions={canCriticalActions}
          onApprovalSent={fetchAll}
        />
      )}

      {/* NF Approval */}
      {condoId && (
        <OSApprovalCard
          orderId={order.id}
          condoId={condoId}
          approvalType="NF"
          title="Aprovação de Notas Fiscais"
          isSindico={isSindico}
          canCriticalActions={canCriticalActions}
          onDecisionMade={fetchAll}
        />
      )}

      {/* Final Approval — only if final approvals exist */}
      {condoId && finalApprovals.length > 0 && (
        <OSApprovalCard
          orderId={order.id}
          condoId={condoId}
          approvalType="FINAL"
          title="Aprovação Final"
          isSindico={isSindico}
          canCriticalActions={canCriticalActions}
          onDecisionMade={fetchAll}
        />
      )}

      {/* Timeline + Materials */}
      <div className="grid gap-4 lg:grid-cols-2">
        <OSTimelineCard activities={activities} />
        <div className="space-y-4">
          <OSMaterialsCard materials={materials} />
          {(isSindico || isAdmin || isZelador) && order.status === 'EM_EXECUCAO' && (
            <Button variant="outline" className="w-full gap-2" onClick={() => setStockDialogOpen(true)}>
              <Package className="h-4 w-4" />
              Adicionar Material do Almoxarifado
            </Button>
          )}
        </div>
      </div>

      {/* Stock Material Dialog */}
      <OSStockMaterialDialog
        open={stockDialogOpen}
        onOpenChange={setStockDialogOpen}
        orderId={order.id}
        onAdded={fetchAll}
      />
    </div>
  );
}
