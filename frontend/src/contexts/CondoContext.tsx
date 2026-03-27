import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

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

    try {
      const res = await apiFetch('/api/data/condos/active-context/');
      const data = await res.json();

      if (data?.condo_id) {
        const newState: CondoState = {
          condoId: data.condo_id,
          condoName: data.condo_name ?? null,
          role: data.role ?? null,
        };
        setState(newState);
        writeCache(newState);
        setLoading(false);
        return;
      }
    } catch {}

    const empty = { condoId: null, condoName: null, role: null };
    setState(empty);
    writeCache(empty);
    setLoading(false);
  }, [user, authLoading]);

  const switchCondo = useCallback(async (targetCondoId: string): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/data/condos/switch/', {
        method: 'POST',
        body: JSON.stringify({ condo_id: targetCondoId }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      const newState: CondoState = {
        condoId: data.condo_id ?? targetCondoId,
        condoName: data.condo_name ?? null,
        role: data.role ?? null,
      };
      setState(newState);
      writeCache(newState);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
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
