import { apiFetch } from '@/lib/api';

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
    const res = await apiFetch('/api/notifications/approval-email/', {
      method: 'POST',
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
