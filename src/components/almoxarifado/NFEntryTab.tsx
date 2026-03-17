import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCondo } from '@/contexts/CondoContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, Loader2, Plus, Trash2, FileText } from 'lucide-react';

interface ExtractedItem {
  nome: string;
  quantidade: number;
  valor_unitario: number;
  stock_item_id: string;
  create_new: boolean;
  category_id: string;
}

interface StockCategory {
  id: string;
  name: string;
}

interface NFData {
  numero_nf: string;
  data_emissao: string;
  fornecedor: string;
  valor_total: number;
  itens: ExtractedItem[];
}

interface StockItemOption {
  id: string;
  name: string;
}

type Step = 'upload' | 'extracting' | 'review';

const emptyNF: NFData = {
  numero_nf: '',
  data_emissao: '',
  fornecedor: '',
  valor_total: 0,
  itens: [],
};

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function NFEntryTab() {
  const { condoId } = useCondo();
  const { user } = useAuth();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('upload');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [nfData, setNfData] = useState<NFData>(emptyNF);
  const [stockItems, setStockItems] = useState<StockItemOption[]>([]);
  const [stockCategories, setStockCategories] = useState<StockCategory[]>([]);
  const [destination, setDestination] = useState('almoxarifado');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!condoId) return;
    supabase
      .from('stock_items')
      .select('id, name')
      .eq('condo_id', condoId)
      .is('deleted_at', null)
      .order('name')
      .then(({ data }) => setStockItems(data ?? []));

    supabase
      .from('stock_categories')
      .select('id, name')
      .eq('condo_id', condoId)
      .order('name')
      .then(({ data }) => setStockCategories(data ?? []));
  }, [condoId]);

  const handleFileSelect = async (file: File) => {
    if (!condoId) return;
    setUploadedFile(file);

    // Upload to storage
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${condoId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('nfe-vigia')
      .upload(path, file, { contentType: file.type });

    if (uploadError) {
      toast({ title: 'Erro no upload', description: uploadError.message, variant: 'destructive' });
      return;
    }

    setFileUrl(path);
    setStep('extracting');

    // Extract with Claude via edge function
    try {
      const base64 = await fileToBase64(file);
      const mediaType = file.type || 'image/jpeg';

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-nf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ fileBase64: base64, mediaType }),
        }
      );

      if (!response.ok) {
        throw new Error('Erro na extração');
      }

      const extracted = await response.json();
      setNfData({
        numero_nf: extracted.numero_nf || '',
        data_emissao: extracted.data_emissao || '',
        fornecedor: extracted.fornecedor || '',
        valor_total: extracted.valor_total || 0,
        itens: (extracted.itens || []).map((item: any) => ({
          nome: item.descricao || item.nome || '',
          quantidade: item.quantidade || 0,
          valor_unitario: item.valor_unitario || 0,
          stock_item_id: '',
          create_new: true,
          category_id: '',
        })),
      });
      toast({ title: 'Dados extraídos automaticamente', description: 'Confira e ajuste se necessário.' });
      setStep('review');
    } catch (err: any) {
      console.error('AI extraction error:', err);
      toast({
        title: 'Não foi possível ler automaticamente',
        description: 'Preencha os dados manualmente.',
        variant: 'destructive',
      });
      setNfData({ ...emptyNF, itens: [{ nome: '', quantidade: 0, valor_unitario: 0, stock_item_id: '', create_new: true, category_id: '' }] });
      setStep('review');
    }
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const updateItem = (index: number, field: keyof ExtractedItem, value: any) => {
    setNfData(prev => ({
      ...prev,
      itens: prev.itens.map((item, i) => i === index ? { ...item, [field]: value } : item),
    }));
  };

  const removeItem = (index: number) => {
    setNfData(prev => ({
      ...prev,
      itens: prev.itens.filter((_, i) => i !== index),
    }));
  };

  const addItem = () => {
    setNfData(prev => ({
      ...prev,
      itens: [...prev.itens, { nome: '', quantidade: 0, valor_unitario: 0, stock_item_id: '', create_new: true, category_id: '' }],
    }));
  };

  const handleSave = async () => {
    if (!condoId || !user) return;
    if (!nfData.numero_nf.trim()) {
      toast({ title: 'Número da NF é obrigatório', variant: 'destructive' });
      return;
    }
    if (nfData.itens.length === 0) {
      toast({ title: 'Adicione pelo menos um item', variant: 'destructive' });
      return;
    }

    setSaving(true);

    try {
      const { data: internalUser } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (!internalUser) {
        toast({ title: 'Erro ao identificar usuário', variant: 'destructive' });
        setSaving(false);
        return;
      }

      const { data: fdDoc, error: fdError } = await supabase
        .from('fiscal_documents')
        .insert({
          condo_id: condoId,
          document_type: 'NFE',
          source_type: 'UPLOAD',
          supplier: nfData.fornecedor.trim(),
          number: nfData.numero_nf.trim(),
          issue_date: nfData.data_emissao || null,
          amount: nfData.valor_total,
          status: 'PENDENTE',
          created_by: internalUser.id,
        })
        .select('id')
        .single();

      if (fdError || !fdDoc) {
        toast({ title: 'Erro ao salvar NF', description: fdError?.message, variant: 'destructive' });
        setSaving(false);
        return;
      }

      for (const item of nfData.itens) {
        let itemId = item.stock_item_id;

        if (item.create_new || !itemId) {
          const { data: newItem, error: newItemErr } = await supabase
            .from('stock_items')
            .insert({
              condo_id: condoId,
              name: item.nome.trim(),
              unit: 'un',
              min_qty: 0,
              category_id: item.category_id || null,
            })
            .select('id')
            .single();

          if (newItemErr || !newItem) {
            console.error('Error creating stock item:', newItemErr);
            continue;
          }
          itemId = newItem.id;
        }

        await supabase
          .from('stock_movements')
          .insert({
            condo_id: condoId,
            item_id: itemId,
            move_type: 'entrada',
            qty: item.quantidade,
            unit_cost_cents: Math.round(item.valor_unitario * 100),
            supplier_name: nfData.fornecedor.trim(),
            fiscal_document_id: fdDoc.id,
            destination,
            moved_by_user_id: internalUser.id,
            moved_at: new Date().toISOString(),
          });
      }

      const { data: approvers } = await supabase
        .from('user_condos')
        .select('user_id, role')
        .eq('condo_id', condoId)
        .in('role', ['SUBSINDICO', 'CONSELHO'])
        .eq('status', 'ativo');

      if (approvers && approvers.length > 0) {
        const approvalRows = approvers.map((a: any) => ({
          fiscal_document_id: fdDoc.id,
          condo_id: condoId,
          approver_user_id: a.user_id,
          approver_role: a.role,
          decision: 'pendente',
        }));

        await supabase
          .from('fiscal_document_approvals')
          .insert(approvalRows);
      }

      toast({ title: 'NF salva! Aguardando aprovação do subsíndico e conselheiros.' });
      setStep('upload');
      setFileUrl(null);
      setUploadedFile(null);
      setNfData(emptyNF);
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' });
    }

    setSaving(false);
  };

  if (step === 'extracting') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground font-medium">Lendo nota fiscal...</p>
          <p className="text-sm text-muted-foreground">Extraindo dados automaticamente com IA.</p>
        </CardContent>
      </Card>
    );
  }

  if (step === 'review') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Revisar Dados da NF
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Número da NF *</Label>
              <Input value={nfData.numero_nf} onChange={(e) => setNfData(p => ({ ...p, numero_nf: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Data de Emissão</Label>
              <Input type="date" value={nfData.data_emissao} onChange={(e) => setNfData(p => ({ ...p, data_emissao: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Fornecedor</Label>
              <Input value={nfData.fornecedor} onChange={(e) => setNfData(p => ({ ...p, fornecedor: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Valor Total</Label>
              <Input type="number" step="0.01" value={nfData.valor_total} onChange={(e) => setNfData(p => ({ ...p, valor_total: Number(e.target.value) }))} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Destino dos itens</Label>
            <Select value={destination} onValueChange={setDestination}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="almoxarifado">Almoxarifado</SelectItem>
                <SelectItem value="obra_aberta">Obra aberta</SelectItem>
                <SelectItem value="em_espera">Em espera</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Itens</Label>
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-3 w-3 mr-1" />
                Adicionar item
              </Button>
            </div>

            {nfData.itens.map((item, idx) => (
              <div key={idx} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Item {idx + 1}</span>
                  <Button size="sm" variant="ghost" onClick={() => removeItem(idx)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Nome</Label>
                    <Input value={item.nome} onChange={(e) => updateItem(idx, 'nome', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Quantidade</Label>
                    <Input type="number" min="0" value={item.quantidade} onChange={(e) => updateItem(idx, 'quantidade', Number(e.target.value))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Valor Unitário</Label>
                    <Input type="number" step="0.01" min="0" value={item.valor_unitario} onChange={(e) => updateItem(idx, 'valor_unitario', Number(e.target.value))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Vincular a item existente</Label>
                  <Select
                    value={item.create_new ? '__new__' : item.stock_item_id}
                    onValueChange={(v) => {
                      if (v === '__new__') {
                        updateItem(idx, 'create_new', true);
                        updateItem(idx, 'stock_item_id', '');
                      } else {
                        updateItem(idx, 'create_new', false);
                        updateItem(idx, 'stock_item_id', v);
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Criar novo item" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new__">+ Criar novo item</SelectItem>
                      {stockItems.map(si => <SelectItem key={si.id} value={si.id}>{si.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {item.create_new && (
                  <div className="space-y-1">
                    <Label className="text-xs">Categoria</Label>
                    <Select
                      value={item.category_id || '__none__'}
                      onValueChange={(v) => updateItem(idx, 'category_id', v === '__none__' ? '' : v)}
                    >
                      <SelectTrigger><SelectValue placeholder="Selecione uma categoria" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sem categoria</SelectItem>
                        {stockCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setStep('upload'); setNfData(emptyNF); setFileUrl(null); setUploadedFile(null); }}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Confirmar e Salvar'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Upload step
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Entrada de Materiais por Nota Fiscal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Fotografe ou faça upload da nota fiscal. A IA extrairá os dados automaticamente para revisão.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              capture="environment"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleCameraCapture}
            />
            <Button variant="outline" className="w-full sm:w-auto pointer-events-none">
              <Camera className="h-4 w-4 mr-2" />
              Fotografar NF
            </Button>
          </div>
          <div className="relative">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleFileUpload}
            />
            <Button variant="outline" className="w-full sm:w-auto pointer-events-none">
              <Upload className="h-4 w-4 mr-2" />
              Upload PDF/Imagem
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
