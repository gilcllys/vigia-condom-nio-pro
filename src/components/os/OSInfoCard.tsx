import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, MapPin, AlertTriangle, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const priorityLabel: Record<string, string> = {
  BAIXA: 'Baixa',
  MEDIA: 'Média',
  ALTA: 'Alta',
};

interface Props {
  description: string | null;
  location: string | null;
  priority: string | null;
  createdAt: string;
  createdBy: string;
}

export function OSInfoCard({ description, location, priority, createdAt, createdBy }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Informações Gerais
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {description && (
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Descrição</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{description}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          {location && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Local
              </p>
              <p className="text-sm text-foreground">{location}</p>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Prioridade
            </p>
            <p className="text-sm text-foreground">{priorityLabel[priority ?? ''] ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Criada em
            </p>
            <p className="text-sm text-foreground">
              {format(new Date(createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" /> Aberta por
            </p>
            <p className="text-sm text-foreground font-mono text-xs">{createdBy.slice(0, 8)}…</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
