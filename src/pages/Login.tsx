import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: window.location.origin + '/reset-password',
      });
      if (error) throw error;
      toast({ title: 'E-mail enviado!', description: 'Verifique sua caixa de entrada para redefinir a senha.' });
      setForgotOpen(false);
      setForgotEmail('');
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message || 'Não foi possível enviar o e-mail.', variant: 'destructive' });
    } finally {
      setForgotLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({
          title: 'Cadastro realizado!',
          description: 'Verifique seu e-mail para confirmar a conta.',
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Clear any stale PWA cache before deciding redirect
        localStorage.removeItem('nfe_vigia_active_condo');

        // Always fetch fresh from server after login
        const { data: ctxData, error: ctxError } = await supabase
          .schema('nfe_vigia')
          .rpc('get_active_condo_context');

        const row = !ctxError && ctxData
          ? (Array.isArray(ctxData) ? ctxData[0] : ctxData)
          : null;

        if (row?.condo_id) {
          localStorage.setItem('nfe_vigia_active_condo', JSON.stringify({
            condoId: row.condo_id,
            condoName: row.condo_name ?? null,
            role: row.role ?? null,
          }));
          navigate('/dashboard', { replace: true });
        } else {
          // Fallback: check users table directly
          const { data: sessionData } = await supabase.auth.getSession();
          const userId = sessionData.session?.user?.id;
          if (userId) {
            const { data: profile } = await supabase
              .schema('nfe_vigia')
              .from('users')
              .select('condo_id')
              .eq('auth_user_id', userId)
              .maybeSingle();
            if (profile?.condo_id) {
              navigate('/dashboard', { replace: true });
            } else {
              navigate('/no-condo', { replace: true });
            }
          } else {
            navigate('/no-condo', { replace: true });
          }
        }
      }
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Ocorreu um erro. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">NFe Vigia</CardTitle>
          <CardDescription>
            {isSignUp ? 'Crie sua conta para começar' : 'Acesse sua conta'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Aguarde...' : isSignUp ? 'Criar conta' : 'Entrar'}
            </Button>
          </form>
          {!isSignUp && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-sm text-muted-foreground underline-offset-4 hover:underline hover:text-primary"
              >
                Esqueci minha senha
              </button>
            </div>
          )}
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {isSignUp ? 'Já tem uma conta?' : 'Não tem uma conta?'}{' '}
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {isSignUp ? 'Fazer login' : 'Criar conta'}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
