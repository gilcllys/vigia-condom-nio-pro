import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCondo } from '@/contexts/CondoContext';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileText, Search } from 'lucide-react';
import { format } from 'date-fns';

interface FiscalDoc {
  id: string;
  number: string | null;
  amount: number | null;
  supplier: string | null;
  issue_date: string | null;
  document_type: string | null;
  status: string;
  created_at: string;
  file_url: string | null;
}

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Todos os status' },
  { value: 'PENDENTE', label: 'Pendente' },
  { value: 'PROCESSADO', label: 'Processado' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

function getStatusBadge(status: string) {
  switch (status) {
    case 'PENDENTE': return { label: 'Pendente', className: 'bg-warning text-warning-foreground' };
    case 'PROCESSADO': return { label: 'Processado', className: 'bg-emerald-500/20 text-emerald-400' };
    case 'CANCELADO': return { label: 'Cancelado', className: 'bg-destructive/20 text-destructive' };
    default: return { label: status, className: 'bg-muted text-muted-foreground' };
  }
}

export default function NotasFiscais() {
  const { condoId } = useCondo();
  const [docs, setDocs] = useState<FiscalDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => {
    if (!condoId) { setLoading(false); return; }

    const fetchDocs = async () => {
      setLoading(true);
      let query = supabase
        .from('fiscal_documents')
        .select('id, number, amount, supplier, issue_date, document_type, status, created_at, file_url')
        .eq('condo_id', condoId)
        .order('created_at', { ascending: false });

      if (filterStatus !== 'ALL') query = query.eq('status', filterStatus);
      if (filterSupplier.trim()) query = query.ilike('supplier', `%${filterSupplier.trim()}%`);
      if (filterDateFrom) query = query.gte('issue_date', filterDateFrom);
      if (filterDateTo) query = query.lte('issue_date', filterDateTo);

      const { data } = await query;
      setDocs((data ?? []) as FiscalDoc[]);
      setLoading(false);
    };

    fetchDocs();
  }, [condoId, filterStatus, filterSupplier, filterDateFrom, filterDateTo]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Notas Fiscais</h1>
        <p className="text-muted-foreground">Gerencie as notas fiscais do condomínio.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
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
          placeholder="Data início"
        />
        <Input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          className="w-[160px]"
          placeholder="Data fim"
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
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : docs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  Nenhuma nota fiscal encontrada.
                </TableCell>
              </TableRow>
            ) : (
              docs.map(doc => {
                const badge = getStatusBadge(doc.status);
                return (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium text-foreground">
                      {doc.number ? `#${doc.number}` : '—'}
                    </TableCell>
                    <TableCell className="text-foreground">{doc.supplier ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{doc.document_type ?? '—'}</Badge>
                    </TableCell>
                    <TableCell className="text-foreground">
                      {doc.amount != null ? `R$ ${doc.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {doc.issue_date ? format(new Date(doc.issue_date), 'dd/MM/yyyy') : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge className={`${badge.className} text-[10px]`}>{badge.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
