import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wrench, Pencil, Save } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface Props {
  orderId: string;
  status: string;
  executorType: string | null;
  executorName: string | null;
  executionNotes: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  canEdit: boolean;
  onSaved: () => void;
}

const executorTypeLabel: Record<string, string> = {
  INTERNO: 'Equipe Interna',
  TERCEIRIZADO: 'Prestador Externo',
  EQUIPE_INTERNA: 'Equipe Interna',
  PRESTADOR_EXTERNO: 'Prestador Externo',
};

export function OSExecutionCard({
  orderId,
  status,
  executorType,
  executorName,
  executionNotes,
  startedAt,
  finishedAt,
  canEdit,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    executor_type: executorType ?? '',
    executor_name: executorName ?? '',
    execution_notes: executionNotes ?? '',
    started_at: startedAt ? startedAt.slice(0, 16) : '',
    finished_at: finishedAt ? finishedAt.slice(0, 16) : '',
  });

  const isInExecution = status === 'EM_EXECUCAO';
  const showEditButton = canEdit && (isInExecution || status === 'AGUARDANDO_APROVACAO');

  const handleSave = async () => {
    setSaving(true);
    if (form.started_at && form.finished_at && new Date(form.finished_at) <= new Date(form.started_at)) {
      toast({ title: 'Data de conclusão deve ser posterior à data de início', variant: 'destructive' });
      setSaving(false);
      return;
    }

    const res = await apiFetch(`/api/data/service-orders/${orderId}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        executor_type: form.executor_type || null,
        executor_name: form.executor_name.trim() || null,
        execution_notes: form.execution_notes.trim() || null,
        started_at: form.started_at ? new Date(form.started_at).toISOString() : null,
        finished_at: form.finished_at ? new Date(form.finished_at).toISOString() : null,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      toast({ title: 'Erro ao salvar dados de execução', description: errData.message ?? errData.detail ?? '', variant: 'destructive' });
    } else {
      toast({ title: 'Dados de execução salvos' });
      setEditing(false);
      onSaved();
    }
    setSaving(false);
  };

  const hasData = executorType || executorName || executionNotes;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          Execução do Serviço
        </CardTitle>
        {showEditButton && !editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {editing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de executor</Label>
              <Select value={form.executor_type} onValueChange={(v) => setForm((p) => ({ ...p, executor_type: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EQUIPE_INTERNA">Equipe Interna</SelectItem>
                  <SelectItem value="PRESTADOR_EXTERNO">Prestador Externo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nome do executor / empresa</Label>
              <Input
                value={form.executor_name}
                onChange={(e) => setForm((p) => ({ ...p, executor_name: e.target.value }))}
                placeholder="Ex: João Silva ou Empresa XYZ"
              />
            </div>
            <div className="space-y-2">
              <Label>Observações da execução</Label>
              <Textarea
                value={form.execution_notes}
                onChange={(e) => setForm((p) => ({ ...p, execution_notes: e.target.value }))}
                placeholder="Detalhes sobre o serviço realizado..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data de início do serviço</Label>
                <Input
                  type="datetime-local"
                  value={form.started_at}
                  onChange={(e) => setForm((p) => ({ ...p, started_at: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Data de conclusão do serviço</Label>
                <Input
                  type="datetime-local"
                  value={form.finished_at}
                  onChange={(e) => setForm((p) => ({ ...p, finished_at: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-4 w-4 mr-1" /> {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        ) : hasData ? (
          <div className="space-y-3">
            {executorType && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tipo de executor</p>
                <p className="text-sm text-foreground">{executorTypeLabel[executorType] ?? executorType}</p>
              </div>
            )}
            {executorName && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Executor</p>
                <p className="text-sm text-foreground">{executorName}</p>
              </div>
            )}
            {executionNotes && (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Observações</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{executionNotes}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum dado de execução registrado.</p>
        )}
      </CardContent>
    </Card>
  );
}
