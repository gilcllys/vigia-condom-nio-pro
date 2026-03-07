import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useCondo } from '@/contexts/CondoContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { logActivity } from '@/lib/activity-log';
import { logSOActivity } from '@/lib/so-activity-log';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  User,
  AlertTriangle,
  Image,
  Activity,
  Package,
  FileText,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

const priorityLabel: Record<string, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
};

export default function OrdemServicoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { condoId, role } = useCondo();
  const { toast } = useToast();

  const [order, setOrder] = useState<ServiceOrderDetail | null>(null);
  const [activities, setActivities] = useState<SOActivity[]>([]);
  const [materials, setMaterials] = useState<SOMaterial[]>([]);
  const [documents, setDocuments] = useState<SODocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchAll = async () => {
    if (!id || !condoId) return;
    setLoading(true);

    const [orderRes, activitiesRes, materialsRes, docsRes] = await Promise.all([
      supabase
        .schema('nfe_vigia')
        .from('service_orders')
        .select('*')
        .eq('id', id)
        .eq('condo_id', condoId)
        .single(),
      supabase
        .schema('nfe_vigia')
        .from('service_order_activities')
        .select('*')
        .eq('service_order_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .schema('nfe_vigia')
        .from('service_order_materials')
        .select('*')
        .eq('service_order_id', id),
      supabase
        .schema('nfe_vigia')
        .from('service_order_photos')
        .select('*')
        .eq('service_order_id', id)
        .order('created_at', { ascending: false }),
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

  const changeStatus = async (newStatus: string) => {
    if (!order || !condoId) return;
    setActionLoading(true);

    if (newStatus === 'FINALIZADA') {
      const { data: canFinalize, error: fnError } = await supabase
        .schema('nfe_vigia')
        .rpc('can_finalize_service_order', { p_service_order_id: order.id });

      if (fnError || !canFinalize) {
        toast({ title: 'Não é possível finalizar esta OS', description: fnError?.message ?? 'Verifique os requisitos.', variant: 'destructive' });
        setActionLoading(false);
        return;
      }
    }

    const { error } = await supabase
      .schema('nfe_vigia')
      .from('service_orders')
      .update({ status: newStatus })
      .eq('id', order.id);

    if (error) {
      toast({ title: 'Erro ao alterar status', description: error.message, variant: 'destructive' });
    } else {
      // Log service_order_activities
      const soActionMap: Record<string, import('@/lib/so-activity-log').SOAction> = {
        EM_EXECUCAO: 'EXECUCAO_INICIADA',
        AGUARDANDO_APROVACAO: 'ENVIADA_APROVACAO',
        FINALIZADA: 'OS_FINALIZADA',
        CANCELADA: 'OS_CANCELADA',
      };
      const soAction = soActionMap[newStatus];
      if (soAction) {
        await logSOActivity({ serviceOrderId: order.id, action: soAction });
      }

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

  const [canCriticalActions, setCanCriticalActions] = useState(false);
  const isSindicoOrZelador = role && ['SINDICO', 'SUB_SINDICO', 'CONSELHO_FISCAL', 'ZELADOR'].includes(role);

  useEffect(() => {
    const checkCritical = async () => {
      const { data } = await supabase.schema('nfe_vigia').rpc('can_current_user_do_sindico_critical_actions');
      setCanCriticalActions(!!data);
    };
    checkCritical();
  }, [condoId]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const photos = documents;
  const otherDocs: SODocument[] = [];

  // Generate signed URLs for photos
  useEffect(() => {
    const generateSignedUrls = async () => {
      const urls: Record<string, string> = {};
      for (const doc of documents) {
        if (!doc.file_url) continue;
        const { data, error } = await supabase.storage
          .from('service-order-photos')
          .createSignedUrl(doc.file_url, 3600);
        if (data && !error) {
          urls[doc.id] = data.signedUrl;
        }
      }
      setPhotoUrls(urls);
    };
    if (documents.length > 0) {
      generateSignedUrls();
    }
  }, [documents]);

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
        <Badge variant={statusVariant(order.status)} className="text-sm px-3 py-1">
          {statusLabel[order.status] ?? order.status}
        </Badge>
      </div>

      {/* Status Actions */}
      {order.status !== 'FINALIZADA' && order.status !== 'CANCELADA' && (
        <div className="flex flex-wrap gap-2">
          {order.status === 'ABERTA' && canCriticalActions && (
            <Button size="sm" variant="outline" onClick={() => changeStatus('EM_EXECUCAO')} disabled={actionLoading}>
              <Play className="h-4 w-4 mr-1" /> Iniciar Execução
            </Button>
          )}
          {order.status === 'EM_EXECUCAO' && canCriticalActions && (
            <Button size="sm" variant="outline" onClick={() => changeStatus('AGUARDANDO_APROVACAO')} disabled={actionLoading}>
              <Clock className="h-4 w-4 mr-1" /> Enviar p/ Aprovação
            </Button>
          )}
          {order.status === 'AGUARDANDO_APROVACAO' && isSindicoOrZelador && (
            <Button size="sm" onClick={() => changeStatus('FINALIZADA')} disabled={actionLoading}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Finalizar
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={() => changeStatus('CANCELADA')} disabled={actionLoading}>
            <XCircle className="h-4 w-4 mr-1" /> Cancelar
          </Button>
        </div>
      )}

      {/* Info Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Informações */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Informações
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {order.description && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Descrição</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{order.description}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              {order.location && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Local
                  </p>
                  <p className="text-sm text-foreground">{order.location}</p>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Prioridade
                </p>
                <p className="text-sm text-foreground">{priorityLabel[order.priority ?? ''] ?? '—'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Criada em
                </p>
                <p className="text-sm text-foreground">
                  {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" /> Aberta por
                </p>
                <p className="text-sm text-foreground font-mono text-xs">{order.created_by.slice(0, 8)}…</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fotos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Image className="h-4 w-4 text-muted-foreground" />
              Fotos do problema
            </CardTitle>
            <CardDescription>{photos.length} foto(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {photos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma foto anexada.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((doc) => {
                  const signedUrl = photoUrls[doc.id];
                  if (!signedUrl) return null;
                  return (
                    <a key={doc.id} href={signedUrl} target="_blank" rel="noopener noreferrer">
                      <img
                        src={signedUrl}
                        alt={doc.file_name ?? 'Foto'}
                        className="h-24 w-full rounded-md object-cover border border-border hover:opacity-80 transition-opacity"
                      />
                    </a>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline + Materials + Documents */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Linha do tempo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
            ) : (
              <div className="space-y-3">
                {activities.map((a) => (
                  <div key={a.id} className="flex gap-3 items-start">
                    <div className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                    <div>
                      <p className="text-sm text-foreground">{a.description ?? a.activity_type}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Materiais */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              Materiais utilizados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {materials.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum material registrado.</p>
            ) : (
              <div className="space-y-2">
                {materials.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{m.name}</span>
                    <span className="text-muted-foreground">
                      {m.quantity ?? '—'} {m.unit ?? ''}
                      {m.cost != null && ` · R$ ${m.cost.toFixed(2)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documentos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Documentos / NFs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {otherDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum documento anexado.</p>
            ) : (
              <div className="space-y-2">
                {otherDocs.map((d) => (
                  <a
                    key={d.id}
                    href={d.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-primary hover:underline truncate"
                  >
                    {d.file_name ?? 'Documento'}
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
