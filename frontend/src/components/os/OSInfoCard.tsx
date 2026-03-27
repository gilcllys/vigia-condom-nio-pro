import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, MapPin, AlertTriangle, Calendar, User, Clock, Building2, Ticket } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { apiFetch } from '@/lib/api';

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
  isEmergency?: boolean;
  emergencyJustification?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  providerId?: string | null;
  ticketId?: string | null;
}

export function OSInfoCard({ description, location, priority, createdAt, createdBy, isEmergency, emergencyJustification, startedAt, finishedAt, providerId, ticketId }: Props) {
  const [providerName, setProviderName] = useState<string | null>(null);
  const [ticketTitle, setTicketTitle] = useState<string | null>(null);
  const [creatorName, setCreatorName] = useState<string | null>(null);

  useEffect(() => {
    if (providerId) {
      apiFetch(`/api/data/providers/${providerId}/`)
        .then(res => res.ok ? res.json() : null)
        .then(data => setProviderName(data?.trade_name ?? null))
        .catch(() => setProviderName(null));
    }
    if (ticketId) {
      apiFetch(`/api/data/tickets/${ticketId}/`)
        .then(res => res.ok ? res.json() : null)
        .then(data => setTicketTitle(data?.title ?? null))
        .catch(() => setTicketTitle(null));
    }
    if (createdBy) {
      apiFetch(`/api/data/users/${createdBy}/`)
        .then(res => res.ok ? res.json() : null)
        .then(data => setCreatorName(data?.full_name ?? null))
        .catch(() => setCreatorName(null));
    }
  }, [providerId, ticketId, createdBy]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Informações Gerais
          {isEmergency && (
            <Badge variant="destructive" className="ml-auto text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              EMERGENCIAL
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEmergency && emergencyJustification && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-destructive">Justificativa de Emergência</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{emergencyJustification}</p>
          </div>
        )}
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
            <p className="text-sm text-foreground">{creatorName ?? 'Carregando...'}</p>
          </div>
          {startedAt && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Início do serviço
              </p>
              <p className="text-sm text-foreground">
                {format(new Date(startedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          )}
          {finishedAt && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Conclusão do serviço
              </p>
              <p className="text-sm text-foreground">
                {format(new Date(finishedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
          )}
          {providerName && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Prestador
              </p>
              <p className="text-sm text-foreground">{providerName}</p>
            </div>
          )}
          {ticketId && (
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Ticket className="h-3 w-3" /> Chamado de origem
              </p>
              <Link to={`/ordens-servico`} className="text-sm text-primary hover:underline">
                {ticketTitle ?? 'Ver chamado'}
              </Link>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
