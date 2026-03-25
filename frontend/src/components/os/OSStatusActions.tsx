import { Button } from '@/components/ui/button';
import { Play, CheckCircle2, XCircle, Clock, ThumbsUp } from 'lucide-react';

interface Props {
  status: string;
  canCriticalActions: boolean;
  isZelador: boolean;
  canApprove: boolean;
  canFinalize: boolean;
  canCancel: boolean;
  actionLoading: boolean;
  onChangeStatus: (status: string) => void;
}

export function OSStatusActions({
  status,
  canCriticalActions,
  isZelador,
  canApprove,
  canFinalize,
  canCancel,
  actionLoading,
  onChangeStatus,
}: Props) {
  if (status === 'FINALIZADA' || status === 'CANCELADA') return null;

  return (
    <div className="flex flex-wrap gap-2">
      {status === 'ABERTA' && canCriticalActions && (
        <Button size="sm" variant="outline" onClick={() => onChangeStatus('EM_EXECUCAO')} disabled={actionLoading}>
          <Play className="h-4 w-4 mr-1" /> Iniciar Execução
        </Button>
      )}
      {status === 'EM_EXECUCAO' && (canCriticalActions || isZelador) && (
        <Button size="sm" variant="outline" onClick={() => onChangeStatus('AGUARDANDO_APROVACAO')} disabled={actionLoading}>
          <Clock className="h-4 w-4 mr-1" /> Enviar p/ Aprovação
        </Button>
      )}
      {status === 'AGUARDANDO_APROVACAO' && canApprove && !canFinalize && (
        <Button size="sm" variant="secondary" onClick={() => onChangeStatus('APROVADA')} disabled={actionLoading}>
          <ThumbsUp className="h-4 w-4 mr-1" /> Aprovar
        </Button>
      )}
      {(status === 'AGUARDANDO_APROVACAO' || status === 'APROVADA') && canFinalize && (
        <Button size="sm" onClick={() => onChangeStatus('FINALIZADA')} disabled={actionLoading}>
          <CheckCircle2 className="h-4 w-4 mr-1" /> Finalizar
        </Button>
      )}
      {canCancel && (
        <Button size="sm" variant="destructive" onClick={() => onChangeStatus('CANCELADA')} disabled={actionLoading}>
          <XCircle className="h-4 w-4 mr-1" /> Cancelar
        </Button>
      )}
    </div>
  );
}
