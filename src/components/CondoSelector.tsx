import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCondo } from '@/contexts/CondoContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Condo {
  id: string;
  name: string;
  is_default: boolean;
}

export function CondoSelector() {
  const { condoId, refresh } = useCondo();
  const [condos, setCondos] = useState<Condo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCondos = async () => {
      const { data, error } = await supabase
        .schema('nfe_vigia')
        .rpc('get_my_condos');
      if (error) {
        console.error('[CondoSelector] Error fetching condos:', error);
      } else {
        setCondos(data ?? []);
      }
      setLoading(false);
    };
    fetchCondos();
  }, [condoId]);

  const handleChange = async (newCondoId: string) => {
    if (newCondoId === condoId) return;
    const { error } = await supabase
      .schema('nfe_vigia')
      .rpc('set_active_condo', { p_condo_id: newCondoId });
    if (error) {
      console.error('[CondoSelector] Error setting active condo:', error);
      return;
    }
    await refresh();
  };

  if (loading || condos.length === 0) {
    return null;
  }

  const activeName = condos.find((c) => c.id === condoId)?.name;

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-muted-foreground" />
      {condos.length === 1 ? (
        <span className="text-sm font-medium text-foreground">{activeName}</span>
      ) : (
        <Select value={condoId ?? undefined} onValueChange={handleChange}>
          <SelectTrigger className="h-8 w-[200px] border-none bg-transparent text-sm font-medium shadow-none focus:ring-0">
            <SelectValue placeholder="Selecionar condomínio" />
          </SelectTrigger>
          <SelectContent>
            {condos.map((condo) => (
              <SelectItem key={condo.id} value={condo.id}>
                {condo.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
