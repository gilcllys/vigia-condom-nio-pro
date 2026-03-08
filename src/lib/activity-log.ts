import { supabase } from '@/lib/supabase';

interface LogActivityParams {
  condoId: string;
  action: 'create' | 'update' | 'delete';
  entity: 'resident' | 'condo' | 'invoice' | 'user' | 'user_condo';
  entityId: string;
  description: string;
}

export async function logActivity({ condoId, action, entity, entityId, description }: LogActivityParams) {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) return;

  await supabase
    .schema('nfe_vigia')
    .from('activity_logs')
    .insert({
      condo_id: condoId,
      user_id: userId,
      action,
      entity,
      entity_id: entityId,
      description,
    });
}
