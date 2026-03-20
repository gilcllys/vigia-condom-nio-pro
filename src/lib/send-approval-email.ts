import { supabase } from '@/lib/supabase';

export type ApprovalEmailType = 'NF' | 'OS_ORCAMENTO' | 'OS_FINAL' | 'CONTRATO';

export interface ApprovalEmailContext {
  /** Identificação do item (NF número, título da OS, título do contrato) */
  title: string;
  /** Valor monetário opcional */
  amount?: number;
  /** Nome do condomínio */
  condo_name: string;
}

/**
 * Dispara e-mails de notificação para aprovadores.
 * Fire-and-forget: erros são logados mas NUNCA bloqueiam o fluxo de negócio.
 *
 * @param type      Tipo de aprovação: 'NF' | 'OS_ORCAMENTO' | 'OS_FINAL' | 'CONTRATO'
 * @param approverUserIds   IDs internos dos aprovadores (nfe_vigia.users.id)
 * @param context   Dados de contexto para o e-mail
 */
export async function sendApprovalEmails(
  type: ApprovalEmailType,
  approverUserIds: string[],
  context: ApprovalEmailContext,
): Promise<void> {
  if (!approverUserIds.length) return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.warn('[sendApprovalEmails] No active session — skipping email dispatch');
      return;
    }

    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
    const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-approval-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': ANON_KEY,
      },
      body: JSON.stringify({
        type,
        approver_user_ids: approverUserIds,
        context,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.warn(`[sendApprovalEmails] Non-2xx response (${res.status}):`, text);
    } else {
      const data = await res.json();
      console.log(`[sendApprovalEmails] ${type} — enviados: ${data.sent}/${data.total}`);
    }
  } catch (err) {
    // Never throw — email failure must not affect the approval flow
    console.warn('[sendApprovalEmails] Non-blocking error:', err);
  }
}
