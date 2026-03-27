import { apiFetch } from '@/lib/api';

export type SOAction =
  | 'OS_CRIADA'
  | 'EXECUCAO_INICIADA'
  | 'ENVIADA_APROVACAO'
  | 'OS_FINALIZADA'
  | 'OS_CANCELADA'
  | 'FOTO_ADICIONADA'
  | 'MATERIAL_ADICIONADO'
  | 'DOCUMENTO_ANEXADO'
  | 'APROVACAO_REGISTRADA'
  | 'REJEICAO_REGISTRADA'
  | 'MINERVA_EXERCIDO'
  | 'NF_ENVIADA_APROVACAO'
  | 'APROVACAO_FINAL_ENVIADA'
  | 'PRAZO_EXPIRADO';

const actionDescriptions: Record<SOAction, string> = {
  OS_CRIADA: 'Ordem de serviço criada',
  EXECUCAO_INICIADA: 'Execução iniciada',
  ENVIADA_APROVACAO: 'Enviada para aprovação',
  OS_FINALIZADA: 'Ordem de serviço finalizada',
  OS_CANCELADA: 'Ordem de serviço cancelada',
  FOTO_ADICIONADA: 'Foto adicionada',
  MATERIAL_ADICIONADO: 'Material adicionado',
  DOCUMENTO_ANEXADO: 'Documento anexado',
  APROVACAO_REGISTRADA: 'Aprovação registrada',
  REJEICAO_REGISTRADA: 'Rejeição registrada',
  MINERVA_EXERCIDO: 'Voto de minerva exercido',
  NF_ENVIADA_APROVACAO: 'Nota fiscal enviada para aprovação',
  APROVACAO_FINAL_ENVIADA: 'Enviada para aprovação final',
  PRAZO_EXPIRADO: 'Prazo de aprovação expirado',
};

interface LogSOActivityParams {
  serviceOrderId: string;
  action: SOAction;
  description?: string;
}

export async function logSOActivity({ serviceOrderId, action, description }: LogSOActivityParams) {
  try {
    await apiFetch(`/api/data/service-orders/${serviceOrderId}/activities/`, {
      method: 'POST',
      body: JSON.stringify({
        activity_type: action,
        description: description ?? actionDescriptions[action],
      }),
    });
  } catch (err) {
    console.error('[SO Activity] Error logging activity:', err);
  }
}
