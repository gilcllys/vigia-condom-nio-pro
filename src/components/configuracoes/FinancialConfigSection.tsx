import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCondo } from '@/contexts/CondoContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { DollarSign, Save, Loader2 } from 'lucide-react';

interface ConfigFields {
  alcada_1_limite: string;
  alcada_2_limite: string;
  alcada_3_limite: string;
  approval_deadline_hours: string;
  notify_residents_above: string;
  monthly_limit_manutencao: string;
  monthly_limit_limpeza: string;
  monthly_limit_seguranca: string;
  annual_budget: string;
  annual_budget_alert_pct: string;
}

const emptyFields: ConfigFields = {
  alcada_1_limite: '',
  alcada_2_limite: '',
  alcada_3_limite: '',
  approval_deadline_hours: '48',
  notify_residents_above: '',
  monthly_limit_manutencao: '',
  monthly_limit_limpeza: '',
  monthly_limit_seguranca: '',
  annual_budget: '',
  annual_budget_alert_pct: '80',
};

export default function FinancialConfigSection() {
  const { condoId, role } = useCondo();
  const { toast } = useToast();
  const [fields, setFields] = useState<ConfigFields>(emptyFields);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isSindico = role === 'SINDICO' || role === 'ADMIN';
  if (!isSindico) return null;

  useEffect(() => {
    if (!condoId) return;
    setLoading(true);
    supabase
      .from('condo_financial_config')
      .select('*')
      .eq('condo_id', condoId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setExistingId(data.id);
          setFields({
            alcada_1_limite: data.alcada_1_limite?.toString() ?? '',
            alcada_2_limite: data.alcada_2_limite?.toString() ?? '',
            alcada_3_limite: data.alcada_3_limite?.toString() ?? '',
            approval_deadline_hours: data.approval_deadline_hours?.toString() ?? '48',
            notify_residents_above: data.notify_residents_above?.toString() ?? '',
            monthly_limit_manutencao: data.monthly_limit_manutencao?.toString() ?? '',
            monthly_limit_limpeza: data.monthly_limit_limpeza?.toString() ?? '',
            monthly_limit_seguranca: data.monthly_limit_seguranca?.toString() ?? '',
            annual_budget: data.annual_budget?.toString() ?? '',
            annual_budget_alert_pct: data.annual_budget_alert_pct?.toString() ?? '80',
          });
        }
        setLoading(false);
      });
  }, [condoId]);

  const num = (v: string) => v.trim() === '' ? null : parseFloat(v);

  const handleSave = async () => {
    if (!condoId) return;
    setSaving(true);

    const payload = {
      condo_id: condoId,
      alcada_1_limite: num(fields.alcada_1_limite),
      alcada_2_limite: num(fields.alcada_2_limite),
      alcada_3_limite: num(fields.alcada_3_limite),
      approval_deadline_hours: num(fields.approval_deadline_hours) ?? 48,
      notify_residents_above: num(fields.notify_residents_above),
      monthly_limit_manutencao: num(fields.monthly_limit_manutencao),
      monthly_limit_limpeza: num(fields.monthly_limit_limpeza),
      monthly_limit_seguranca: num(fields.monthly_limit_seguranca),
      annual_budget: num(fields.annual_budget),
      annual_budget_alert_pct: num(fields.annual_budget_alert_pct) ?? 80,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (existingId) {
      ({ error } = await supabase
        .from('condo_financial_config')
        .update(payload)
        .eq('id', existingId));
    } else {
      const res = await supabase
        .from('condo_financial_config')
        .insert(payload)
        .select('id')
        .single();
      error = res.error;
      if (res.data) setExistingId(res.data.id);
    }

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Configurações financeiras salvas!' });
    }
    setSaving(false);
  };

  const set = (key: keyof ConfigFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields(prev => ({ ...prev, [key]: e.target.value }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          Configurações Financeiras
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
        ) : (
          <>
            {/* Alçadas */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Alçadas de Aprovação</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Alçada 1 (até R$)</Label>
                  <p className="text-[10px] text-muted-foreground">Só Subsíndico</p>
                  <Input type="number" min={0} step="0.01" value={fields.alcada_1_limite} onChange={set('alcada_1_limite')} placeholder="Ex: 500" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Alçada 2 (até R$)</Label>
                  <p className="text-[10px] text-muted-foreground">Subsíndico + Conselho</p>
                  <Input type="number" min={0} step="0.01" value={fields.alcada_2_limite} onChange={set('alcada_2_limite')} placeholder="Ex: 2000" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Alçada 3 (até R$)</Label>
                  <p className="text-[10px] text-muted-foreground">Subsíndico + Conselho + Síndico</p>
                  <Input type="number" min={0} step="0.01" value={fields.alcada_3_limite} onChange={set('alcada_3_limite')} placeholder="Ex: 10000" />
                </div>
              </div>
            </div>

            {/* Prazos e Notificações */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Prazos e Notificações</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Prazo de aprovação (horas)</Label>
                  <Input type="number" min={1} value={fields.approval_deadline_hours} onChange={set('approval_deadline_hours')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Notificar moradores acima de (R$)</Label>
                  <Input type="number" min={0} step="0.01" value={fields.notify_residents_above} onChange={set('notify_residents_above')} placeholder="Ex: 5000" />
                </div>
              </div>
            </div>

            {/* Cotas mensais */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Limites Mensais por Categoria</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Manutenção (R$/mês)</Label>
                  <Input type="number" min={0} step="0.01" value={fields.monthly_limit_manutencao} onChange={set('monthly_limit_manutencao')} placeholder="Sem limite" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Limpeza (R$/mês)</Label>
                  <Input type="number" min={0} step="0.01" value={fields.monthly_limit_limpeza} onChange={set('monthly_limit_limpeza')} placeholder="Sem limite" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Segurança (R$/mês)</Label>
                  <Input type="number" min={0} step="0.01" value={fields.monthly_limit_seguranca} onChange={set('monthly_limit_seguranca')} placeholder="Sem limite" />
                </div>
              </div>
            </div>

            {/* Orçamento anual */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Orçamento Anual</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Orçamento anual (R$)</Label>
                  <Input type="number" min={0} step="0.01" value={fields.annual_budget} onChange={set('annual_budget')} placeholder="Ex: 120000" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Alerta ao atingir (%)</Label>
                  <Input type="number" min={1} max={100} value={fields.annual_budget_alert_pct} onChange={set('annual_budget_alert_pct')} />
                </div>
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar Configurações
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
