import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface NfeVigiaUser {
  id: string;
  user_id: string;
  condo_id: string | null;
  name: string | null;
  email: string | null;
}

interface CondoContextType {
  condoId: string | null;
  nfeUser: NfeVigiaUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const CondoContext = createContext<CondoContextType>({
  condoId: null,
  nfeUser: null,
  loading: true,
  refresh: async () => {},
});

export const useCondo = () => useContext(CondoContext);

export const CondoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [nfeUser, setNfeUser] = useState<NfeVigiaUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchNfeUser = async () => {
    if (!user) {
      setNfeUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .schema('nfe_vigia')
      .from('users')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching nfe_vigia user:', error);
    }

    setNfeUser(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchNfeUser();
  }, [user]);

  return (
    <CondoContext.Provider value={{ condoId: nfeUser?.condo_id ?? null, nfeUser, loading, refresh: fetchNfeUser }}>
      {children}
    </CondoContext.Provider>
  );
};
