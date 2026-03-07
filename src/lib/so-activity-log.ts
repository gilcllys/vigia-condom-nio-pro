import { supabase } from '@/lib/supabase';

export type SOAction =
  | 'OS_CRIADA'
  | 'EXECUCAO_INICIADA'
  | 'ENVIADA_APROVACAO'
  | 'OS_FINALIZADA'
  | 'OS_CANCELADA'
  | 'FOTO_ADICIONADA'
  | 'MATERIAL_ADICIONADO'
  | 'DOCUMENTO_ANEXADO';

const actionDescriptions: Record<SOAction, string> = {
  OS_CRIADA: 'Ordem de serviço criada',
  EXECUCAO_INICIADA: 'Execução iniciada',
  ENVIADA_APROVACAO: 'Enviada para aprovação',
  OS_FINALIZADA: 'Ordem de serviço finalizada',
  OS_CANCELADA: 'Ordem de serviço cancelada',
  FOTO_ADICIONADA: 'Foto adicionada',
  MATERIAL_ADICIONADO: 'Material adicionado',
  DOCUMENTO_ANEXADO: 'Documento anexado',
};

interface LogSOActivityParams {
  serviceOrderId: string;
  action: SOAction;
  description?: string;
}

export async function logSOActivity({ serviceOrderId, action, description }: LogSOActivityParams) {
  const { data: session } = await supabase.auth.getSession();
  const authUserId = session.session?.user?.id;
  if (!authUserId) return;

  // Resolve internal user id
  const { data: internalUser } = await supabase
    .schema('nfe_vigia')
    .from('users')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (!internalUser) return;

  const { error } = await supabase
    .schema('nfe_vigia')
    .from('service_order_activities')
    .insert({
      service_order_id: serviceOrderId,
      user_id: internalUser.id,
      action,
      description: description ?? actionDescriptions[action],
    });

  if (error) {
    console.error('[SO Activity] Error logging activity:', error);
  }
}
