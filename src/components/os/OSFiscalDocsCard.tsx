import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, Download, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface FiscalDocument {
  id: string;
  number: string | null;
  amount: number | null;
  issue_date: string | null;
  file_url: string | null;
  created_at: string;
}

interface OSFiscalDocsCardProps {
  orderId: string;
  canAttach: boolean;
}

export function OSFiscalDocsCard({ orderId, canAttach }: OSFiscalDocsCardProps) {
  const [docs, setDocs] = useState<FiscalDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
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
    fetch();
  }, [orderId]);

  const handleDownload = async (fileUrl: string) => {
    const { data, error } = await supabase.storage
      .from('service-order-photos')
      .createSignedUrl(fileUrl, 3600);
    if (data && !error) {
      window.open(data.signedUrl, '_blank');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Notas Fiscais
        </CardTitle>
        {canAttach && (
          <Button size="sm" variant="outline" disabled>
            <Plus className="h-4 w-4 mr-1" />
            Anexar NF
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
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      NF {doc.number ?? '—'}
                    </span>
                    {doc.amount != null && (
                      <Badge variant="secondary" className="text-xs">
                        R$ {doc.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </Badge>
                    )}
                  </div>
                  {doc.issue_date && (
                    <p className="text-xs text-muted-foreground">
                      Emissão: {format(new Date(doc.issue_date), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  )}
                </div>
                {doc.file_url && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDownload(doc.file_url!)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
