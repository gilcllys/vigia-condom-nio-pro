import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { FileText, Download, Plus, Send } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { logSOActivity } from '@/lib/so-activity-log';

interface FiscalDocument {
  id: string;
  number: string | null;
  amount: number | null;
  issue_date: string | null;
  file_url: string | null;
  created_at: string;
  approval_status?: string;
}

interface OSFiscalDocsCardProps {
  orderId: string;
  condoId: string;
  canAttach: boolean;
  canCriticalActions: boolean;
  onApprovalSent?: () => void;
}

export function OSFiscalDocsCard({ orderId, condoId, canAttach, canCriticalActions, onApprovalSent }: OSFiscalDocsCardProps) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<FiscalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [form, setForm] = useState({ number: '', amount: '', issue_date: '' });
  const [file, setFile] = useState<File | null>(null);

  const fetchDocs = async () => {
    setLoading(true);
    const { data } = await supabase
      .schema('nfe_vigia')
      .from('fiscal_documents')
      .select('id, number, amount, issue_date, file_url, created_at')
      .eq('service_order_id', orderId)
      .order('created_at', { ascending: false });
    setDocs(data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchDocs(); }, [orderId]);

  const handleDownload = async (fileUrl: string) => {
    const { data, error } = await supabase.storage
      .from('service-order-photos')
      .createSignedUrl(fileUrl, 3600);
    if (data && !error) {
      window.open(data.signedUrl, '_blank');
    }
  };

  const handleAdd = async () => {
    if (!form.number.trim() || !form.amount) {
      toast({ title: 'Preencha número e valor da NF', variant: 'destructive' });
      return;
    }
    setSaving(true);

    let fileUrl: string | null = null;
    if (file) {
      const ext = file.name.split('.').pop() ?? 'pdf';
      const path = `service-orders/${orderId}/nf-${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('service-order-photos').upload(path, file, { contentType: file.type });
      if (!uploadError) fileUrl = path;
    }

    const { error } = await supabase.schema('nfe_vigia').from('fiscal_documents').insert({
      service_order_id: orderId,
      condo_id: condoId,
      number: form.number.trim(),
      amount: parseFloat(form.amount),
      issue_date: form.issue_date || null,
      file_url: fileUrl,
    });

    if (error) {
      toast({ title: 'Erro ao adicionar nota fiscal', variant: 'destructive' });
    } else {
      await logSOActivity({ serviceOrderId: orderId, action: 'DOCUMENTO_ANEXADO', description: `Nota fiscal Nº ${form.number.trim()} anexada` });
      toast({ title: 'Nota fiscal adicionada' });
      setForm({ number: '', amount: '', issue_date: '' });
      setFile(null);
      setModalOpen(false);
      fetchDocs();
    }
    setSaving(false);
  };

  const handleSendForApproval = async (doc: FiscalDocument) => {
    if (!doc.amount) return;
    setSubmitting(doc.id);

    // Get financial config
    const { data: config } = await supabase
      .schema('nfe_vigia')
      .from('condo_financial_config')
      .select('*')
      .eq('condo_id', condoId)
      .maybeSingle();

    const alcada1 = config?.alcada_1_limite ?? 500;
    const alcada2 = config?.alcada_2_limite ?? 2000;
    const alcada3 = config?.alcada_3_limite ?? 10000;
    const deadlineHours = config?.approval_deadline_hours ?? 48;
    const amount = doc.amount;

    // Determine which roles need to approve
    let requiredRoles: string[] = [];
    if (amount <= alcada1) {
      // Only Síndico - no approval needed from others
      toast({ title: 'NF abaixo da alçada mínima', description: 'Aprovação apenas do Síndico. Registrada automaticamente.' });
      setSubmitting(null);
      return;
    } else if (amount <= alcada2) {
      requiredRoles = ['SUBSINDICO'];
    } else if (amount <= alcada3) {
      requiredRoles = ['SUBSINDICO', 'CONSELHO'];
    } else {
      requiredRoles = ['SUBSINDICO', 'CONSELHO'];
      // Also mark notify_residents
      await supabase.schema('nfe_vigia').from('fiscal_documents')
        .update({ notify_residents: true })
        .eq('id', doc.id);
    }

    // Get approvers
    const { data: approvers } = await supabase
      .schema('nfe_vigia')
      .from('user_condos')
      .select('user_id, role')
      .eq('condo_id', condoId)
      .in('role', requiredRoles)
      .eq('status', 'ativo');

    if (!approvers || approvers.length === 0) {
      toast({ title: 'Nenhum aprovador encontrado para esta alçada', variant: 'destructive' });
      setSubmitting(null);
      return;
    }

    const expiresAt = new Date(Date.now() + deadlineHours * 60 * 60 * 1000).toISOString();

    const approvalRecords = approvers.map((a: any) => ({
      fiscal_document_id: doc.id,
      condo_id: condoId,
      service_order_id: orderId,
      approver_id: a.user_id,
      approver_role: a.role,
      decision: 'pendente',
      expires_at: expiresAt,
    }));

    const { error } = await supabase.schema('nfe_vigia').from('fiscal_document_approvals').insert(approvalRecords);

    if (error) {
      toast({ title: 'Erro ao enviar NF para aprovação', variant: 'destructive' });
    } else {
      const rangeLabel = amount > alcada3
        ? `acima de R$ ${alcada3.toLocaleString('pt-BR')} — moradores serão notificados`
        : `R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
      await logSOActivity({
        serviceOrderId: orderId,
        action: 'NF_ENVIADA_APROVACAO',
        description: `NF Nº ${doc.number} (${rangeLabel}) enviada para aprovação`,
      });
      toast({ title: 'NF enviada para aprovação' });
      onApprovalSent?.();
    }
    setSubmitting(null);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Notas Fiscais
          {docs.length > 0 && <Badge variant="secondary" className="text-xs">{docs.length}</Badge>}
        </CardTitle>
        {canAttach && (
          <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Anexar NF
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhuma nota fiscal anexada.</p>
        ) : (
          <div className="space-y-3">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">NF {doc.number ?? '—'}</span>
                    {doc.amount != null && (
                      <Badge variant="secondary" className="text-xs">
                        R$ {doc.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </Badge>
                    )}
                  </div>
                  {doc.issue_date && (
                    <p className="text-xs text-muted-foreground">
                      Emissão: {format(new Date(doc.issue_date), 'dd/MM/yyyy', { locale: ptBR })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {canCriticalActions && doc.amount && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSendForApproval(doc)}
                      disabled={submitting === doc.id}
                    >
                      <Send className="h-3 w-3 mr-1" />
                      {submitting === doc.id ? '...' : 'Aprovar'}
                    </Button>
                  )}
                  {doc.file_url && (
                    <Button size="sm" variant="ghost" onClick={() => handleDownload(doc.file_url!)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anexar Nota Fiscal</DialogTitle>
            <DialogDescription>Informe os dados da nota fiscal.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Número da NF *</Label>
              <Input value={form.number} onChange={(e) => setForm(p => ({ ...p, number: e.target.value }))} placeholder="Ex: 12345" />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0,00" />
            </div>
            <div className="space-y-2">
              <Label>Data de emissão</Label>
              <Input type="date" value={form.issue_date} onChange={(e) => setForm(p => ({ ...p, issue_date: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Arquivo (PDF ou imagem)</Label>
              <Input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={saving}>{saving ? 'Salvando...' : 'Adicionar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
