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
    console.log('[CondoContext] authLoading:', authLoading, '| user:', user?.id ?? null);
    if (authLoading) return;
    if (!user) {
      console.log('[CondoContext] No user, setting condoId=null');
      setCondoId(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: sessionData } = await supabase.auth.getSession();
    console.log('[CondoContext] session user id:', sessionData.session?.user?.id ?? null);
    if (!sessionData.session) {
      console.log('[CondoContext] No session, setting condoId=null');
      setCondoId(null);
      setLoading(false);
      return;
    }

    // Fetch profile from nfe_vigia.users for debug
    const { data: profileData, error: profileError } = await supabase
      .schema('nfe_vigia')
      .from('users')
      .select('id, condo_id, auth_user_id')
      .eq('auth_user_id', sessionData.session.user.id)
      .maybeSingle();
    console.log('[CondoContext] nfe_vigia.users profile:', profileData, '| error:', profileError);

    const { data, error } = await supabase
      .schema('nfe_vigia')
      .rpc('get_my_condo_id');
    console.log('[CondoContext] get_my_condo_id result:', data, '| error:', error);

    if (error) {
      console.error('Error fetching condo id:', error);
    }

    const finalCondoId = data ?? null;
    console.log('[CondoContext] Decision:', finalCondoId ? '/dashboard' : '/no-condo', '| condoId:', finalCondoId);
    setCondoId(finalCondoId);
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
