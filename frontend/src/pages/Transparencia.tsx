import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useCondo } from '@/contexts/CondoContext';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ClipboardList, FileText, Eye } from 'lucide-react';
import { format } from 'date-fns';

interface PublicOS {
  id: string;
  title: string;
  status: string;
  location: string | null;
  created_at: string;
  finished_at: string | null;
}

interface PublicNF {
  id: string;
  number: string | null;
  supplier: string | null;
  amount: number | null;
  issue_date: string | null;
  status: string;
  document_type: string | null;
}

const OS_STATUS_LABEL: Record<string, string> = {
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
  AGUARDANDO_APROVACAO: 'Aguardando Aprovação',
};

const NF_STATUS_LABEL: Record<string, string> = {
  PROCESSADO: 'Aprovada',
  CANCELADO: 'Cancelada',
};

function getOSStatusBadge(status: string) {
  switch (status) {
    case 'FINALIZADA': return 'bg-emerald-500/20 text-emerald-400';
    case 'CANCELADA': return 'bg-destructive/20 text-destructive';
    default: return 'bg-muted text-muted-foreground';
  }
}

function getNFStatusBadge(status: string) {
  switch (status) {
    case 'PROCESSADO': return 'bg-emerald-500/20 text-emerald-400';
    case 'CANCELADO': return 'bg-destructive/20 text-destructive';
    default: return 'bg-muted text-muted-foreground';
  }
}

export default function Transparencia() {
  const { condoId } = useCondo();
  const [osList, setOsList] = useState<PublicOS[]>([]);
  const [nfList, setNfList] = useState<PublicNF[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!condoId) { setLoading(false); return; }

    const fetchData = async () => {
      setLoading(true);

      const [osRes, nfRes] = await Promise.all([
        apiFetch(`/api/data/service-orders/?condo_id=${condoId}&status=FINALIZADA,CANCELADA&ordering=-created_at`),
        apiFetch(`/api/data/fiscal-documents/?condo_id=${condoId}&status=PROCESSADO,CANCELADO&ordering=-created_at`),
      ]);

      const osData = osRes.ok ? await osRes.json() : [];
      const nfData = nfRes.ok ? await nfRes.json() : [];

      setOsList((Array.isArray(osData) ? osData : osData.results ?? []) as PublicOS[]);
      setNfList((Array.isArray(nfData) ? nfData : nfData.results ?? []) as PublicNF[]);
      setLoading(false);
    };

    fetchData();
  }, [condoId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Eye className="h-6 w-6 text-primary" />
          Portal da Transparência
        </h1>
        <p className="text-muted-foreground">Acompanhe as informações públicas do condomínio.</p>
      </div>

      <Tabs defaultValue="os" className="space-y-4">
        <TabsList>
          <TabsTrigger value="os" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Ordens de Serviço
          </TabsTrigger>
          <TabsTrigger value="nf" className="gap-2">
            <FileText className="h-4 w-4" />
            Notas Fiscais
          </TabsTrigger>
        </TabsList>

        <TabsContent value="os">
          <div className="glass-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Abertura</TableHead>
                  <TableHead>Conclusão</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
                  </TableRow>
                ) : osList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      <ClipboardList className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                      Nenhuma ordem de serviço finalizada.
                    </TableCell>
                  </TableRow>
                ) : (
                  osList.map(os => (
                    <TableRow key={os.id}>
                      <TableCell className="font-medium text-foreground">{os.title}</TableCell>
                      <TableCell className="text-muted-foreground">{os.location ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(os.created_at), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {os.finished_at ? format(new Date(os.finished_at), 'dd/MM/yyyy') : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${getOSStatusBadge(os.status)} text-[10px]`}>
                          {OS_STATUS_LABEL[os.status] ?? os.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="nf">
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
                ) : nfList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                      Nenhuma nota fiscal aprovada ou cancelada.
                    </TableCell>
                  </TableRow>
                ) : (
                  nfList.map(nf => (
                    <TableRow key={nf.id}>
                      <TableCell className="font-medium text-foreground">
                        {nf.number ? `#${nf.number}` : '—'}
                      </TableCell>
                      <TableCell className="text-foreground">{nf.supplier ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{nf.document_type ?? '—'}</Badge>
                      </TableCell>
                      <TableCell className="text-foreground">
                        {nf.amount != null ? `R$ ${nf.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {nf.issue_date ? format(new Date(nf.issue_date), 'dd/MM/yyyy') : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${getNFStatusBadge(nf.status)} text-[10px]`}>
                          {NF_STATUS_LABEL[nf.status] ?? nf.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
