import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useCondo } from '@/contexts/CondoContext';
import { STOCK_MOVE_TYPES } from '@/lib/stock-move-type';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Package } from 'lucide-react';

interface StockItem {
  id: string;
  name: string;
  unit: string;
  current_qty: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  onAdded: () => void;
}

export function OSStockMaterialDialog({ open, onOpenChange, orderId, onAdded }: Props) {
  const { condoId } = useCondo();
  const { toast } = useToast();
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState('');

  useEffect(() => {
    if (!open || !condoId) return;

    const fetchStock = async () => {
      setLoading(true);

      const itemsRes = await apiFetch(`/api/data/stock-items/?condo_id=${condoId}&deleted_at__isnull=true&ordering=name`);
      const itemsJson = await itemsRes.json();
      const stockItems: any[] = itemsJson.results ?? itemsJson ?? [];

      const balancesRes = await apiFetch(`/api/data/stock-items/balances/?condo_id=${condoId}`);
      const balancesJson = await balancesRes.json();
      const balances: any[] = balancesJson.results ?? balancesJson ?? [];

      const balanceMap: Record<string, number> = {};
      balances.forEach((b: any) => {
        balanceMap[b.item_id] = Number(b.balance_qty) || 0;
      });

      const merged: StockItem[] = stockItems
        .map((item: any) => ({
          ...item,
          current_qty: balanceMap[item.id] ?? 0,
        }))
        .filter(item => item.current_qty > 0);

      setItems(merged);
      setLoading(false);
    };

    fetchStock();
  }, [open, condoId]);

  const selectedItem = items.find(i => i.id === selectedItemId);

  const handleAdd = async () => {
    if (!selectedItemId || !quantity || !condoId) return;
    const qty = Number(quantity);
    if (qty <= 0) {
      toast({ title: 'Quantidade inválida', variant: 'destructive' });
      return;
    }
    if (selectedItem && qty > selectedItem.current_qty) {
      toast({ title: 'Quantidade excede o saldo disponível', variant: 'destructive' });
      return;
    }

    setSaving(true);

    try {
      // 1. Insert material into service_order_materials and get the ID back
      const matRes = await apiFetch('/api/data/service-order-materials/', {
        method: 'POST',
        body: JSON.stringify({
          service_order_id: orderId,
          name: selectedItem!.name,
          quantity: qty,
          unit: selectedItem!.unit,
          cost: null,
        }),
      });

      if (!matRes.ok) {
        const matErr = await matRes.json().catch(() => ({}));
        toast({ title: 'Erro ao adicionar material', description: matErr.message ?? matErr.detail ?? '', variant: 'destructive' });
        setSaving(false);
        return;
      }

      const matData = await matRes.json();

      // 2. Deduct from stock via stock_movements, linking to the order
      const moveRes = await apiFetch('/api/data/stock-movements/', {
        method: 'POST',
        body: JSON.stringify({
          condo_id: condoId,
          item_id: selectedItemId,
          move_type: STOCK_MOVE_TYPES.SAIDA,
          qty,
          service_order_id: orderId,
          service_order_material_id: matData.id,
        }),
      });

      if (!moveRes.ok) {
        // Rollback: remove the material if stock deduction failed
        await apiFetch(`/api/data/service-order-materials/${matData.id}/`, { method: 'DELETE' });
        const moveErr = await moveRes.json().catch(() => ({}));
        toast({ title: 'Erro na baixa do estoque', description: moveErr.message ?? moveErr.detail ?? '', variant: 'destructive' });
        setSaving(false);
        return;
      }

      toast({ title: 'Material adicionado e estoque baixado com sucesso' });
      setSaving(false);
      setSelectedItemId('');
      setQuantity('');
      onOpenChange(false);
      onAdded();
    } catch (err: any) {
      toast({ title: 'Erro inesperado', description: err.message, variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Adicionar Material do Almoxarifado
          </DialogTitle>
          <DialogDescription>Selecione um item e a quantidade. O estoque será baixado automaticamente.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Carregando estoque...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum item disponível no estoque.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Item do estoque *</Label>
              <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar item" />
                </SelectTrigger>
                <SelectContent>
                  {items.map(item => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} — {item.current_qty} {item.unit} disponível
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantidade *</Label>
              <Input
                type="number"
                min="1"
                max={selectedItem?.current_qty ?? undefined}
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={selectedItem ? `Máx: ${selectedItem.current_qty}` : '0'}
              />
              {selectedItem && (
                <p className="text-xs text-muted-foreground mt-1">
                  Disponível: {selectedItem.current_qty} {selectedItem.unit}
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button onClick={handleAdd} disabled={saving || !selectedItemId || !quantity}>
            {saving ? 'Adicionando...' : 'Adicionar e Baixar Estoque'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
