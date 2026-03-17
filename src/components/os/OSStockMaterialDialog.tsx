import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCondo } from '@/contexts/CondoContext';
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

      const { data: stockItems } = await supabase
        .from('stock_items')
        .select('id, name, unit')
        .eq('condo_id', condoId)
        .is('deleted_at', null)
        .order('name');

      const { data: balances } = await supabase
        .from('v_stock_balance')
        .select('item_id, balance')
        .eq('condo_id', condoId);

      const balanceMap: Record<string, number> = {};
      (balances ?? []).forEach((b: any) => {
        balanceMap[b.item_id] = Number(b.balance) || 0;
      });

      const merged: StockItem[] = (stockItems ?? [])
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

    // 1. Insert material into service_order_materials
    const { error: matError } = await supabase
      .from('service_order_materials')
      .insert({
        service_order_id: orderId,
        name: selectedItem!.name,
        quantity: qty,
        unit: selectedItem!.unit,
        cost: null,
      });

    if (matError) {
      toast({ title: 'Erro ao adicionar material', description: matError.message, variant: 'destructive' });
      setSaving(false);
      return;
    }

    // 2. Deduct from stock via stock_movements
    const { error: moveError } = await supabase
      .from('stock_movements')
      .insert({
        condo_id: condoId,
        item_id: selectedItemId,
        move_type: 'SAIDA',
        qty,
      });

    if (moveError) {
      toast({ title: 'Material adicionado, mas erro na baixa do estoque', description: moveError.message, variant: 'destructive' });
    } else {
      toast({ title: 'Material adicionado e estoque baixado' });
    }

    setSaving(false);
    setSelectedItemId('');
    setQuantity('');
    onOpenChange(false);
    onAdded();
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
