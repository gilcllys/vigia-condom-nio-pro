import { useEffect, useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, MessageSquare, ArrowRight, XCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

interface TicketRow {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  category: string | null;
  unit: string | null;
  status: string;
  created_by: string;
  created_at: string;
  service_order_id: string | null;
  close_reason: string | null;
  creator_name?: string;
}

interface TicketForm {
  title: string;
  description: string;
  location: string;
  category: string;
  unit: string;
}

const emptyForm: TicketForm = { title: '', description: '', location: '', category: '', unit: '' };

const CATEGORIES = ['Elétrico', 'Hidráulico', 'Limpeza', 'Segurança', 'Outros'];

const STATUS_LABEL: Record<string, string> = {
  ABERTO: 'Aberto',
  EM_ANALISE: 'Em Análise',
  VIROU_OS: 'Virou OS',
  RESPONSABILIDADE_MORADOR: 'Resp. do Morador',
  ENCERRADO: 'Encerrado',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ABERTO: 'default',
  EM_ANALISE: 'secondary',
  VIROU_OS: 'outline',
  RESPONSABILIDADE_MORADOR: 'destructive',
  ENCERRADO: 'outline',
};

interface ChamadosTabProps {
  onConvertToOS?: (ticketId: string, ticketTitle: string) => void;
}

export default function ChamadosTab({ onConvertToOS }: ChamadosTabProps) {
  const { condoId, role } = useCondo();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const isMorador = role === 'MORADOR';
  const canManage = role === 'SINDICO' || role === 'ADMIN' || role === 'ZELADOR';

  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<TicketForm>(emptyForm);
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [internalUserId, setInternalUserId] = useState<string | null>(null);

  // Detail/actions
  const [detailTicket, setDetailTicket] = useState<TicketRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [closeReasonText, setCloseReasonText] = useState('');
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closeType, setCloseType] = useState<'ENCERRADO' | 'RESPONSABILIDADE_MORADOR'>('ENCERRADO');

  // Get internal user id
  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/data/users/by-auth-id/?auth_user_id=${user.id}`)
      .then(res => res.json())
      .then(data => setInternalUserId(data?.id ?? null))
      .catch(() => setInternalUserId(null));
  }, [user]);

  const fetchTickets = async () => {
    if (!condoId) return;
    setLoading(true);

    try {
      let url = `/api/data/tickets/?condo_id=${condoId}`;

      // MORADOR only sees own tickets
      if (isMorador && internalUserId) {
        url += `&created_by=${internalUserId}`;
      }

      const res = await apiFetch(url);
      const data = await res.json();
      const rows: TicketRow[] = Array.isArray(data) ? data : data?.results ?? [];

      // Fetch creator names
      if (rows.length > 0) {
        const creatorIds = [...new Set(rows.map(r => r.created_by))];
        const usersRes = await apiFetch(`/api/data/users/?ids=${creatorIds.join(',')}`);
        const usersData = await usersRes.json();
        const usersList = Array.isArray(usersData) ? usersData : usersData?.results ?? [];
        const nameMap: Record<string, string> = {};
        usersList.forEach((u: any) => { nameMap[u.id] = u.full_name; });
        rows.forEach(r => { r.creator_name = nameMap[r.created_by] ?? 'Usuário'; });
      }

      setTickets(rows);
    } catch (err) {
      console.error('Error fetching tickets:', err);
      toast({ title: 'Erro ao carregar chamados', variant: 'destructive' });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (internalUserId !== null || !isMorador) fetchTickets();
  }, [condoId, internalUserId]);

  const filtered = tickets.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase())
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
    setPhotos(prev => [...prev, ...files].slice(0, 3));
  };

  const handleSave = async () => {
    if (!condoId || !internalUserId) return;
    if (!form.title.trim() || !form.description.trim() || !form.location.trim()) {
      toast({ title: 'Título, descrição e local são obrigatórios', variant: 'destructive' });
      return;
    }

    setSaving(true);

    try {
      const createRes = await apiFetch('/api/data/tickets/', {
        method: 'POST',
        body: JSON.stringify({
          condo_id: condoId,
          title: form.title.trim(),
          description: form.description.trim(),
          location: form.location.trim(),
          category: form.category || null,
          unit: form.unit.trim() || null,
          status: 'ABERTO',
          created_by: internalUserId,
        }),
      });

      if (!createRes.ok) {
        toast({ title: 'Erro ao abrir chamado', description: 'Não foi possível salvar. Tente novamente.', variant: 'destructive' });
        setSaving(false);
        return;
      }

      const inserted = await createRes.json();

      // Upload photos if any
      for (const photo of photos) {
        const ext = photo.name.split('.').pop() ?? 'jpg';
        const path = `tickets/${inserted.id}/${crypto.randomUUID()}.${ext}`;
        const formData = new FormData();
        formData.append('file', photo);
        formData.append('bucket', 'service-order-photos');
        formData.append('path', path);
        await apiUpload('/api/data/storage/upload/', formData);
      }

      toast({ title: 'Chamado aberto com sucesso' });
      setModalOpen(false);
      setSaving(false);
      fetchTickets();
    } catch {
      toast({ title: 'Erro ao abrir chamado', description: 'Tente novamente.', variant: 'destructive' });
      setSaving(false);
    }
  };

  const handleChangeStatus = async (ticketId: string, newStatus: string, reason?: string) => {
    const updatePayload: Record<string, any> = { status: newStatus };
    if (reason) updatePayload.close_reason = reason;

    try {
      const res = await apiFetch(`/api/data/tickets/${ticketId}/`, {
        method: 'PATCH',
        body: JSON.stringify(updatePayload),
      });

      if (!res.ok) {
        toast({ title: 'Erro ao atualizar chamado', variant: 'destructive' });
      } else {
        toast({ title: `Chamado atualizado para "${STATUS_LABEL[newStatus]}"` });
        fetchTickets();
        setDetailOpen(false);
        setCloseDialogOpen(false);
      }
    } catch {
      toast({ title: 'Erro ao atualizar chamado', variant: 'destructive' });
    }
  };

  const handleConvertToOS = (ticket: TicketRow) => {
    if (onConvertToOS) {
      onConvertToOS(ticket.id, ticket.title);
    }
  };

  const openDetail = (ticket: TicketRow) => {
    setDetailTicket(ticket);
    setDetailOpen(true);
  };

  const openCloseDialog = (type: 'ENCERRADO' | 'RESPONSABILIDADE_MORADOR') => {
    setCloseType(type);
    setCloseReasonText('');
    setCloseDialogOpen(true);
  };

  const handleCloseSubmit = () => {
    if (!detailTicket) return;
    if (closeType === 'RESPONSABILIDADE_MORADOR' && !closeReasonText.trim()) {
      toast({ title: 'Justificativa é obrigatória', variant: 'destructive' });
      return;
    }
    handleChangeStatus(detailTicket.id, closeType, closeReasonText.trim() || undefined);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Chamados
          </CardTitle>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Novo Chamado
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por título..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {search ? 'Nenhum chamado encontrado.' : 'Nenhum chamado registrado.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Aberto por</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((ticket) => (
                  <TableRow key={ticket.id} className="cursor-pointer" onClick={() => openDetail(ticket)}>
                    <TableCell className="font-medium">{ticket.title}</TableCell>
                    <TableCell>{ticket.category ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[ticket.status] ?? 'outline'}>
                        {STATUS_LABEL[ticket.status] ?? ticket.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{ticket.creator_name ?? 'Usuário'}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: ptBR })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Ticket Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[calc(100vh-32px)] w-full max-w-[min(720px,calc(100vw-32px))] flex flex-col px-4 sm:px-6 overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Chamado</DialogTitle>
            <DialogDescription>Preencha os dados para abrir um chamado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto flex-1">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input value={form.title} onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Local do problema *</Label>
              <Input placeholder="Ex: Bloco A, área de lazer" value={form.location} onChange={(e) => setForm(p => ({ ...p, location: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={form.category} onValueChange={(v) => setForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Input placeholder="Ex: Apto 203" value={form.unit} onChange={(e) => setForm(p => ({ ...p, unit: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Fotos do problema (até 3)</Label>
              <Input type="file" accept="image/*" multiple onChange={handlePhotoChange} disabled={photos.length >= 3} />
              {photos.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {photos.map((photo, i) => (
                    <img key={i} src={URL.createObjectURL(photo)} alt={`Foto ${i + 1}`} className="h-20 w-20 rounded-md object-cover border border-border" />
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 bg-background pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Abrir Chamado'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailTicket?.title}</DialogTitle>
            <DialogDescription>Detalhes do chamado</DialogDescription>
          </DialogHeader>
          {detailTicket && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[detailTicket.status] ?? 'outline'}>
                  {STATUS_LABEL[detailTicket.status] ?? detailTicket.status}
                </Badge>
                {detailTicket.category && <Badge variant="outline">{detailTicket.category}</Badge>}
              </div>

              {detailTicket.description && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Descrição</p>
                  <p className="text-sm whitespace-pre-wrap">{detailTicket.description}</p>
                </div>
              )}
              {detailTicket.location && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Local</p>
                  <p className="text-sm">{detailTicket.location}</p>
                </div>
              )}
              {detailTicket.unit && (
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Unidade</p>
                  <p className="text-sm">{detailTicket.unit}</p>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Aberto por</p>
                <p className="text-sm">{detailTicket.creator_name ?? 'Usuário'}</p>
              </div>

              {detailTicket.status === 'VIROU_OS' && detailTicket.service_order_id && (
                <Button variant="link" className="p-0 h-auto" onClick={() => { setDetailOpen(false); navigate(`/ordens-servico/${detailTicket.service_order_id}`); }}>
                  Ver OS vinculada →
                </Button>
              )}

              {detailTicket.status === 'RESPONSABILIDADE_MORADOR' && detailTicket.close_reason && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-destructive">Justificativa</p>
                  <p className="text-sm whitespace-pre-wrap">{detailTicket.close_reason}</p>
                </div>
              )}

              {/* Actions for managers */}
              {canManage && (detailTicket.status === 'ABERTO' || detailTicket.status === 'EM_ANALISE') && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  {detailTicket.status === 'ABERTO' && (
                    <Button size="sm" variant="secondary" onClick={() => handleChangeStatus(detailTicket.id, 'EM_ANALISE')}>
                      Iniciar Análise
                    </Button>
                  )}
                  <Button size="sm" onClick={() => handleConvertToOS(detailTicket)}>
                    <ArrowRight className="h-4 w-4 mr-1" />
                    Converter em OS
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openCloseDialog('ENCERRADO')}>
                    Encerrar
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => openCloseDialog('RESPONSABILIDADE_MORADOR')}>
                    <XCircle className="h-4 w-4 mr-1" />
                    Resp. do Morador
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Close reason dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {closeType === 'RESPONSABILIDADE_MORADOR' ? 'Encerrar — Responsabilidade do Morador' : 'Encerrar Chamado'}
            </DialogTitle>
            <DialogDescription>
              {closeType === 'RESPONSABILIDADE_MORADOR'
                ? 'Informe a justificativa para encerrar como responsabilidade do morador.'
                : 'Deseja encerrar este chamado? Adicione uma observação se necessário.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>{closeType === 'RESPONSABILIDADE_MORADOR' ? 'Justificativa *' : 'Observação'}</Label>
            <Textarea value={closeReasonText} onChange={(e) => setCloseReasonText(e.target.value)} placeholder="Descreva o motivo..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>Cancelar</Button>
            <Button variant={closeType === 'RESPONSABILIDADE_MORADOR' ? 'destructive' : 'default'} onClick={handleCloseSubmit}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
