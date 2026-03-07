import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
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
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, ClipboardList, Image, X } from 'lucide-react';
import { logActivity } from '@/lib/activity-log';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
}

interface SOForm {
  title: string;
  description: string;
  location: string;
  priority: string;
}

const emptyForm: SOForm = { title: '', description: '', location: '', priority: 'MEDIA' };

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

export default function OrdensServico() {
  const { condoId } = useCondo();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SOForm>(emptyForm);
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchOrders = async () => {
    if (!condoId) return;
    setLoading(true);

    const { data, error } = await supabase
      .schema('nfe_vigia')
      .from('service_orders')
      .select('id, condo_id, title, description, location, status, priority, created_by, created_at')
      .eq('condo_id', condoId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching service orders:', error);
      toast({ title: 'Erro ao carregar ordens de serviço', description: error.message, variant: 'destructive' });
      setOrders([]);
    } else {
      // For each order, get photo count
      const ordersWithPhotos: ServiceOrder[] = (data ?? []).map((o: any) => ({
        ...o,
        photo_count: 0,
      }));

      // Batch photo count from service_order_photos
      if (ordersWithPhotos.length > 0) {
        const ids = ordersWithPhotos.map((o) => o.id);
        const { data: docs } = await supabase
          .schema('nfe_vigia')
          .from('service_order_photos')
          .select('service_order_id')
          .in('service_order_id', ids);

        if (docs) {
          const countMap: Record<string, number> = {};
          docs.forEach((d: any) => {
            countMap[d.service_order_id] = (countMap[d.service_order_id] || 0) + 1;
          });
          ordersWithPhotos.forEach((o) => {
            o.photo_count = countMap[o.id] || 0;
          });
        }
      }

      setOrders(ordersWithPhotos);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, [condoId]);

  const filtered = orders.filter((o) =>
    o.title.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setForm(emptyForm);
    setPhotos([]);
    setModalOpen(true);
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

    setSaving(true);

    // Buscar o id interno em nfe_vigia.users (FK exige este id, não o auth id)
    const { data: internalUser, error: userError } = await supabase
      .schema('nfe_vigia')
      .from('users')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (userError || !internalUser) {
      toast({ title: 'Erro ao identificar usuário interno', description: userError?.message ?? 'Usuário não encontrado', variant: 'destructive' });
      setSaving(false);
      return;
    }

    const { data: inserted, error } = await supabase
      .schema('nfe_vigia')
      .from('service_orders')
      .insert({
        condo_id: condoId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        priority: form.priority,
        status: 'ABERTA',
        created_by: internalUser.id,
      })
      .select('id')
      .single();

    if (error) {
      toast({ title: 'Erro ao criar ordem de serviço', description: error.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    const soId = inserted.id;

    // Upload photos to storage and register in service_order_photos
    for (const photo of photos) {
      const ext = photo.name.split('.').pop() ?? 'jpg';
      const path = `service-orders/${soId}/${crypto.randomUUID()}.${ext}`;

      console.log('[OS upload] Uploading photo to path:', path);

      const { error: uploadError } = await supabase.storage
        .from('service-order-photos')
        .upload(path, photo, { contentType: photo.type });

      if (uploadError) {
        console.error('[OS upload] Upload error:', uploadError);
      } else {
        console.log('[OS upload] file_url (path):', path);

        const { error: photoDbError } = await supabase
          .schema('nfe_vigia')
          .from('service_order_photos')
          .insert({
            service_order_id: soId,
            photo_type: 'PROBLEMA',
            file_url: path,
          });

        if (photoDbError) {
          console.error('[OS upload] Error saving photo record:', photoDbError);
        }
      }
    }

    console.log('[OS] service_order_id created:', soId);

    await logActivity({
      condoId,
      action: 'create',
      entity: 'service_order' as any,
      entityId: soId,
      description: `Ordem de serviço "${form.title.trim()}" criada`,
    });

    toast({ title: 'Ordem de serviço criada com sucesso' });
    setModalOpen(false);
    setSaving(false);
    navigate(`/ordens-servico/${soId}`);
  };

  const updateField = (field: keyof SOForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Ordens de Serviço</h1>
        <p className="text-muted-foreground">Gerencie as ordens de serviço do condomínio.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Lista de Ordens de Serviço
          </CardTitle>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Nova Ordem de Serviço
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
                  <TableRow
                    key={order.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/ordens-servico/${order.id}`)}
                  >
                    <TableCell className="font-medium">{order.title}</TableCell>
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
        </CardContent>
      </Card>

      {/* Create Modal */}
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
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select value={form.priority} onValueChange={(v) => updateField('priority', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BAIXA">Baixa</SelectItem>
                  <SelectItem value="MEDIA">Média</SelectItem>
                  <SelectItem value="ALTA">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fotos do problema (até 3)</Label>
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
