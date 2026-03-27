import { useEffect, useState } from 'react';
import { apiFetch, apiUpload } from '@/lib/api';
import { useCondo } from '@/contexts/CondoContext';
import { useAuth } from '@/contexts/AuthContext';
import { useFinancialConfig, getRequiredRoles } from '@/hooks/useFinancialConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Camera, Upload, Loader2, Plus, Trash2, FileText } from 'lucide-react';
import { sendApprovalEmails } from '@/lib/send-approval-email';

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
  const { condoId, condoName } = useCondo();
  const { user } = useAuth();
  const { toast } = useToast();
  const { config } = useFinancialConfig(condoId);

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

    apiFetch(`/api/data/stock-items/?condo_id=${condoId}`)
      .then(res => res.json())
      .then(data => {
        const items = Array.isArray(data) ? data : data?.results ?? [];
        setStockItems(items.map((i: any) => ({ id: i.id, name: i.name })));
      })
      .catch(() => setStockItems([]));

    apiFetch(`/api/data/stock-categories/?condo_id=${condoId}`)
      .then(res => res.json())
      .then(data => {
        const cats = Array.isArray(data) ? data : data?.results ?? [];
        setStockCategories(cats.map((c: any) => ({ id: c.id, name: c.name })));
      })
      .catch(() => setStockCategories([]));
  }, [condoId]);

  const handleFileSelect = async (file: File) => {
    if (!condoId) return;
    setUploadedFile(file);

    // Upload to storage
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${condoId}/${crypto.randomUUID()}.${ext}`;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('bucket', 'nfe-vigia');
    formData.append('path', path);

    const uploadRes = await apiUpload('/api/data/storage/upload/', formData);

    if (!uploadRes.ok) {
      const errData = await uploadRes.json().catch(() => ({}));
      toast({ title: 'Erro no upload', description: errData.error || 'Tente novamente.', variant: 'destructive' });
      return;
    }

    const uploadData = await uploadRes.json();
    setFileUrl(uploadData.file_url || uploadData.path || path);
    setStep('extracting');

    // Extract with Claude via API
    try {
      const base64 = await fileToBase64(file);
      const mediaType = file.type || 'image/jpeg';

      const response = await apiFetch('/api/invoices/extract/', {
        method: 'POST',
        body: JSON.stringify({ fileBase64: base64, mediaType }),
      });

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
          quantidade: Number(item.quantidade) || 0,
          valor_unitario: Number(item.valor_unitario) || 0,
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

    const invalidItem = nfData.itens.find(item => !item.nome.trim() || !Number.isFinite(item.quantidade) || item.quantidade <= 0);
    if (invalidItem) {
      toast({ title: 'Todos os itens precisam de nome e quantidade maior que zero', variant: 'destructive' });
      return;
    }

    setSaving(true);

    try {
      // Get internal user id
      const userRes = await apiFetch(`/api/data/users/by-auth-id/?auth_user_id=${user.id}`);
      const internalUser = await userRes.json();

      if (!internalUser || !internalUser.id) {
        toast({ title: 'Erro ao identificar usuário', variant: 'destructive' });
        setSaving(false);
        return;
      }

      // Create fiscal document
      const fdRes = await apiFetch('/api/data/fiscal-documents/', {
        method: 'POST',
        body: JSON.stringify({
          condo_id: condoId,
          document_type: 'NFE',
          source_type: 'UPLOAD',
          supplier: nfData.fornecedor.trim(),
          number: nfData.numero_nf.trim(),
          issue_date: nfData.data_emissao || null,
          amount: nfData.valor_total,
          status: 'PENDENTE',
          file_url: fileUrl,
          created_by: internalUser.id,
        }),
      });

      if (!fdRes.ok) {
        const errData = await fdRes.json().catch(() => ({}));
        toast({ title: 'Erro ao salvar NF', description: errData.error || 'Tente novamente.', variant: 'destructive' });
        setSaving(false);
        return;
      }

      const fdDoc = await fdRes.json();

      for (const item of nfData.itens) {
        const itemName = item.nome.trim();
        let itemId = item.stock_item_id;

        if (item.create_new || !itemId) {
          // Check if stock item already exists by name
          const existingRes = await apiFetch(`/api/data/stock-items/?condo_id=${condoId}&name=${encodeURIComponent(itemName)}`);
          const existingData = await existingRes.json();
          const existingList = Array.isArray(existingData) ? existingData : existingData?.results ?? [];
          const existingItem = existingList.find((i: any) => i.name === itemName);

          if (existingItem?.id) {
            itemId = existingItem.id;
          } else {
            const newItemRes = await apiFetch('/api/data/stock-items/', {
              method: 'POST',
              body: JSON.stringify({
                condo_id: condoId,
                name: itemName,
                unit: 'un',
                min_qty: 0,
                category_id: item.category_id || null,
              }),
            });

            if (!newItemRes.ok) {
              const errData = await newItemRes.json().catch(() => ({}));
              throw new Error(`Erro ao criar item "${itemName}": ${errData.error || 'desconhecido'}`);
            }

            const newItem = await newItemRes.json();
            itemId = newItem.id;
          }
        }

        if (!itemId) {
          throw new Error(`Item sem vínculo de estoque: ${itemName}`);
        }

        // Link item to the fiscal document
        const nfItemRes = await apiFetch('/api/data/fiscal-document-items/', {
          method: 'POST',
          body: JSON.stringify({
            fiscal_document_id: fdDoc.id,
            stock_item_id: itemId,
            qty: item.quantidade,
            unit_price: item.valor_unitario,
          }),
        });

        if (!nfItemRes.ok) {
          const errData = await nfItemRes.json().catch(() => ({}));
          throw new Error(`Erro ao vincular item "${itemName}" à NF: ${errData.error || 'desconhecido'}`);
        }
      }

      // Create approval records
      const requiredRoles = getRequiredRoles(nfData.valor_total ?? 0, config);
      const approversRes = await apiFetch(`/api/data/user-condos/?condo_id=${condoId}&status=ativo`);
      const approversData = await approversRes.json();
      const allUserCondos = Array.isArray(approversData) ? approversData : approversData?.results ?? [];
      const approvers = allUserCondos.filter((a: any) => requiredRoles.includes(a.role));

      const foundRoles = new Set(approvers.map((a: any) => a.role));
      const missingRoles = requiredRoles.filter(r => !foundRoles.has(r));

      if (approvers.length > 0) {
        for (const a of approvers) {
          await apiFetch('/api/data/approvals/', {
            method: 'POST',
            body: JSON.stringify({
              fiscal_document_id: fdDoc.id,
              condo_id: condoId,
              approver_user_id: a.user_id,
              approver_role: a.role,
            }),
          });
        }

        // Notify approvers by email (fire-and-forget)
        void sendApprovalEmails('NF', approvers.map((a: any) => a.user_id), {
          title: `NF #${nfData.numero_nf}${nfData.fornecedor ? ` — ${nfData.fornecedor}` : ''}`,
          amount: nfData.valor_total || undefined,
          condo_name: condoName ?? condoId ?? '',
        });
      }

      if (missingRoles.length > 0) {
        toast({ title: 'NF salva com alerta', description: `Faltam aprovadores para: ${missingRoles.join(', ')}`, variant: 'destructive' });
      } else {
        toast({ title: `NF salva! Aguardando aprovação: ${requiredRoles.join(', ')}` });
      }

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
