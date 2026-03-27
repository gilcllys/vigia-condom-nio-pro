import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { getPublicStorageUrl } from '@/lib/storage-url';
import { useCondo } from '@/contexts/CondoContext';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { FileText, Search, ExternalLink, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface ApprovalRow {
  approvalId: string;
  decision: string;
  docId: string;
  number: string | null;
  amount: number | null;
  supplier: string | null;
  issue_date: string | null;
  document_type: string | null;
  doc_status: string;
  created_at: string;
  file_url: string | null;
}

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Todos os status' },
  { value: 'pendente', label: 'Pendente' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'rejeitado', label: 'Rejeitado' },
];

function getDecisionBadge(decision: string) {
  switch (decision) {
    case 'pendente':  return { label: 'Pendente',  className: 'bg-warning text-warning-foreground' };
    case 'aprovado':  return { label: 'Aprovado',  className: 'bg-emerald-500/20 text-emerald-400' };
    case 'rejeitado': return { label: 'Rejeitado', className: 'bg-destructive/20 text-destructive' };
    default:          return { label: decision,    className: 'bg-muted text-muted-foreground' };
  }
}

export default function NotasFiscais() {
  const { condoId } = useCondo();
  const { user } = useAuth();

  const [internalUserId, setInternalUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [filterDecision, setFilterDecision] = useState('ALL');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [openingDoc, setOpeningDoc] = useState<string | null>(null);

  // Step 1: resolve internal user id from auth user
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

  // Step 2: fetch only approvals assigned to this user
  useEffect(() => {
    if (!condoId || !internalUserId) { setLoading(false); return; }
    setLoading(true);

    apiFetch(`/api/data/approvals/?approver_user_id=${internalUserId}&condo_id=${condoId}&expand=fiscal_documents`)
      .then(async (res) => {
        if (!res.ok) { setLoading(false); return; }
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.results ?? [];
        const mapped: ApprovalRow[] = (list as any[])
          .filter(row => row.fiscal_documents)
          .map(row => {
            const fd = row.fiscal_documents;
            return {
              approvalId: row.id,
              decision: row.decision ?? 'pendente',
              docId: fd.id,
              number: fd.number,
              amount: fd.amount,
              supplier: fd.supplier,
              issue_date: fd.issue_date,
              document_type: fd.document_type,
              doc_status: fd.status,
              created_at: fd.created_at,
              file_url: fd.file_url,
            };
          });
        setRows(mapped);
        setLoading(false);
      });
  }, [condoId, internalUserId, refreshKey]);

  const filtered = rows
    .filter(row => {
      if (filterDecision !== 'ALL' && row.decision !== filterDecision) return false;
      if (filterSupplier.trim() && !row.supplier?.toLowerCase().includes(filterSupplier.toLowerCase())) return false;
      if (filterDateFrom && row.issue_date && row.issue_date < filterDateFrom) return false;
      if (filterDateTo && row.issue_date && row.issue_date > filterDateTo) return false;
      return true;
    })
    .sort((a, b) => {
      // Pending first, then most recent
      const pa = a.decision === 'pendente' ? 0 : 1;
      const pb = b.decision === 'pendente' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const handleOpenDoc = async (fileUrl: string, docId: string) => {
    setOpeningDoc(docId);
    const url = getPublicStorageUrl(fileUrl);
    window.open(url, '_blank');
    setOpeningDoc(null);
  };

  const openDecisionModal = (approvalId: string) => {
    setSelectedApprovalId(approvalId);
    setJustification('');
    setModalOpen(true);
  };

  const handleDecision = async (decision: 'aprovado' | 'rejeitado') => {
    if (!selectedApprovalId) return;
    setSubmitting(true);

    try {
      const res = await apiFetch(`/api/data/approvals/${selectedApprovalId}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          decision,
          justification: justification.trim() || null,
          voted_at: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        toast.error('Erro ao registrar decisão.');
      } else {
        toast.success(decision === 'aprovado' ? 'NF aprovada com sucesso.' : 'NF rejeitada.');
        setModalOpen(false);
        setRefreshKey(k => k + 1);
      }
    } catch {
      toast.error('Erro ao registrar decisão.');
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Notas Fiscais</h1>
        <p className="text-muted-foreground">Notas fiscais que aguardam ou receberam sua decisão.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <Select value={filterDecision} onValueChange={setFilterDecision}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar fornecedor..."
            value={filterSupplier}
            onChange={(e) => setFilterSupplier(e.target.value)}
            className="pl-9 w-[220px]"
          />
        </div>
        <Input
          type="date"
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          className="w-[160px]"
        />
        <Input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          className="w-[160px]"
        />
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead>Meu Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  Nenhuma nota fiscal encontrada.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(row => {
                const badge = getDecisionBadge(row.decision);
                return (
                  <TableRow key={row.approvalId}>
                    <TableCell className="font-medium text-foreground">
                      {row.number ? `#${row.number}` : '—'}
                    </TableCell>
                    <TableCell className="text-foreground">{row.supplier ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{row.document_type ?? '—'}</Badge>
                    </TableCell>
                    <TableCell className="text-foreground">
                      {row.amount != null
                        ? `R$ ${row.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.issue_date ? format(new Date(row.issue_date), 'dd/MM/yyyy') : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${badge.className} text-[10px]`}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 flex-wrap">
                        {row.file_url && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1"
                            disabled={openingDoc === row.docId}
                            onClick={() => handleOpenDoc(row.file_url!, row.docId)}
                          >
                            {openingDoc === row.docId
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <ExternalLink className="h-3 w-3" />}
                            Ver documento
                          </Button>
                        )}
                        {row.decision === 'pendente' && (
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => openDecisionModal(row.approvalId)}
                          >
                            Aprovar / Rejeitar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Decision Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Decisão sobre a Nota Fiscal</DialogTitle>
            <DialogDescription>
              Adicione uma observação opcional e confirme sua decisão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-sm font-medium text-foreground">Observação (opcional)</Label>
            <Textarea
              placeholder="Justifique sua decisão se necessário..."
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={submitting}
              onClick={() => handleDecision('rejeitado')}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Rejeitar
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={submitting}
              onClick={() => handleDecision('aprovado')}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Aprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
