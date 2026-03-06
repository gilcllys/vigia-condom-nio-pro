import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface CondoContextType {
  condoId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const CondoContext = createContext<CondoContextType>({
  condoId: null,
  loading: true,
  refresh: async () => {},
});

export const useCondo = () => useContext(CondoContext);

export const CondoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [condoId, setCondoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCondoId = async () => {
    if (authLoading) return;
    if (!user) {
      setCondoId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .schema('nfe_vigia')
      .rpc('get_my_condo_id');

    if (error) {
      console.error('Error fetching condo id:', error);
    }

    setCondoId(data ?? null);
    setLoading(false);
  };

  useEffect(() => {
    fetchCondoId();
  }, [user, authLoading]);

  return (
    <CondoContext.Provider value={{ condoId, loading, refresh: fetchCondoId }}>
      {children}
    </CondoContext.Provider>
  );
};
