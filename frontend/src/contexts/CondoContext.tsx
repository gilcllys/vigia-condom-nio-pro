import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const STORAGE_KEY = 'nfe_vigia_active_condo';

interface CondoState {
  condoId: string | null;
  condoName: string | null;
  role: string | null;
}

interface CondoContextType extends CondoState {
  loading: boolean;
  refresh: () => Promise<void>;
  switchCondo: (condoId: string) => Promise<boolean>;
}

const CondoContext = createContext<CondoContextType>({
  condoId: null,
  condoName: null,
  role: null,
  loading: true,
  refresh: async () => {},
  switchCondo: async () => false,
});

export const useCondo = () => useContext(CondoContext);

function readCache(): CondoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.condoId) return parsed;
    }
  } catch {}
  return { condoId: null, condoName: null, role: null };
}

function writeCache(state: CondoState) {
  try {
    if (state.condoId) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}

export const CondoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<CondoState>(() => readCache());
  const [loading, setLoading] = useState(true);

  const fetchFromServer = useCallback(async () => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    setLoading(true);

    if (!user) {
      const empty = { condoId: null, condoName: null, role: null };
      setState(empty);
      writeCache(empty);
      setLoading(false);
      return;
    }

    const { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      const empty = { condoId: null, condoName: null, role: null };
      setState(empty);
      writeCache(empty);
      setLoading(false);
      return;
    }

    // Try get_active_condo_context first, fallback to get_my_condo_id
    const { data, error } = await supabase
      .schema('nfe_vigia')
      .rpc('get_active_condo_context');

    if (!error && data) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.condo_id) {
        const newState: CondoState = {
          condoId: row.condo_id,
          condoName: row.condo_name ?? null,
          role: row.role ?? null,
        };
        setState(newState);
        writeCache(newState);
        setLoading(false);
        return;
      }
    }

    // Fallback
    const { data: fallback } = await supabase
      .schema('nfe_vigia')
      .rpc('get_my_condo_id');

    let fallbackRole: string | null = null;
    if (fallback && user) {
      const { data: userRow } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (userRow?.id) {
        const { data: ucRow } = await supabase
          .from('user_condos')
          .select('role')
          .eq('user_id', userRow.id)
          .eq('condo_id', fallback)
          .maybeSingle();
        if (ucRow?.role) fallbackRole = ucRow.role;
      }
    }

    const newState: CondoState = {
      condoId: fallback ?? null,
      condoName: null,
      role: fallbackRole,
    };
    setState(newState);
    writeCache(newState);
    setLoading(false);
  }, [user, authLoading]);

  const switchCondo = useCallback(async (targetCondoId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .schema('nfe_vigia')
      .rpc('switch_active_condo', { p_condo_id: targetCondoId });

    if (error) {
      console.error('[CondoContext] switch error:', error);
      return false;
    }

    const row = Array.isArray(data) ? data[0] : data;

    // Always fetch role directly from user_condos — authoritative per-condo permission
    let role: string | null = row?.out_role ?? row?.role ?? null;
    if (user) {
      const { data: userRow } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (userRow?.id) {
        const { data: ucRow } = await supabase
          .from('user_condos')
          .select('role')
          .eq('user_id', userRow.id)
          .eq('condo_id', targetCondoId)
          .maybeSingle();
        if (ucRow?.role) role = ucRow.role;
      }
    }

    const newState: CondoState = {
      condoId: row?.out_condo_id ?? row?.condo_id ?? targetCondoId,
      condoName: row?.out_condo_name ?? row?.condo_name ?? null,
      role,
    };
    setState(newState);
    writeCache(newState);
    return true;
  }, [user]);

  useEffect(() => {
    // Load cache immediately, then validate with server
    const cached = readCache();
    if (cached.condoId && loading) {
      setState(cached);
    }

    if (authLoading) {
      setLoading(true);
      return;
    }

    fetchFromServer();
  }, [user, authLoading, fetchFromServer]);

  return (
    <CondoContext.Provider value={{ ...state, loading, refresh: fetchFromServer, switchCondo }}>
      {children}
    </CondoContext.Provider>
  );
};
