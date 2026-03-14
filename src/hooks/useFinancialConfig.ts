import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

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
  annual_budget: number | null;
  annual_budget_alert_pct: number | null;
}

export function useFinancialConfig(condoId: string | null) {
  const [config, setConfig] = useState<FinancialConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!condoId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('condo_financial_config')
      .select('*')
      .eq('condo_id', condoId)
      .maybeSingle();
    setConfig(data as FinancialConfig | null);
    setLoading(false);
  }, [condoId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { config, loading, refresh: fetch };
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
