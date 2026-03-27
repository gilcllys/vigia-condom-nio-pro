import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
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
import { normalizeStockMoveType, STOCK_MOVE_TYPES, type StockMoveType } from '@/lib/stock-move-type';
import { Plus, ArrowUpDown, Package, Pencil, FolderPlus, Filter } from 'lucide-react';

interface StockCategory {
  id: string;
  name: string;
  description: string | null;
}

interface StockItem {
  id: string;
  name: string;
  unit: string;
  min_qty: number;
  current_qty: number;
  category_id: string | null;
  category_name: string | null;
  description: string | null;
}

interface NewItemForm {
  name: string;
  unit: string;
  min_qty: string;
  category_id: string;
  description: string;
}

interface EditItemForm {
  name: string;
  min_qty: string;
  category_id: string;
  description: string;
}

interface MovementForm {
  move_type: StockMoveType;
  qty: string;
  destination: string;
  notes: string;
}

interface NewCategoryForm {
  name: string;
  description: string;
}

const UNITS = ['un', 'kg', 'L', 'm', 'm²', 'caixa', 'saco', 'rolo'];

const DEFAULT_CATEGORIES = [
  { name: 'Máquinas e Equipamentos', description: 'Cortadores de grama, lavadoras, etc.' },
  { name: 'Ferramentas', description: 'Ferramentas manuais e elétricas' },
  { name: 'Lubrificantes e Químicos', description: 'Óleos, graxas, produtos químicos' },
  { name: 'Material de Limpeza', description: 'Produtos e utensílios de limpeza' },
  { name: 'Material Elétrico', description: 'Fios, lâmpadas, disjuntores' },
  { name: 'Material Hidráulico', description: 'Tubos, conexões, registros' },
  { name: 'Outros', description: 'Itens não categorizados' },
];

