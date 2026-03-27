import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, apiUpload } from '@/lib/api';
import { useCondo } from '@/contexts/CondoContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, ClipboardList, Image, X, AlertTriangle, MessageSquare, ChevronDown, Loader2 } from 'lucide-react';
import { logActivity } from '@/lib/activity-log';
import { logSOActivity } from '@/lib/so-activity-log';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ChamadosTab from '@/components/chamados/ChamadosTab';

interface ServiceOrder {
  id: string;
  condo_id: string;
  title: string;
  description: string | null;
  location: string | null;
  status: string;
  priority: string | null;
  created_by: string;
  created_at: string;
  photo_count: number;
  is_emergency: boolean;
}

interface Provider {
  id: string;
  trade_name: string;
}

interface Ticket {
  id: string;
  title: string;
}

interface SOForm {
  title: string;
  description: string;
  location: string;
  priority: string;
  executor_type: string;
  photo_observation: string;
  provider_id: string;
  ticket_id: string;
}

const emptyForm: SOForm = { title: '', description: '', location: '', priority: 'BAIXA', executor_type: 'PRESTADOR_EXTERNO', photo_observation: '', provider_id: '', ticket_id: '' };

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

const PAGE_SIZE = 20;

export default function OrdensServico() {
  const { condoId, role } = useCondo();
  const { user } = useAuth();
  const isMorador = role === 'MORADOR';
  const { toast } = useToast();
  const navigate = useNavigate();

  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SOForm>(emptyForm);
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [internalUserId, setInternalUserId] = useState<string | null>(null);

  // Get internal user id for MORADOR filtering
  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/data/users/?auth_user_id=${user.id}`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.results ?? [];
        setInternalUserId(list[0]?.id ?? null);
      });
  }, [user]);

  useEffect(() => {
    if (!condoId) return;
    apiFetch(`/api/data/providers/?condo_id=${condoId}&ordering=trade_name`).then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      setProviders(Array.isArray(data) ? data : data.results ?? []);
    });
    apiFetch(`/api/data/tickets/?condo_id=${condoId}&status=ABERTO,EM_ANALISE&ordering=-created_at`).then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      setTickets(Array.isArray(data) ? data : data.results ?? []);
    });
  }, [condoId]);

  const fetchOrders = async (fromOffset = 0, append = false) => {
    if (!condoId) return;
    if (!append) setLoading(true);
    else setLoadingMore(true);

    const params = new URLSearchParams({
      condo_id: condoId,
      ordering: '-created_at',
      offset: String(fromOffset),
      limit: String(PAGE_SIZE),
    });

    // MORADOR: only see own OS
    if (isMorador && internalUserId) {
      params.append('created_by', internalUserId);
    }

    try {
      const res = await apiFetch(`/api/data/service-orders/?${params}`);
      if (!res.ok) throw new Error('Erro ao carregar');
      const rawData = await res.json();
      const data = Array.isArray(rawData) ? rawData : rawData.results ?? [];

      const ordersWithPhotos: ServiceOrder[] = data.map((o: any) => ({ ...o, photo_count: 0 }));

      if (ordersWithPhotos.length > 0) {
        const ids = ordersWithPhotos.map((o) => o.id);
        // Fetch photo counts
        for (const soId of ids) {
          const photoRes = await apiFetch(`/api/data/service-orders/${soId}/photos/?count_only=true`);
          if (photoRes.ok) {
            const photoData = await photoRes.json();
            const count = photoData.count ?? (Array.isArray(photoData) ? photoData.length : 0);
            const order = ordersWithPhotos.find(o => o.id === soId);
            if (order) order.photo_count = count;
          }
        }
      }

      if (append) {
        setOrders((prev) => [...prev, ...ordersWithPhotos]);
      } else {
        setOrders(ordersWithPhotos);
      }

      const newOffset = fromOffset + ordersWithPhotos.length;
      setNextOffset(newOffset);
      setHasMore(ordersWithPhotos.length === PAGE_SIZE);
    } catch {
      toast({ title: 'Erro ao carregar ordens de serviço', variant: 'destructive' });
      if (!append) setOrders([]);
    }

    if (!append) setLoading(false);
    else setLoadingMore(false);
  };

  useEffect(() => {
    if (internalUserId !== null || !isMorador) fetchOrders(0, false);
  }, [condoId, internalUserId]);

  const filtered = orders.filter((o) =>
    o.title.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = (prefilledTicketId?: string, prefilledTicketTitle?: string) => {
    setForm({
      ...emptyForm,
      ticket_id: prefilledTicketId ?? '',
    });
    setPhotos([]);
    setModalOpen(true);
  };

  const handleConvertTicketToOS = async (ticketId: string, ticketTitle: string) => {
    openCreate(ticketId, ticketTitle);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (photos.length + files.length > 3) {
      toast({ title: 'Máximo de 3 fotos permitidas', variant: 'destructive' });
      return;
    }
    setPhotos((prev) => [...prev, ...files].slice(0, 3));
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!condoId || !user) return;
    if (!form.title.trim()) {
      toast({ title: 'Título é obrigatório', variant: 'destructive' });
      return;
    }
    if (photos.length === 0) {
      toast({ title: 'Foto inicial é obrigatória', variant: 'destructive' });
      return;
    }
    if (photos.length > 0 && !form.photo_observation.trim()) {
      toast({ title: 'Observação da foto é obrigatória', variant: 'destructive' });
      return;
    }

    setSaving(true);

    // Get internal user id
    const userRes = await apiFetch(`/api/data/users/?auth_user_id=${user.id}`);
    if (!userRes.ok) {
      toast({ title: 'Não foi possível identificar seu usuário', variant: 'destructive' });
      setSaving(false);
      return;
    }
    const userData = await userRes.json();
    const userList = Array.isArray(userData) ? userData : userData.results ?? [];
    const internalUser = userList[0];

    if (!internalUser) {
      toast({ title: 'Não foi possível identificar seu usuário', variant: 'destructive' });
      setSaving(false);
      return;
    }

    try {
      const insertRes = await apiFetch('/api/data/service-orders/', {
        method: 'POST',
        body: JSON.stringify({
          condo_id: condoId,
          title: form.title.trim(),
          description: form.description.trim() || null,
          location: form.location.trim() || null,
          priority: form.priority,
          executor_type: form.executor_type,
          status: 'ABERTA',
          created_by: internalUser.id,
          is_emergency: form.priority === 'ALTA',
          provider_id: form.provider_id || null,
          ticket_id: form.ticket_id || null,
        }),
      });

      if (!insertRes.ok) {
        toast({ title: 'Erro ao criar ordem de serviço', description: 'Não foi possível salvar. Tente novamente.', variant: 'destructive' });
        setSaving(false);
        return;
      }

      const inserted = await insertRes.json();
      const soId = inserted.id;

      // If converting from ticket, update ticket status
      if (form.ticket_id) {
        await apiFetch(`/api/data/tickets/${form.ticket_id}/`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'VIROU_OS', service_order_id: soId }),
        });
      }

      // Upload photos
      for (const photo of photos) {
        const formData = new FormData();
        formData.append('bucket', 'service-order-photos');
        const ext = photo.name.split('.').pop() ?? 'jpg';
        const path = `service-orders/${soId}/${crypto.randomUUID()}.${ext}`;
        formData.append('path', path);
        formData.append('file', photo);
        const uploadRes = await apiUpload('/api/data/storage/upload/', formData);
        if (uploadRes.ok) {
          await apiFetch(`/api/data/service-orders/${soId}/photos/`, {
            method: 'POST',
            body: JSON.stringify({ service_order_id: soId, photo_type: 'PROBLEMA', file_url: path, observation: form.photo_observation || null }),
          });
        }
      }

      await logSOActivity({ serviceOrderId: soId, action: 'OS_CRIADA' });
      for (let i = 0; i < photos.length; i++) {
        await logSOActivity({ serviceOrderId: soId, action: 'FOTO_ADICIONADA', description: `Foto ${i + 1} adicionada` });
      }

      await logActivity({
        condoId,
        action: 'create',
        entity: 'service_order',
        entityId: soId,
        description: `Ordem de serviço "${form.title.trim()}" criada`,
      });

      toast({ title: 'Ordem de serviço criada com sucesso' });
      setModalOpen(false);
      setSaving(false);
      navigate(`/ordens-servico/${soId}`);
    } catch {
      toast({ title: 'Erro ao criar ordem de serviço', variant: 'destructive' });
      setSaving(false);
    }
  };

  const updateField = (field: keyof SOForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Ordens de Serviço</h1>
        <p className="text-muted-foreground">Gerencie chamados e ordens de serviço do condomínio.</p>
      </div>

      <Tabs defaultValue="chamados" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="chamados" className="flex items-center gap-1">
            <MessageSquare className="h-4 w-4" />
            Chamados
          </TabsTrigger>
          <TabsTrigger value="os" className="flex items-center gap-1">
            <ClipboardList className="h-4 w-4" />
            Ordens de Serviço
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chamados" className="mt-4">
          <ChamadosTab onConvertToOS={handleConvertTicketToOS} />
        </TabsContent>

        <TabsContent value="os" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Lista de Ordens de Serviço
              </CardTitle>
              <Button size="sm" onClick={() => openCreate()}>
                <Plus className="h-4 w-4 mr-1" />
                Nova OS
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por título..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {loading ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {search ? 'Nenhuma OS encontrada.' : 'Nenhuma ordem de serviço cadastrada.'}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Prioridade</TableHead>
                      <TableHead>Fotos</TableHead>
                      <TableHead>Criada em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((order) => (
                      <TableRow key={order.id} className="cursor-pointer" onClick={() => navigate(`/ordens-servico/${order.id}`)}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-2">
                            {order.title}
                            {order.is_emergency && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                <AlertTriangle className="h-3 w-3 mr-0.5" />
                                Emergencial
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(order.status)}>
                            {statusLabel[order.status] ?? order.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{priorityLabel[order.priority ?? ''] ?? order.priority ?? '—'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Image className="h-3 w-3" />
                            <span className="text-sm">{order.photo_count}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: ptBR })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Carregar mais */}
              {hasMore && !search && (
                <div className="pt-2 text-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={loadingMore}
                    onClick={() => fetchOrders(nextOffset, true)}
                  >
                    {loadingMore
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...</>
                      : <><ChevronDown className="h-3.5 w-3.5" /> Carregar mais</>}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create OS Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[calc(100vh-32px)] w-full max-w-[min(720px,calc(100vw-32px))] flex flex-col px-4 sm:px-6 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Ordem de Serviço</DialogTitle>
            <DialogDescription>Preencha os dados para abrir uma nova OS.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1">
            <div className="space-y-2">
              <Label htmlFor="so_title">Título *</Label>
              <Input id="so_title" value={form.title} onChange={(e) => updateField('title', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="so_description">Descrição</Label>
              <Textarea id="so_description" value={form.description} onChange={(e) => updateField('description', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="so_location">Local do problema</Label>
              <Input id="so_location" placeholder="Ex: Bloco A, 2º andar" value={form.location} onChange={(e) => updateField('location', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prioridade *</Label>
                <Select value={form.priority} onValueChange={(v) => updateField('priority', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BAIXA">Baixa</SelectItem>
                    <SelectItem value="ALTA">Alta (Emergencial)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Executor *</Label>
                <Select value={form.executor_type} onValueChange={(v) => updateField('executor_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRESTADOR_EXTERNO">Prestador Externo</SelectItem>
                    <SelectItem value="EQUIPE_INTERNA">Equipe Interna</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Prestador de Serviço</Label>
              <Select value={form.provider_id} onValueChange={(v) => setForm(prev => ({ ...prev, provider_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  {providers.map(p => <SelectItem key={p.id} value={p.id}>{p.trade_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Chamado de origem</Label>
              <Select value={form.ticket_id} onValueChange={(v) => setForm(prev => ({ ...prev, ticket_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  {tickets.map(t => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Foto inicial do problema *</Label>
              <Input type="file" accept="image/*" multiple onChange={handlePhotoChange} disabled={photos.length >= 3} />
              {photos.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {photos.map((photo, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={URL.createObjectURL(photo)}
                        alt={`Foto ${i + 1}`}
                        className="h-20 w-20 rounded-md object-cover border border-border"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {photos.length > 0 && (
                <div className="space-y-1">
                  <Label htmlFor="so_photo_obs" className="text-xs text-muted-foreground">Observação da foto *</Label>
                  <Textarea
                    id="so_photo_obs"
                    placeholder="Descreva o problema observado na foto..."
                    value={form.photo_observation}
                    onChange={(e) => updateField('photo_observation', e.target.value)}
                    rows={2}
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 bg-background pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Criar OS'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
