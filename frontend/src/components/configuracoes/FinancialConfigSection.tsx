import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
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

  useEffect(() => {
    if (!condoId || !isSindico) { setLoading(false); return; }
    setLoading(true);
    apiFetch(`/api/data/condos/${condoId}/financial-config/`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.id) {
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
      })
      .catch(() => setLoading(false));
  }, [condoId, isSindico]);

  if (!isSindico) return null;

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
    };

    try {
      const res = await apiFetch(`/api/data/condos/${condoId}/financial-config/`, {
        method: existingId ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: 'Erro ao salvar', description: err?.error || 'Tente novamente.', variant: 'destructive' });
      } else {
        const data = await res.json();
        if (data?.id) setExistingId(data.id);
        toast({ title: 'Configurações financeiras salvas!' });
      }
    } catch {
      toast({ title: 'Erro ao salvar', description: 'Erro de conexão.', variant: 'destructive' });
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
            {/* Explicação visual das Alçadas */}
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Como funcionam as Alçadas de Aprovação</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Cada nota fiscal passa por um fluxo de aprovação hierárquico baseado no valor do documento.
                Quanto maior o valor, mais aprovadores são necessários.
              </p>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-0">
                {/* Alçada 1 */}
                <div className="flex-1 rounded-md border border-primary/30 bg-primary/5 p-3 text-center space-y-1">
                  <span className="inline-block rounded-full bg-primary/15 text-primary text-[10px] font-semibold px-2 py-0.5">Alçada 1</span>
                  <p className="text-xs font-medium text-foreground">Subsíndico</p>
                  <p className="text-[10px] text-muted-foreground">Valores menores</p>
                </div>
                <div className="hidden sm:flex items-center px-1 text-muted-foreground">&rarr;</div>
                <div className="flex sm:hidden items-center justify-center text-muted-foreground">&darr;</div>
                {/* Alçada 2 */}
                <div className="flex-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-center space-y-1">
                  <span className="inline-block rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[10px] font-semibold px-2 py-0.5">Alçada 2</span>
                  <p className="text-xs font-medium text-foreground">Subsíndico + Conselho</p>
                  <p className="text-[10px] text-muted-foreground">Valores médios</p>
                </div>
                <div className="hidden sm:flex items-center px-1 text-muted-foreground">&rarr;</div>
                <div className="flex sm:hidden items-center justify-center text-muted-foreground">&darr;</div>
                {/* Alçada 3 */}
                <div className="flex-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-center space-y-1">
                  <span className="inline-block rounded-full bg-destructive/15 text-destructive text-[10px] font-semibold px-2 py-0.5">Alçada 3</span>
                  <p className="text-xs font-medium text-foreground">Subsíndico + Conselho + Síndico</p>
                  <p className="text-[10px] text-muted-foreground">Valores altos</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                Se um aprovador não votar dentro do prazo configurado, o próximo nível é desbloqueado automaticamente.
                Uma rejeição em qualquer nível cancela o documento.
              </p>
            </div>

            {/* Alçadas — campos */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Limites por Alçada</h3>
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

            {/* Orçamento mensal */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Orçamento Mensal</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Orçamento mensal (R$)</Label>
                  <Input type="number" min={0} step="0.01" value={fields.annual_budget} onChange={set('annual_budget')} placeholder="Ex: 10000" />
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
