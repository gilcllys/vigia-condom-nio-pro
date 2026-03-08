import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // MFA state
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

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

  const navigateAfterLogin = async () => {
    localStorage.removeItem('nfe_vigia_active_condo');

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;

    const userId = sessionData.session?.user?.id ?? null;

    if (!userId) {
      navigate('/login', { replace: true });
      return;
    }

    const { data: userRow, error: userError } = await supabase
      .schema('nfe_vigia')
      .from('users')
      .select('condo_id')
      .eq('auth_user_id', userId)
      .maybeSingle();

    if (userError) throw userError;

    const condoId = userRow?.condo_id ?? null;

    if (condoId) {
      localStorage.setItem(
        'nfe_vigia_active_condo',
        JSON.stringify({ condoId, condoName: null, role: null })
      );
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/no-condo', { replace: true });
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
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        const userId = data.session?.user?.id;
        console.log('[Login] userId:', userId);

        // Check if user is SINDICO
        let isSindico = false;
        if (userId) {
          const { data: userRow } = await supabase
            .schema('nfe_vigia')
            .from('users')
            .select('role')
            .eq('auth_user_id', userId)
            .maybeSingle();
          isSindico = userRow?.role === 'SINDICO';
        }
        console.log('[Login] isSindico:', isSindico);

        // Check MFA factors
        const { data: factorsData } = await supabase.auth.mfa.listFactors();
        const verifiedFactors = factorsData?.totp?.filter((f) => f.status === 'verified') ?? [];
        console.log('[Login] MFA factors encontrados:', verifiedFactors.length);

        if (isSindico && verifiedFactors.length > 0) {
          // Síndico com MFA — exigir challenge
          console.log('[Login] Síndico com MFA — redirecionando para challenge');
          setMfaFactorId(verifiedFactors[0].id);
          setMfaRequired(true);
          setMfaCode('');
          setLoading(false);
          return;
        }

        if (isSindico && verifiedFactors.length === 0) {
          console.log('[Login] Síndico SEM MFA — entrada permitida, ações críticas bloqueadas');
        }

        if (!isSindico) {
          console.log('[Login] Usuário não é síndico — login normal');
        }

        // Proceed — session stays AAL1
        const { data: sessionCheck } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        console.log('[Login] Sessão final AAL:', sessionCheck?.currentLevel);

        await navigateAfterLogin();
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

  const handleMfaVerify = async () => {
    if (mfaCode.length !== 6) return;
    setMfaLoading(true);

    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: mfaFactorId,
      });

      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: challengeData.id,
        code: mfaCode,
      });

      if (verifyError) throw verifyError;

      // MFA verified — session is now AAL2
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      console.log('[Login] Challenge verificado — sessão AAL:', aalData?.currentLevel);
      await navigateAfterLogin();
    } catch (error: any) {
      toast({
        title: 'Código inválido',
        description: 'Verifique o código no seu app autenticador e tente novamente.',
        variant: 'destructive',
      });
      setMfaCode('');
    } finally {
      setMfaLoading(false);
    }
  };

  // MFA Challenge screen
  if (mfaRequired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold tracking-tight">Verificação em 2 etapas</CardTitle>
            <CardDescription>
              Digite o código de 6 dígitos do seu app autenticador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={mfaCode} onChange={setMfaCode}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button
              onClick={handleMfaVerify}
              disabled={mfaCode.length !== 6 || mfaLoading}
              className="w-full"
            >
              {mfaLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Verificar
            </Button>
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setMfaRequired(false);
                  setMfaCode('');
                  supabase.auth.signOut();
                }}
                className="text-sm text-muted-foreground underline-offset-4 hover:underline hover:text-primary"
              >
                Voltar ao login
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recuperar senha</DialogTitle>
            <DialogDescription>
              Informe seu e-mail para receber o link de redefinição de senha.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">E-mail</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="seu@email.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={forgotLoading}>
              {forgotLoading ? 'Enviando...' : 'Enviar link de recuperação'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
