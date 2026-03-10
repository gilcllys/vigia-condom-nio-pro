import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCondo } from '@/contexts/CondoContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, ArrowUpDown, Package } from 'lucide-react';

interface StockItem {
  id: string;
  name: string;
  unit: string;
  min_qty: number;
  current_qty: number;
}

interface NewItemForm {
  name: string;
  unit: string;
  min_qty: string;
}

interface MovementForm {
  move_type: 'entrada' | 'saida';
  qty: string;
  destination: string;
  notes: string;
}

const UNITS = ['un', 'kg', 'L', 'm', 'm²', 'caixa', 'saco', 'rolo'];

export default function StockTab() {
  const { condoId, role } = useCondo();
  const { toast } = useToast();
  const canCreate = role === 'SINDICO' || role === 'ADMIN';

  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [newItemForm, setNewItemForm] = useState<NewItemForm>({ name: '', unit: '', min_qty: '' });
  const [saving, setSaving] = useState(false);

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveItem, setMoveItem] = useState<StockItem | null>(null);
  const [moveForm, setMoveForm] = useState<MovementForm>({ move_type: 'entrada', qty: '', destination: 'almoxarifado', notes: '' });

  const fetchItems = async () => {
    if (!condoId) return;
    setLoading(true);

    // Fetch stock_items
    const { data: stockItems, error: itemsError } = await supabase
      .from('stock_items')
      .select('id, name, unit, min_qty')
      .eq('condo_id', condoId)
      .is('deleted_at', null)
      .order('name');

    if (itemsError) {
      console.error('Error fetching stock items:', itemsError);
      toast({ title: 'Erro ao carregar itens', description: itemsError.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Fetch balances from view
    const { data: balances, error: balError } = await supabase
      .from('v_stock_balance')
      .select('item_id, balance')
      .eq('condo_id', condoId);

    if (balError) {
      console.error('Error fetching balances:', balError);
    }

    const balanceMap: Record<string, number> = {};
    (balances ?? []).forEach((b: any) => {
      balanceMap[b.item_id] = Number(b.balance) || 0;
    });

    const merged: StockItem[] = (stockItems ?? []).map((item: any) => ({
      ...item,
      current_qty: balanceMap[item.id] ?? 0,
    }));

    setItems(merged);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, [condoId]);

  const handleCreateItem = async () => {
    if (!condoId) return;
    if (!newItemForm.name.trim() || !newItemForm.unit || !newItemForm.min_qty) {
      toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('stock_items')
      .insert({
        condo_id: condoId,
        name: newItemForm.name.trim(),
        unit: newItemForm.unit,
        min_qty: Number(newItemForm.min_qty),
      });

    if (error) {
      toast({ title: 'Erro ao criar item', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Item criado com sucesso' });
      setNewItemOpen(false);
      setNewItemForm({ name: '', unit: '', min_qty: '' });
      fetchItems();
    }
    setSaving(false);
  };

  const openMovement = (item: StockItem) => {
    setMoveItem(item);
    setMoveForm({ move_type: 'entrada', qty: '', destination: 'almoxarifado', notes: '' });
    setMoveOpen(true);
  };

  const handleMovement = async () => {
    if (!moveItem || !condoId) return;
    const qty = Number(moveForm.qty);
    if (!qty || qty <= 0) {
      toast({ title: 'Quantidade inválida', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('stock_movements')
      .insert({
        condo_id: condoId,
        item_id: moveItem.id,
        move_type: moveForm.move_type,
        qty,
        destination: moveForm.move_type === 'saida' ? moveForm.destination : 'almoxarifado',
        notes: moveForm.notes.trim() || null,
      });

    if (error) {
      toast({ title: 'Erro ao registrar movimentação', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Movimentação registrada com sucesso' });
      setMoveOpen(false);
      fetchItems();
    }
    setSaving(false);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Package className="h-4 w-4" />
            Itens em Estoque
          </CardTitle>
          {canCreate && (
            <Button size="sm" onClick={() => setNewItemOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Novo Item
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum item cadastrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Qtd. Atual</TableHead>
                  <TableHead>Qtd. Mínima</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell>{item.current_qty}</TableCell>
                    <TableCell>{item.min_qty}</TableCell>
                    <TableCell>
                      {item.current_qty > item.min_qty ? (
                        <Badge className="bg-green-600 text-white hover:bg-green-700">OK</Badge>
                      ) : (
                        <Badge variant="destructive">Baixo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => openMovement(item)}>
                        <ArrowUpDown className="h-3 w-3 mr-1" />
                        Movimentar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Item Dialog */}
      <Dialog open={newItemOpen} onOpenChange={setNewItemOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Item de Estoque</DialogTitle>
            <DialogDescription>Cadastre um novo item no almoxarifado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={newItemForm.name} onChange={(e) => setNewItemForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Unidade *</Label>
              <Select value={newItemForm.unit} onValueChange={(v) => setNewItemForm(p => ({ ...p, unit: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantidade mínima *</Label>
              <Input type="number" min="0" value={newItemForm.min_qty} onChange={(e) => setNewItemForm(p => ({ ...p, min_qty: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewItemOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateItem} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement Dialog */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Movimentar: {moveItem?.name}</DialogTitle>
            <DialogDescription>Registre uma entrada ou saída de estoque.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={moveForm.move_type} onValueChange={(v: any) => setMoveForm(p => ({ ...p, move_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantidade *</Label>
              <Input type="number" min="1" value={moveForm.qty} onChange={(e) => setMoveForm(p => ({ ...p, qty: e.target.value }))} />
            </div>
            {moveForm.move_type === 'saida' && (
              <div className="space-y-2">
                <Label>Destino</Label>
                <Select value={moveForm.destination} onValueChange={(v) => setMoveForm(p => ({ ...p, destination: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="obra_aberta">Obra aberta</SelectItem>
                    <SelectItem value="em_espera">Em espera</SelectItem>
                    <SelectItem value="almoxarifado">Almoxarifado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Observação</Label>
              <Textarea value={moveForm.notes} onChange={(e) => setMoveForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>Cancelar</Button>
            <Button onClick={handleMovement} disabled={saving}>{saving ? 'Salvando...' : 'Confirmar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
