import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCondo } from '@/contexts/CondoContext';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Users, FileText } from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const { condoId } = useCondo();
  const [counts, setCounts] = useState({ condos: 0, residents: 0, invoices: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!condoId) {
      setLoading(false);
      return;
    }

    const fetchCounts = async () => {
      setLoading(true);
      const [condosRes, residentsRes, invoicesRes] = await Promise.all([
        supabase.schema('nfe_vigia').from('condos').select('*', { count: 'exact', head: true }).eq('id', condoId),
        supabase.schema('nfe_vigia').from('residents').select('*', { count: 'exact', head: true }).eq('condo_id', condoId),
        supabase.schema('nfe_vigia').from('invoices').select('*', { count: 'exact', head: true }).eq('condo_id', condoId),
      ]);
      setCounts({
        condos: condosRes.count ?? 0,
        residents: residentsRes.count ?? 0,
        invoices: invoicesRes.count ?? 0,
      });
      setLoading(false);
    };

    fetchCounts();
  }, [condoId]);

  const cards = [
    { label: 'Condomínios', value: counts.condos, icon: Building2 },
    { label: 'Moradores', value: counts.residents, icon: Users },
    { label: 'Notas Fiscais', value: counts.invoices, icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">
          Bem-vindo{user?.email ? `, ${user.email}` : ''}!
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