export default function StockTab() {
  const { condoId, role } = useCondo();
  const { toast } = useToast();
  const canCreate = role === 'SINDICO' || role === 'ADMIN';

  const [items, setItems] = useState<StockItem[]>([]);
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // New Item dialog
  const [newItemOpen, setNewItemOpen] = useState(false);
  const [newItemForm, setNewItemForm] = useState<NewItemForm>({ name: '', unit: '', min_qty: '', category_id: '', description: '' });

  // Edit Item dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [editForm, setEditForm] = useState<EditItemForm>({ name: '', min_qty: '', category_id: '', description: '' });

  // Movement dialog
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveItem, setMoveItem] = useState<StockItem | null>(null);
  const [moveForm, setMoveForm] = useState<MovementForm>({ move_type: STOCK_MOVE_TYPES.ENTRADA, qty: '', destination: 'almoxarifado', notes: '' });

  // New Category dialog
  const [catOpen, setCatOpen] = useState(false);
  const [catForm, setCatForm] = useState<NewCategoryForm>({ name: '', description: '' });

  const [saving, setSaving] = useState(false);

  const fetchCategories = async () => {
    if (!condoId) return;
    try {
      const res = await apiFetch(`/api/data/stock-categories/?condo_id=${condoId}`);
      const data = await res.json();
      const cats = Array.isArray(data) ? data : data?.results ?? [];

      // Seed default categories if none exist
      if (cats.length === 0) {
        const seedRes = await apiFetch(`/api/data/stock-categories/seed-defaults/?condo_id=${condoId}`, {
          method: 'POST',
          body: JSON.stringify({ condo_id: condoId }),
        });
        const seeded = await seedRes.json();
        const seededList = Array.isArray(seeded) ? seeded : seeded?.results ?? [];
        setCategories(seededList);
      } else {
        setCategories(cats);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchItems = async () => {
    if (!condoId) return;
    setLoading(true);

    try {
      const res = await apiFetch(`/api/data/stock-items/?condo_id=${condoId}`);
      const data = await res.json();
      const stockItems = Array.isArray(data) ? data : data?.results ?? [];

      // Fetch balance from the stock-movements/balance endpoint
      const balanceRes = await apiFetch(`/api/data/stock-movements/balance/?condo_id=${condoId}`);
      const balances = await balanceRes.json();
      const balanceList = Array.isArray(balances) ? balances : balances?.results ?? [];

      const balanceMap: Record<string, number> = {};
      balanceList.forEach((b: any) => {
        balanceMap[b.id || b.item_id] = Number(b.balance_qty || b.current_qty) || 0;
      });

      const catMap: Record<string, string> = {};
      categories.forEach(c => { catMap[c.id] = c.name; });

      const merged: StockItem[] = stockItems.map((item: any) => ({
        ...item,
        current_qty: balanceMap[item.id] ?? Number(item.current_qty) ?? 0,
        category_name: item.category_id ? (catMap[item.category_id] || 'Sem categoria') : 'Sem categoria',
      }));

      setItems(merged);
    } catch (err) {
      console.error('Error fetching stock items:', err);
      toast({ title: 'Erro ao carregar itens', variant: 'destructive' });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCategories();
  }, [condoId]);

  useEffect(() => {
    if (categories.length > 0 || !loading) {
      fetchItems();
    }
  }, [condoId, categories]);

  const handleCreateCategory = async () => {
    if (!condoId) return;
    if (!catForm.name.trim()) {
      toast({ title: 'Nome da categoria é obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);

    try {
      const res = await apiFetch('/api/data/stock-categories/', {
        method: 'POST',
        body: JSON.stringify({
          condo_id: condoId,
          name: catForm.name.trim(),
          description: catForm.description.trim() || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast({ title: 'Erro ao criar categoria', description: errData.error || 'Tente novamente.', variant: 'destructive' });
      } else {
        toast({ title: 'Categoria criada!' });
        setCatOpen(false);
        setCatForm({ name: '', description: '' });
        fetchCategories();
      }
    } catch {
      toast({ title: 'Erro ao criar categoria', variant: 'destructive' });
    }
    setSaving(false);
  };

  const handleCreateItem = async () => {
    if (!condoId) return;
    if (!newItemForm.name.trim() || !newItemForm.unit || !newItemForm.min_qty) {
      toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
      return;
    }

    setSaving(true);

    try {
      const res = await apiFetch('/api/data/stock-items/', {
        method: 'POST',
        body: JSON.stringify({
          condo_id: condoId,
          name: newItemForm.name.trim(),
          unit: newItemForm.unit,
          min_qty: Number(newItemForm.min_qty),
          category_id: newItemForm.category_id || null,
          description: newItemForm.description.trim() || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast({ title: 'Erro ao criar item', description: errData.error || 'Tente novamente.', variant: 'destructive' });
      } else {
        toast({ title: 'Item criado com sucesso' });
        setNewItemOpen(false);
        setNewItemForm({ name: '', unit: '', min_qty: '', category_id: '', description: '' });
        fetchItems();
      }
    } catch {
      toast({ title: 'Erro ao criar item', variant: 'destructive' });
    }
    setSaving(false);
  };

  const openEdit = (item: StockItem) => {
    setEditItem(item);
    setEditForm({
      name: item.name,
      min_qty: String(item.min_qty),
      category_id: item.category_id || '',
      description: item.description || '',
    });
    setEditOpen(true);
  };

  const handleEditItem = async () => {
    if (!editItem) return;
    if (!editForm.name.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);

    try {
      const res = await apiFetch(`/api/data/stock-items/${editItem.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name.trim(),
          min_qty: Number(editForm.min_qty) || 0,
          category_id: editForm.category_id || null,
          description: editForm.description.trim() || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast({ title: 'Erro ao atualizar item', description: errData.error || 'Tente novamente.', variant: 'destructive' });
      } else {
        toast({ title: 'Item atualizado!' });
        setEditOpen(false);
        fetchItems();
      }
    } catch {
      toast({ title: 'Erro ao atualizar item', variant: 'destructive' });
    }
    setSaving(false);
  };

  const openMovement = (item: StockItem) => {
    setMoveItem(item);
    setMoveForm({ move_type: STOCK_MOVE_TYPES.ENTRADA, qty: '', destination: 'almoxarifado', notes: '' });
    setMoveOpen(true);
  };

  const handleMovement = async () => {
    if (!moveItem || !condoId) return;
    const qty = Number(moveForm.qty);
    if (!qty || qty <= 0) {
      toast({ title: 'Quantidade inválida', variant: 'destructive' });
      return;
    }

    if (moveForm.move_type === 'AJUSTE' && !moveForm.notes.trim()) {
      toast({ title: 'Justificativa é obrigatória para ajustes', variant: 'destructive' });
      return;
    }

    setSaving(true);

    try {
      const res = await apiFetch('/api/data/stock-movements/', {
        method: 'POST',
        body: JSON.stringify({
          condo_id: condoId,
          item_id: moveItem.id,
          move_type: normalizeStockMoveType(moveForm.move_type),
          qty,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast({ title: 'Erro ao registrar movimentação', description: errData.error || 'Tente novamente.', variant: 'destructive' });
      } else {
        toast({ title: 'Movimentação registrada com sucesso' });
        setMoveOpen(false);
        fetchItems();
      }
    } catch {
      toast({ title: 'Erro ao registrar movimentação', variant: 'destructive' });
    }
    setSaving(false);
  };

  const filteredItems = filterCategory === 'all'
    ? items
    : filterCategory === 'none'
      ? items.filter(i => !i.category_id)
      : items.filter(i => i.category_id === filterCategory);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Package className="h-4 w-4" />
            Itens em Estoque
          </CardTitle>
          <div className="flex gap-2 flex-wrap">
            {canCreate && (
              <>
                <Button size="sm" variant="outline" onClick={() => setCatOpen(true)}>
                  <FolderPlus className="h-4 w-4 mr-1" />
                  Nova Categoria
                </Button>
                <Button size="sm" onClick={() => setNewItemOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Novo Item
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Filtrar por categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                <SelectItem value="none">Sem categoria</SelectItem>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{filteredItems.length} ite{filteredItems.length === 1 ? 'm' : 'ns'}</span>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Carregando...</p>
          ) : filteredItems.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum item encontrado.</p>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Un.</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-normal">
                          {item.category_name}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell className="text-right">{item.current_qty}</TableCell>
                      <TableCell className="text-right">{item.min_qty}</TableCell>
                      <TableCell>
                        {item.current_qty > item.min_qty ? (
                          <Badge className="bg-green-600 text-white hover:bg-green-700">OK</Badge>
                        ) : (
                          <Badge variant="destructive">Baixo</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {canCreate && (
                            <Button size="sm" variant="ghost" onClick={() => openEdit(item)} title="Editar">
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => openMovement(item)}>
                            <ArrowUpDown className="h-3 w-3 mr-1" />
                            Mov.
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Category Dialog */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Categoria</DialogTitle>
            <DialogDescription>Crie uma categoria para organizar os itens do estoque.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={catForm.name} onChange={(e) => setCatForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={catForm.description} onChange={(e) => setCatForm(p => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateCategory} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <Label>Categoria</Label>
              <Select value={newItemForm.category_id} onValueChange={(v) => setNewItemForm(p => ({ ...p, category_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione uma categoria" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
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
                <Label>Qtd. mínima *</Label>
                <Input type="number" min="0" value={newItemForm.min_qty} onChange={(e) => setNewItemForm(p => ({ ...p, min_qty: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={newItemForm.description} onChange={(e) => setNewItemForm(p => ({ ...p, description: e.target.value }))} placeholder="Detalhes adicionais do item..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewItemOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateItem} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Item: {editItem?.name}</DialogTitle>
            <DialogDescription>Edite nome, categoria e quantidade mínima. O saldo só pode ser alterado via movimentação.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={editForm.category_id} onValueChange={(v) => setEditForm(p => ({ ...p, category_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Qtd. mínima</Label>
              <Input type="number" min="0" value={editForm.min_qty} onChange={(e) => setEditForm(p => ({ ...p, min_qty: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm(p => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleEditItem} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement Dialog */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Movimentar: {moveItem?.name}</DialogTitle>
            <DialogDescription>Registre uma entrada, saída ou ajuste de estoque.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={moveForm.move_type} onValueChange={(v) => setMoveForm(p => ({ ...p, move_type: normalizeStockMoveType(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ENTRADA">Entrada</SelectItem>
                  <SelectItem value="SAIDA">Saída</SelectItem>
                  <SelectItem value="AJUSTE">Ajuste (com justificativa)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Quantidade *</Label>
              <Input type="number" min="1" value={moveForm.qty} onChange={(e) => setMoveForm(p => ({ ...p, qty: e.target.value }))} />
            </div>
            {moveForm.move_type === 'SAIDA' && (
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
              <Label>{moveForm.move_type === 'AJUSTE' ? 'Justificativa *' : 'Observação'}</Label>
              <Textarea
                value={moveForm.notes}
                onChange={(e) => setMoveForm(p => ({ ...p, notes: e.target.value }))}
                placeholder={moveForm.move_type === 'AJUSTE' ? 'Justificativa obrigatória para ajuste...' : 'Observação opcional...'}
              />
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
