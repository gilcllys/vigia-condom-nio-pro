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
import { ArrowLeft, FileDown, Send, Package } from 'lucide-react';

import { OSStatusActions } from '@/components/os/OSStatusActions';
import { OSInfoCard } from '@/components/os/OSInfoCard';
import { OSExecutionCard } from '@/components/os/OSExecutionCard';
import { OSPhotosCard } from '@/components/os/OSPhotosCard';
import { OSTimelineCard } from '@/components/os/OSTimelineCard';
import { OSMaterialsCard } from '@/components/os/OSMaterialsCard';
import { generateOSPdf } from '@/components/os/os-pdf';
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
  created_by: string;
  created_at: string;
  executor_type: string | null;
  executor_name: string | null;
  execution_notes: string | null;
  is_emergency: boolean;
  emergency_justification: string | null;
  started_at: string | null;
  finished_at: string | null;
  provider_id: string | null;
  ticket_id: string | null;
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
  const [stockDialogOpen, setStockDialogOpen] = useState(false);

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
  const canFinalize = isSindico || isAdmin || isSubSindico;
  const canCancel = canCriticalActions;

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

    if (newStatus === 'FINALIZADA') {
      const { data: canFinalize, error: fnError } = await supabase
        .schema('nfe_vigia').rpc('can_finalize_service_order', { p_service_order_id: order.id });
      if (fnError || !canFinalize) {
        toast({ title: 'Não é possível finalizar esta OS', description: fnError?.message ?? 'Verifique os requisitos.', variant: 'destructive' });
        setActionLoading(false);
        return;
      }
    }

    const { error } = await supabase.schema('nfe_vigia').from('service_orders').update({ status: newStatus }).eq('id', order.id);

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

    // Delete existing final approvals before re-sending (idempotent)
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

  const handleGeneratePdf = async () => {
    if (!order) return;
    setPdfLoading(true);
    try {
      const photosWithUrls = documents
        .map((d) => ({ photo_type: d.photo_type, signedUrl: photoUrls[d.id] }))
        .filter((p) => !!p.signedUrl);

      await generateOSPdf(order, activities, materials, condoName, photosWithUrls);
    } catch (e) {
      console.error('PDF generation error:', e);
      toast({ title: 'Erro ao gerar PDF', variant: 'destructive' });
    }
    setPdfLoading(false);
  };

  const canEditExecution = (canCriticalActions || isZelador) && (order?.status === 'EM_EXECUCAO' || order?.status === 'AGUARDANDO_APROVACAO');
  const canUploadFinalPhotos = (canCriticalActions || isZelador) && (order?.status === 'EM_EXECUCAO' || order?.status === 'AGUARDANDO_APROVACAO');

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
          {/* Send for final approval button */}
          {canCriticalActions && order.status === 'AGUARDANDO_APROVACAO' && (
            <Button size="sm" variant="outline" onClick={handleSendFinalApproval} disabled={sendingFinalApproval}>
              <Send className="h-4 w-4 mr-1" />
              {sendingFinalApproval ? 'Enviando...' : 'Aprovação Final'}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleGeneratePdf} disabled={pdfLoading}>
            <FileDown className="h-4 w-4 mr-1" />
            {pdfLoading ? 'Gerando...' : 'PDF'}
          </Button>
          <Badge variant={statusVariant(order.status)} className="text-sm px-3 py-1">
            {statusLabel[order.status] ?? order.status}
          </Badge>
        </div>
      </div>

      {/* Status Actions */}
      <OSStatusActions
        status={order.status}
        canCriticalActions={canCriticalActions}
        isZelador={isZelador}
        canApprove={canApprove}
        canFinalize={canFinalize}
        canCancel={canCancel}
        actionLoading={actionLoading}
        onChangeStatus={changeStatus}
      />

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

      {/* Budgets */}
      {condoId && (
        <OSBudgetsCard
          orderId={order.id}
          condoId={condoId}
          isEmergency={order.is_emergency}
          isSindico={isSindico}
          isAdmin={isAdmin}
          canCriticalActions={canCriticalActions}
          status={order.status}
          onSubmittedForApproval={fetchAll}
        />
      )}

      {/* Budget Approval */}
      {condoId && (
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

      {/* Final Approval */}
      {condoId && (
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
