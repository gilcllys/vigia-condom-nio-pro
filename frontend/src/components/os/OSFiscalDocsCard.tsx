import { useEffect, useState, useRef } from 'react';
import { apiFetch, apiUpload } from '@/lib/api';
import { getPublicStorageUrl } from '@/lib/storage-url';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { FileText, Download, Plus, Send, Camera, Upload, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { logSOActivity } from '@/lib/so-activity-log';
import { getRequiredRoles } from '@/hooks/useFinancialConfig';

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

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function OSFiscalDocsCard({ orderId, condoId, canAttach, canCriticalActions, onApprovalSent }: OSFiscalDocsCardProps) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<FiscalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [form, setForm] = useState({ number: '', amount: '', issue_date: '', fornecedor: '', descricao: '' });
  const [file, setFile] = useState<File | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    setLoading(true);
    const res = await apiFetch(`/api/data/fiscal-documents/?service_order_id=${orderId}&ordering=-created_at`);
    const json = await res.json();
    setDocs(json.results ?? json ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchDocs(); }, [orderId]);

  const handleDownload = (fileUrl: string) => {
    window.open(getPublicStorageUrl(fileUrl), '_blank');
  };

  const extractWithOCR = async (selectedFile: File) => {
    setExtracting(true);
    try {
      const base64 = await fileToBase64(selectedFile);
      const mediaType = selectedFile.type || 'image/jpeg';

      const response = await apiFetch('/api/invoices/extract/', {
        method: 'POST',
        body: JSON.stringify({ fileBase64: base64, mediaType }),
      });

      if (!response.ok) {
        throw new Error('Erro na extração');
      }

      const extracted = await response.json();
      setForm({
        number: extracted.numero_nf || '',
        amount: extracted.valor_total ? String(extracted.valor_total) : '',
        issue_date: extracted.data_emissao || '',
        fornecedor: extracted.fornecedor || '',
        descricao: extracted.descricao_servico || '',
      });
      toast({ title: 'Dados extraídos automaticamente', description: 'Confira e ajuste se necessário.' });
    } catch {
      toast({
        title: 'Não foi possível ler automaticamente',
        description: 'Preencha os dados manualmente.',
        variant: 'destructive',
      });
    }
    setExtracting(false);
  };

  const handleFileSelected = async (selectedFile: File) => {
    setFile(selectedFile);
    await extractWithOCR(selectedFile);
  };

  const handleAdd = async () => {
    const numberVal = form.number.trim();
    const amountVal = parseFloat(form.amount);
    if (!numberVal) {
      toast({ title: 'Preencha o número da NF', variant: 'destructive' });
      return;
    }
    if (!form.amount || isNaN(amountVal) || amountVal <= 0) {
      toast({ title: 'Preencha um valor válido para a NF', variant: 'destructive' });
      return;
    }
    setSaving(true);

    let fileUrl: string | null = null;
    if (file) {
      const ext = file.name.split('.').pop() ?? 'pdf';
      const path = `${condoId}/${crypto.randomUUID()}.${ext}`;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', 'nfe-vigia');
      formData.append('path', path);
      const uploadRes = await apiUpload('/api/data/storage/upload/', formData);
      if (uploadRes.ok) fileUrl = path;
    }

    const insertPayload = {
      service_order_id: orderId,
      condo_id: condoId,
      document_number: numberVal,
      number: numberVal,
      gross_amount: amountVal,
      amount: amountVal,
      issue_date: form.issue_date || null,
      issuer_name: form.fornecedor.trim() || null,
      supplier: form.fornecedor.trim() || null,
      file_url: fileUrl,
      source_type: 'UPLOAD',
      document_type: 'NFE',
      status: 'PENDENTE',
      approval_status: 'pendente',
    };

    const res = await apiFetch('/api/data/fiscal-documents/', {
      method: 'POST',
      body: JSON.stringify(insertPayload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      toast({ title: 'Erro ao adicionar nota fiscal', description: errData.message ?? errData.detail ?? JSON.stringify(errData), variant: 'destructive' });
    } else {
      await logSOActivity({ serviceOrderId: orderId, action: 'DOCUMENTO_ANEXADO', description: `Nota fiscal Nº ${numberVal} anexada` });
      toast({ title: 'Nota fiscal adicionada' });
      setForm({ number: '', amount: '', issue_date: '', fornecedor: '', descricao: '' });
      setFile(null);
      setModalOpen(false);
      fetchDocs();
    }
    setSaving(false);
  };

  const handleSendForApproval = async (doc: FiscalDocument) => {
    if (!doc.amount) return;
    setSubmitting(doc.id);

    const configRes = await apiFetch(`/api/data/condos/${condoId}/financial-config/`);
    let config: any = null;
    if (configRes.ok) {
      config = await configRes.json();
    }

    const amount = doc.amount;
    const requiredRoles = getRequiredRoles(amount, config as any);

    const existingRes = await apiFetch(`/api/data/approvals/?fiscal_document_id=${doc.id}&limit=1`);
    const existingJson = await existingRes.json();
    const existingApprovals = existingJson.results ?? existingJson ?? [];

    if (existingApprovals.length > 0) {
      toast({ title: 'Esta NF já foi enviada para aprovação' });
      setSubmitting(null);
      return;
    }

    const approversRes = await apiFetch(`/api/data/users/?condo_id=${condoId}&role=${requiredRoles.join(',')}&status=ativo`);
    const approversJson = await approversRes.json();
    const approvers: any[] = approversJson.results ?? approversJson ?? [];

    if (approvers.length === 0) {
      toast({ title: 'Nenhum aprovador encontrado para esta alçada', variant: 'destructive' });
      setSubmitting(null);
      return;
    }

    const approvalRecords = approvers.map((a: any) => ({
      fiscal_document_id: doc.id,
      condo_id: condoId,
      approver_user_id: a.user_id,
      approver_role: a.role,
    }));

    const insertRes = await apiFetch('/api/data/approvals/', {
      method: 'POST',
      body: JSON.stringify(approvalRecords),
    });

    if (!insertRes.ok) {
      toast({ title: 'Erro ao enviar NF para aprovação', variant: 'destructive' });
    } else {
      const rangeLabel = `R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — alçada: ${requiredRoles.join(', ')}`;
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
          <Button size="sm" variant="outline" onClick={() => { setForm({ number: '', amount: '', issue_date: '', fornecedor: '', descricao: '' }); setFile(null); setModalOpen(true); }}>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Anexar Nota Fiscal</DialogTitle>
            <DialogDescription>Fotografe ou faça upload da NF para leitura automática.</DialogDescription>
          </DialogHeader>

          {extracting ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground font-medium">Lendo nota fiscal...</p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* OCR upload buttons */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    capture="environment"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }}
                  />
                  <Button variant="outline" className="w-full pointer-events-none" size="sm">
                    <Camera className="h-4 w-4 mr-1" /> Fotografar NF
                  </Button>
                </div>
                <div className="relative flex-1">
                  <input
                    ref={uploadRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }}
                  />
                  <Button variant="outline" className="w-full pointer-events-none" size="sm">
                    <Upload className="h-4 w-4 mr-1" /> Upload PDF/Imagem
                  </Button>
                </div>
              </div>

              {file && (
                <p className="text-xs text-muted-foreground">Arquivo: {file.name}</p>
              )}

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
                <Label>Fornecedor</Label>
                <Input value={form.fornecedor} onChange={(e) => setForm(p => ({ ...p, fornecedor: e.target.value }))} placeholder="Nome do fornecedor" />
              </div>
            </div>
          )}

          {!extracting && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleAdd} disabled={saving}>{saving ? 'Salvando...' : 'Adicionar'}</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
