import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { getPublicStorageUrl } from '@/lib/storage-url';
import { useCondo } from '@/contexts/CondoContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/activity-log';
import { sendApprovalEmails } from '@/lib/send-approval-email';
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
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [orcamentoApprovals, setOrcamentoApprovals] = useState<any[]>([]);
  const [finalApprovals, setFinalApprovals] = useState<any[]>([]);

  const fetchAll = async () => {
    if (!id || !condoId) return;
    setLoading(true);

    const [orderRes, activitiesRes, materialsRes, docsRes] = await Promise.all([
      apiFetch(`/api/data/service-orders/${id}/?condo_id=${condoId}`),
      apiFetch(`/api/data/service-orders/${id}/activities/?ordering=-created_at`),
      apiFetch(`/api/data/service-order-materials/?service_order_id=${id}`),
      apiFetch(`/api/data/service-orders/${id}/photos/?ordering=-created_at`),
    ]);

    if (!orderRes.ok) {
      toast({ title: 'Ordem de serviço não encontrada', variant: 'destructive' });
      navigate('/ordens-servico', { replace: true });
      return;
    }

    const orderData = await orderRes.json();
    setOrder(orderData);

    const activitiesData = activitiesRes.ok ? await activitiesRes.json() : [];
    setActivities(Array.isArray(activitiesData) ? activitiesData : activitiesData.results ?? []);

    const materialsData = materialsRes.ok ? await materialsRes.json() : [];
    setMaterials(Array.isArray(materialsData) ? materialsData : materialsData.results ?? []);

    const docsData = docsRes.ok ? await docsRes.json() : [];
    setDocuments(Array.isArray(docsData) ? docsData : docsData.results ?? []);

    const [orcRes, finalRes] = await Promise.all([
      apiFetch(`/api/data/os-approvals/?service_order_id=${id}&approval_type=ORCAMENTO`),
      apiFetch(`/api/data/os-approvals/?service_order_id=${id}&approval_type=FINAL`),
    ]);

    const orcData = orcRes.ok ? await orcRes.json() : [];
    setOrcamentoApprovals(Array.isArray(orcData) ? orcData : orcData.results ?? []);

    const finalData = finalRes.ok ? await finalRes.json() : [];
    setFinalApprovals(Array.isArray(finalData) ? finalData : finalData.results ?? []);

    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, [id, condoId]);

  const changeStatus = async (newStatus: string) => {
    if (!order || !condoId) return;
    setActionLoading(true);
    const res = await apiFetch(`/api/data/service-orders/${order.id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      toast({ title: `Status alterado para ${statusLabel[newStatus]}` });
      fetchAll();
    }
    setActionLoading(false);
  };

  // Photo URLs using getPublicStorageUrl
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const generateUrls = () => {
      const urls: Record<string, string> = {};
      for (const doc of documents) {
        if (!doc.file_url) continue;
        urls[doc.id] = getPublicStorageUrl(doc.file_url);
      }
      setPhotoUrls(urls);
    };
    if (documents.length > 0) generateUrls();
  }, [documents]);

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

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!order) return null;

  const isSindico = role === 'SINDICO';
  const isAdmin = role === 'ADMIN';
  const isZelador = role === 'ZELADOR';
  const canEditExecution = (isSindico || isAdmin || isZelador) && (order.status === 'EM_EXECUCAO' || order.status === 'AGUARDANDO_APROVACAO');
  const canUploadFinalPhotos = (isSindico || isAdmin || isZelador) && (order.status === 'EM_EXECUCAO' || order.status === 'AGUARDANDO_APROVACAO');

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
          orderTitle={order.title}
          condoId={condoId}
          priority={order.priority ?? 'BAIXA'}
          executorType={order.executor_type}
          isSindico={isSindico}
          isAdmin={isAdmin}
          canCriticalActions={isSindico || isAdmin}
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
          canCriticalActions={isSindico || isAdmin}
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
          canCriticalActions={isSindico || isAdmin}
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
          canCriticalActions={isSindico || isAdmin}
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
          canCriticalActions={isSindico || isAdmin}
          onDecisionMade={fetchAll}
        />
      )}

      {/* Timeline + Materials */}
      <div className="grid gap-4 lg:grid-cols-2">
        <OSTimelineCard activities={activities} />
        <div className="space-y-4">
          <OSMaterialsCard materials={materials} />
          {(isSindico || isAdmin || isZelador) && (order.status === 'ABERTA' || order.status === 'EM_EXECUCAO') && (
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
