import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Intercept recovery tokens in the URL hash and redirect to /reset-password
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const type = params.get('type');
      if (type === 'recovery') {
        // Let Supabase exchange the token, then navigate
        window.location.replace('/reset-password');
        return;
      }
    }

    let initialized = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (initialized) {
        setSession(session);
      }
      // On token expiry or remote sign-out, clean up the local session record
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        if (event === 'SIGNED_OUT') {
          const token = localStorage.getItem('nfe_vigia_session_token');
          if (token) {
            supabase.from('user_sessions').delete().eq('session_token', token);
            localStorage.removeItem('nfe_vigia_session_token');
          }
          try { localStorage.removeItem('nfe_vigia_active_condo'); } catch {}
        }
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      initialized = true;
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const token = localStorage.getItem('nfe_vigia_session_token');
    if (token) {
      await supabase.from('user_sessions').delete().eq('session_token', token);
      localStorage.removeItem('nfe_vigia_session_token');
    }
    try { localStorage.removeItem('nfe_vigia_active_condo'); } catch {}
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
