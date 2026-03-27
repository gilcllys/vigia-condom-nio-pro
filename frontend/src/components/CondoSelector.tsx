import { useEffect, useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { apiFetch } from '@/lib/api';
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
  const { condoId, condoName, switchCondo } = useCondo();
  const [condos, setCondos] = useState<Condo[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    const fetchCondos = async () => {
      try {
        const res = await apiFetch('/api/data/condos/my/');
        const data = await res.json();
        setCondos(data ?? []);
      } catch (err) {
        console.error('[CondoSelector] Error fetching condos:', err);
      }
      setLoading(false);
    };
    fetchCondos();
  }, [condoId]);

  const handleSelect = async (condo: Condo) => {
    if (condo.condo_id === condoId || switching) return;
    setSwitching(true);
    try {
      const success = await switchCondo(condo.condo_id);
      if (!success) {
        console.error('[CondoSelector] Switch failed');
      }
    } finally {
      setSwitching(false);
      setOpen(false);
    }
  };

  if (loading) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-2 px-3 font-medium cursor-pointer hover:bg-muted/40 transition-all border border-transparent hover:border-border/40"
        >
          <Building2 className="h-4 w-4 text-primary/70" />
          <span className="text-sm text-foreground/90">{condoName ?? condos.find(c => c.condo_id === condoId)?.condo_name ?? 'Selecionar'}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1 premium-card border-border">
        {condos.map((condo) => {
          const isActive = condo.condo_id === condoId;
          return (
            <button
              key={condo.condo_id}
              onClick={() => handleSelect(condo)}
              disabled={isActive || switching}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all hover:bg-primary/10 hover:text-foreground cursor-pointer disabled:cursor-default disabled:opacity-70"
            >
              <div className="flex flex-1 flex-col items-start gap-0.5">
                <span className="font-medium text-foreground/90">{condo.condo_name}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-muted/50 text-muted-foreground border-border/50">
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
