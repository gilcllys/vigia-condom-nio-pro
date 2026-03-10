import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SOActivity {
  id: string;
  activity_type: string;
  description: string | null;
  user_id: string;
  created_at: string;
}

const activityColor: Record<string, string> = {
  OS_CRIADA: 'bg-primary',
  EXECUCAO_INICIADA: 'bg-blue-500',
  ENVIADA_APROVACAO: 'bg-amber-500',
  OS_FINALIZADA: 'bg-green-500',
  OS_CANCELADA: 'bg-destructive',
  FOTO_ADICIONADA: 'bg-violet-500',
  MATERIAL_ADICIONADO: 'bg-teal-500',
  DOCUMENTO_ANEXADO: 'bg-orange-500',
  APROVACAO_REGISTRADA: 'bg-green-500',
  REJEICAO_REGISTRADA: 'bg-red-500',
  MINERVA_EXERCIDO: 'bg-amber-600',
  NF_ENVIADA_APROVACAO: 'bg-blue-400',
  APROVACAO_FINAL_ENVIADA: 'bg-indigo-500',
  PRAZO_EXPIRADO: 'bg-gray-500',
};

interface Props {
  activities: SOActivity[];
}

export function OSTimelineCard({ activities }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Linha do Tempo
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
        ) : (
          <div className="relative space-y-0">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
            {activities.map((a) => (
              <div key={a.id} className="relative flex gap-3 items-start pb-4 last:pb-0">
                <div
                  className={`mt-1.5 h-3.5 w-3.5 rounded-full shrink-0 z-10 border-2 border-background ${activityColor[a.activity_type] ?? 'bg-muted-foreground'}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{a.description ?? a.activity_type}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
