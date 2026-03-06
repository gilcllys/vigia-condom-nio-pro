import { useEffect, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCondo } from '@/contexts/CondoContext';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Condo {
  condo_id: string;
  condo_name: string;
  role: string;
  is_default: boolean;
}

export function CondoSelector() {
  const { condoId, refresh } = useCondo();
  const [condos, setCondos] = useState<Condo[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

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

  const handleSelect = async (condo: Condo) => {
    if (condo.condo_id === condoId || switching) return;
    setSwitching(true);
    const { error } = await supabase
      .schema('nfe_vigia')
      .rpc('switch_active_condo', { p_condo_id: condo.condo_id });
    if (error) {
      console.error('[CondoSelector] Error switching condo:', error);
      setSwitching(false);
      return;
    }
    await refresh();
    setSwitching(false);
    setOpen(false);
  };

  if (loading) return null;

  const activeCondo = condos.find((c) => c.is_default) ?? condos[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-2 px-3 font-medium cursor-pointer"
        >
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">{activeCondo?.condo_name ?? 'Selecionar'}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1">
        {condos.map((condo) => {
          const isActive = condo.condo_id === condoId;
          return (
            <button
              key={condo.condo_id}
              onClick={() => handleSelect(condo)}
              disabled={isActive || switching}
              className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer disabled:cursor-default disabled:opacity-70"
            >
              <div className="flex flex-1 flex-col items-start gap-0.5">
                <span className="font-medium">{condo.condo_name}</span>
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {condo.role}
                </Badge>
              </div>
              {isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
