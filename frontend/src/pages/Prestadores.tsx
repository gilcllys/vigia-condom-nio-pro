import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useCondo } from '@/contexts/CondoContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, Building2, CheckCircle2, AlertTriangle, XCircle, Shield, Loader2 } from 'lucide-react';

interface Provider {
  id: string;
  document: string | null;
  legal_name: string | null;
  trade_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  neighborhood: string | null;
  cidade: string | null;
  estado: string | null;
  zip_code: string | null;
  tipo_servico: string | null;
  observacoes: string | null;
  status: string;
  risk_score: number | null;
  created_at: string;
}

interface RiskAnalysis {
  id: string;
  score: number;
  risk_level: string;
  receita_status: string | null;
  recommendation: string | null;
  positive_points: string[];
  attention_points: string[];
  summary: string | null;
  full_report: string | null;
  analyzed_at: string;
}

const SERVICE_TYPES = [
  'Elétrica', 'Hidráulica', 'Limpeza', 'Jardinagem', 'Segurança',
  'Pintura', 'Reforma', 'TI', 'Outros',
];

function getRiskBadge(score: number | null) {
  if (score === null || score === undefined) return { label: 'Não analisado', className: 'bg-muted text-muted-foreground' };
  if (score >= 80) return { label: 'Baixo Risco', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' };
  if (score >= 60) return { label: 'Médio Risco', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' };
  if (score >= 40) return { label: 'Atenção', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' };
  return { label: 'Alto Risco', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' };
}

function getRecommendationBadge(rec: string | null) {
  if (!rec) return null;
  if (rec === 'APROVADO') return { label: 'Aprovado', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' };
  if (rec === 'ATENCAO') return { label: 'Atenção', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' };
  return { label: 'Reprovado', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' };
}

export default function Prestadores() {
  const { condoId } = useCondo();
  const { toast } = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailProvider, setDetailProvider] = useState<Provider | null>(null);
  const [riskAnalysis, setRiskAnalysis] = useState<RiskAnalysis | null>(null);
  const [analyzingRisk, setAnalyzingRisk] = useState(false);

  // New provider form
  const [cnpjSearch, setCnpjSearch] = useState('');
  const [searchingCnpj, setSearchingCnpj] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    document: '', legal_name: '', trade_name: '', phone: '', email: '',
    address: '', neighborhood: '', cidade: '', estado: '', zip_code: '', tipo_servico: '', observacoes: '',
  });

  const fetchProviders = async () => {
    if (!condoId) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/data/providers/?condo_id=${condoId}&ordering=trade_name`);
      const data = res.ok ? await res.json() : [];
      setProviders(Array.isArray(data) ? data : data.results ?? []);
    } catch {
      setProviders([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchProviders(); }, [condoId]);

  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    return digits;
  };

  const handleSearchCnpj = async () => {
    const cnpj = cnpjSearch.replace(/\D/g, '');
    if (cnpj.length !== 14) {
      toast({ title: 'CNPJ deve ter 14 dígitos', variant: 'destructive' });
      return;
    }
    setSearchingCnpj(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!res.ok) throw new Error('CNPJ não encontrado');
      const data = await res.json();
      const parts = [data.logradouro, data.numero, data.complemento].filter(Boolean);
      setForm({
        document: data.cnpj || cnpj,
        legal_name: data.razao_social || '',
        trade_name: data.nome_fantasia || data.razao_social || '',
        phone: data.ddd_telefone_1 || '',
        email: data.email || '',
        address: parts.join(', '),
        neighborhood: data.bairro || '',
        cidade: data.municipio || '',
        estado: data.uf || '',
        zip_code: data.cep || '',
        tipo_servico: form.tipo_servico,
        observacoes: form.observacoes,
      });
      toast({ title: 'Dados do CNPJ carregados com sucesso' });
    } catch {
      toast({ title: 'Não foi possível consultar o CNPJ', variant: 'destructive' });
    }
    setSearchingCnpj(false);
  };

  const handleSave = async () => {
    if (!form.trade_name.trim()) {
      toast({ title: 'Nome/Razão Social é obrigatório', variant: 'destructive' });
      return;
    }
    if (!condoId) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/data/providers/', {
        method: 'POST',
        body: JSON.stringify({
          condo_id: condoId,
          document: form.document || null,
          legal_name: form.legal_name || null,
          trade_name: form.trade_name,
          phone: form.phone || null,
          email: form.email || null,
          address: form.address || null,
          neighborhood: form.neighborhood || null,
          cidade: form.cidade || null,
          estado: form.estado || null,
          zip_code: form.zip_code || null,
          tipo_servico: form.tipo_servico || null,
          observacoes: form.observacoes || null,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || 'Erro ao salvar prestador');
      }
      toast({ title: 'Prestador cadastrado com sucesso' });
      setModalOpen(false);
      resetForm();
      fetchProviders();
    } catch (err: any) {
      toast({ title: 'Erro ao salvar prestador', description: err.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const resetForm = () => {
    setCnpjSearch('');
    setForm({ document: '', legal_name: '', trade_name: '', phone: '', email: '', address: '', neighborhood: '', cidade: '', estado: '', zip_code: '', tipo_servico: '', observacoes: '' });
  };

  const openDetail = async (provider: Provider) => {
    setDetailProvider(provider);
    setRiskAnalysis(null);
    try {
      const res = await apiFetch(`/api/data/providers/${provider.id}/risk-analysis/`);
      if (res.ok) {
        const data = await res.json();
        if (data) {
          setRiskAnalysis({
            ...data,
            positive_points: Array.isArray(data.positive_points) ? data.positive_points as string[] : [],
            attention_points: Array.isArray(data.attention_points) ? data.attention_points as string[] : [],
          });
        }
      }
    } catch {
      // No risk analysis available
    }
  };

  const handleAnalyzeRisk = async () => {
    if (!detailProvider?.document) {
      toast({ title: 'Prestador sem CNPJ cadastrado', variant: 'destructive' });
      return;
    }
    setAnalyzingRisk(true);
    try {
      const cnpj = detailProvider.document.replace(/\D/g, '');
      const cnpjRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!cnpjRes.ok) throw new Error('Não foi possível consultar CNPJ');
      const cnpjData = await cnpjRes.json();

      const fnRes = await apiFetch('/api/providers/analyze-risk/', {
        method: 'POST',
        body: JSON.stringify({ cnpjData }),
      });
      const data = await fnRes.json();
      const error = fnRes.ok ? null : new Error(data?.error || 'Erro na análise de risco');

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Save risk analysis
      const saveRes = await apiFetch(`/api/data/providers/${detailProvider.id}/risk-analysis/`, {
        method: 'POST',
        body: JSON.stringify({
          score: data.score ?? 0,
          risk_level: data.nivel_risco ?? 'MEDIO',
          receita_status: data.situacao_receita ?? null,
          recommendation: data.recomendacao ?? null,
          positive_points: data.pontos_positivos ?? [],
          attention_points: data.pontos_atencao ?? [],
          summary: data.relatorio_resumido ?? null,
          full_report: data.relatorio_completo ?? null,
          cnpj_data: cnpjData,
        }),
      });

      if (!saveRes.ok) {
        console.error('Save error:', await saveRes.text());
        toast({ title: 'Análise concluída mas houve erro ao salvar', variant: 'destructive' });
      }

      // Update provider risk score
      await apiFetch(`/api/data/providers/${detailProvider.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ risk_score: data.score ?? 0 }),
      });

      setRiskAnalysis({
        id: '',
        score: data.score ?? 0,
        risk_level: data.nivel_risco ?? 'MEDIO',
        receita_status: data.situacao_receita ?? null,
        recommendation: data.recomendacao ?? null,
        positive_points: data.pontos_positivos ?? [],
        attention_points: data.pontos_atencao ?? [],
        summary: data.relatorio_resumido ?? null,
        full_report: data.relatorio_completo ?? null,
        analyzed_at: new Date().toISOString(),
      });

      setDetailProvider(prev => prev ? { ...prev, risk_score: data.score ?? 0 } : null);
      toast({ title: 'Análise de risco concluída' });
      fetchProviders();
    } catch (e: any) {
      toast({ title: e.message || 'Erro na análise de risco', variant: 'destructive' });
    }
    setAnalyzingRisk(false);
  };

  const toggleStatus = async (provider: Provider) => {
    const newStatus = provider.status === 'ativo' ? 'inativo' : 'ativo';
    await apiFetch(`/api/data/providers/${provider.id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus }),
    });
    fetchProviders();
    if (detailProvider?.id === provider.id) {
      setDetailProvider(prev => prev ? { ...prev, status: newStatus } : null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Prestadores de Serviço</h1>
          <p className="text-sm text-muted-foreground">Gerencie os prestadores do condomínio</p>
        </div>
        <Button onClick={() => { resetForm(); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo Prestador
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : providers.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">Nenhum prestador cadastrado.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome / Razão Social</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Tipo de Serviço</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Score de Risco</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map(p => {
                  const risk = getRiskBadge(p.risk_score);
                  return (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => openDetail(p)}>
                      <TableCell className="font-medium">{p.trade_name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.document ? p.document.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '—'}
                      </TableCell>
                      <TableCell>{p.tipo_servico || '—'}</TableCell>
                      <TableCell>
                        <Badge className={p.status === 'ativo'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }>
                          {p.status === 'ativo' ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={risk.className}>{risk.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); toggleStatus(p); }}>
                          {p.status === 'ativo' ? 'Desativar' : 'Ativar'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* New Provider Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Prestador</DialogTitle>
            <DialogDescription>Busque pelo CNPJ para preenchimento automático.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <div className="flex gap-2">
                <Input
                  value={cnpjSearch}
                  onChange={(e) => setCnpjSearch(formatCnpj(e.target.value))}
                  placeholder="00000000000000"
                  maxLength={14}
                />
                <Button variant="outline" onClick={handleSearchCnpj} disabled={searchingCnpj}>
                  {searchingCnpj ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Buscar
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>Razão Social *</Label>
                <Input value={form.legal_name} onChange={e => setForm(f => ({ ...f, legal_name: e.target.value }))} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Nome Fantasia *</Label>
                <Input value={form.trade_name} onChange={e => setForm(f => ({ ...f, trade_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Endereço</Label>
                <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Bairro</Label>
                <Input value={form.neighborhood} onChange={e => setForm(f => ({ ...f, neighborhood: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input value={form.cidade} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Input value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))} maxLength={2} />
              </div>
              <div className="space-y-2">
                <Label>CEP</Label>
                <Input value={form.zip_code} onChange={e => setForm(f => ({ ...f, zip_code: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Serviço</Label>
                <Select value={form.tipo_servico} onValueChange={v => setForm(f => ({ ...f, tipo_servico: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Provider Detail Modal */}
      <Dialog open={!!detailProvider} onOpenChange={(open) => { if (!open) setDetailProvider(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {detailProvider?.trade_name}
            </DialogTitle>
            <DialogDescription>
              {detailProvider?.legal_name && detailProvider.legal_name !== detailProvider.trade_name
                ? detailProvider.legal_name
                : 'Detalhes do prestador'}
            </DialogDescription>
          </DialogHeader>

          {detailProvider && (
            <div className="space-y-6 py-2">
              {/* Info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {detailProvider.document && (
                  <div><span className="text-muted-foreground">CNPJ:</span> {detailProvider.document.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}</div>
                )}
                {detailProvider.phone && <div><span className="text-muted-foreground">Telefone:</span> {detailProvider.phone}</div>}
                {detailProvider.email && <div><span className="text-muted-foreground">Email:</span> {detailProvider.email}</div>}
                {detailProvider.tipo_servico && <div><span className="text-muted-foreground">Serviço:</span> {detailProvider.tipo_servico}</div>}
                {detailProvider.cidade && <div><span className="text-muted-foreground">Cidade:</span> {detailProvider.cidade}/{detailProvider.estado}</div>}
                <div>
                  <span className="text-muted-foreground">Situação:</span>{' '}
                  <Badge className={detailProvider.status === 'ativo'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                  }>
                    {detailProvider.status === 'ativo' ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </div>

              {/* Risk Analysis */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">Análise de Risco</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAnalyzeRisk}
                    disabled={analyzingRisk || !detailProvider.document}
                  >
                    {analyzingRisk ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Analisando...</>
                    ) : (
                      <><Shield className="h-4 w-4 mr-1" /> Analisar Risco</>
                    )}
                  </Button>
                </div>

                {analyzingRisk && (
                  <Card>
                    <CardContent className="flex items-center justify-center py-8">
                      <div className="text-center space-y-2">
                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                        <p className="text-sm text-muted-foreground">Analisando empresa, aguarde...</p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {riskAnalysis && !analyzingRisk && (
                  <Card>
                    <CardContent className="pt-4 space-y-4">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-foreground">{riskAnalysis.score}</div>
                          <Badge className={getRiskBadge(riskAnalysis.score).className}>
                            {getRiskBadge(riskAnalysis.score).label}
                          </Badge>
                        </div>
                        {riskAnalysis.recommendation && (
                          <Badge className={getRecommendationBadge(riskAnalysis.recommendation)?.className ?? ''}>
                            {getRecommendationBadge(riskAnalysis.recommendation)?.label}
                          </Badge>
                        )}
                        {riskAnalysis.receita_status && (
                          <div className="text-sm text-muted-foreground">
                            Receita Federal: <span className="text-foreground font-medium">{riskAnalysis.receita_status}</span>
                          </div>
                        )}
                      </div>

                      {riskAnalysis.summary && (
                        <p className="text-sm text-muted-foreground border-l-2 border-primary pl-3">{riskAnalysis.summary}</p>
                      )}

                      {riskAnalysis.positive_points.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-foreground mb-1 flex items-center gap-1">
                            <CheckCircle2 className="h-4 w-4 text-green-600" /> Pontos Positivos
                          </h4>
                          <ul className="space-y-1">
                            {riskAnalysis.positive_points.map((p, i) => (
                              <li key={i} className="text-sm text-green-700 dark:text-green-300 pl-5">• {p}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {riskAnalysis.attention_points.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-foreground mb-1 flex items-center gap-1">
                            <AlertTriangle className="h-4 w-4 text-orange-600" /> Pontos de Atenção
                          </h4>
                          <ul className="space-y-1">
                            {riskAnalysis.attention_points.map((p, i) => (
                              <li key={i} className="text-sm text-orange-700 dark:text-orange-300 pl-5">• {p}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {riskAnalysis.full_report && (
                        <details className="text-sm">
                          <summary className="cursor-pointer text-primary font-medium">Ver relatório completo</summary>
                          <p className="mt-2 text-muted-foreground whitespace-pre-wrap">{riskAnalysis.full_report}</p>
                        </details>
                      )}

                      <p className="text-xs text-muted-foreground">
                        Análise realizada em {new Date(riskAnalysis.analyzed_at).toLocaleString('pt-BR')}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {!riskAnalysis && !analyzingRisk && (
                  <p className="text-sm text-muted-foreground">
                    {detailProvider.document
                      ? 'Nenhuma análise realizada. Clique em "Analisar Risco" para gerar o relatório.'
                      : 'Cadastre o CNPJ do prestador para habilitar a análise de risco.'}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
