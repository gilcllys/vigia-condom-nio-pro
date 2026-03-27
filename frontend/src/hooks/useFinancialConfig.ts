import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

export interface FinancialConfig {
  id?: string;
  condo_id: string;
  alcada_1_limite: number | null;
  alcada_2_limite: number | null;
  alcada_3_limite: number | null;
  approval_deadline_hours: number | null;
  notify_residents_above: number | null;
  monthly_limit_manutencao: number | null;
  monthly_limit_limpeza: number | null;
  monthly_limit_seguranca: number | null;
  annual_budget: number | null; // usado como orçamento mensal
  annual_budget_alert_pct: number | null;
}

/** Alias semântico: annual_budget armazena o orçamento mensal */
export function getMonthlyBudget(config: FinancialConfig | null): number | null {
  return config?.annual_budget ?? null;
}

export function useFinancialConfig(condoId: string | null) {
  const [config, setConfig] = useState<FinancialConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    if (!condoId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/data/condos/${condoId}/financial-config/`);
      const data = await res.json();
      setConfig(data as FinancialConfig | null);
    } catch {
      setConfig(null);
    }
    setLoading(false);
  }, [condoId]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  return { config, loading, refresh: fetchConfig };
}

/**
 * Determines which roles need to approve based on NF amount and financial config.
 * Returns array of required roles.
 */
export function getRequiredRoles(amount: number, config: FinancialConfig | null): string[] {
  if (!config) {
    // No config → default: SUBSINDICO + CONSELHO
    return ['SUBSINDICO', 'CONSELHO'];
  }

  const a1 = config.alcada_1_limite;
  const a2 = config.alcada_2_limite;
  const a3 = config.alcada_3_limite;

  if (a1 != null && amount <= a1) {
    return ['SUBSINDICO'];
  }
  if (a2 != null && amount <= a2) {
    return ['SUBSINDICO', 'CONSELHO'];
  }
  if (a3 != null && amount <= a3) {
    return ['SUBSINDICO', 'CONSELHO', 'SINDICO'];
  }
  // Above all limits → all roles
  return ['SUBSINDICO', 'CONSELHO', 'SINDICO'];
}

/**
 * Returns the tier label for an NF amount.
 */
export function getTierLabel(amount: number, config: FinancialConfig | null): string {
  if (!config) return '';
  const a1 = config.alcada_1_limite;
  const a2 = config.alcada_2_limite;
  const a3 = config.alcada_3_limite;

  if (a1 != null && amount <= a1) return 'Alçada 1';
  if (a2 != null && amount <= a2) return 'Alçada 2';
  if (a3 != null && amount <= a3) return 'Alçada 3';
  return 'Alçada 3+';
}

export type CategoryKey = 'manutencao' | 'limpeza' | 'seguranca';

export function getMonthlyLimit(config: FinancialConfig | null, category: CategoryKey): number | null {
  if (!config) return null;
  switch (category) {
    case 'manutencao': return config.monthly_limit_manutencao;
    case 'limpeza': return config.monthly_limit_limpeza;
    case 'seguranca': return config.monthly_limit_seguranca;
    default: return null;
  }
}
