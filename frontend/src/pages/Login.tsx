import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Info } from 'lucide-react';
import { NFeVigiaLogo } from '@/components/NFeVigiaLogo';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [showSignupInfo, setShowSignupInfo] = useState(false);

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
      const result = await authApi.forgotPassword(forgotEmail, window.location.origin + '/reset-password');
      if (!result.ok) throw new Error('Failed');
      toast({ title: 'E-mail enviado!', description: 'Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha.' });
      setForgotOpen(false);
      setForgotEmail('');
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível enviar o e-mail. Tente novamente.', variant: 'destructive' });
    } finally {
      setForgotLoading(false);
    }
  };

  const sessionToken = crypto.randomUUID();

  const navigateAfterLogin = async () => {
    localStorage.removeItem('nfe_vigia_active_condo');

    // Get internal user record
    const session = await authApi.getSession();
    const authUserId = session?.user?.id ?? null;
    if (!authUserId) {
      navigate('/login', { replace: true });
      return;
    }

    // Get internal user record
    const userRes = await apiFetch(`/api/data/users/by-auth-id/?auth_user_id=${authUserId}`);
    const userRow = await userRes.json();

    // Single-session enforcement
    if (userRow?.id) {
      const sessionsRes = await apiFetch('/api/data/user-sessions/');
      const existingSessions = await sessionsRes.json();

      if (existingSessions && existingSessions.length > 0) {
        await authApi.logout();
        toast({
          title: 'Sessão ativa detectada',
          description: 'Este usuário já possui uma sessão ativa em outro dispositivo. Encerre a sessão anterior para continuar.',
          variant: 'destructive',
        });
        return;
      }

      // Register this session
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
      await apiFetch('/api/data/user-sessions/', {
        method: 'POST',
        body: JSON.stringify({
          session_token: sessionToken,
          expires_at: expiresAt,
        }),
      });
      localStorage.setItem('nfe_vigia_session_token', sessionToken);
    }

    // Check user_condos status
    const ucRes = userRow?.id
      ? await apiFetch(`/api/data/user-condos/?user_id=${userRow.id}`)
      : null;
    const userCondoRows = ucRes ? await ucRes.json() : [];

    const normalizeStatus = (value: string | null | undefined) => (value ?? '').toLowerCase().trim();
    const statuses = [
      normalizeStatus(userRow?.status),
      ...(userCondoRows ?? []).map((row: any) => normalizeStatus(row.status)),
    ].filter(Boolean);

    const activeCondoRow = (userCondoRows ?? []).find((row: any) => normalizeStatus(row.status) === 'ativo');
    const hasActiveStatus = statuses.includes('ativo');

    if (!hasActiveStatus && statuses.includes('pendente')) {
      await authApi.logout();
      toast({
        title: 'Cadastro pendente',
        description: 'Seu cadastro está aguardando aprovação do síndico.',
        variant: 'destructive',
      });
      return;
    }

    if (!hasActiveStatus && statuses.includes('recusado')) {
      await authApi.logout();
      toast({
        title: 'Acesso não autorizado',
        description: 'Seu cadastro não foi aprovado. Entre em contato com o síndico.',
        variant: 'destructive',
      });
      return;
    }

    const condoId = activeCondoRow?.condo_id ?? userRow?.condo_id ?? null;
    if (condoId) {
      localStorage.setItem('nfe_vigia_active_condo', JSON.stringify({ condoId, condoName: null, role: null }));
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/no-condo', { replace: true });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await authApi.login(email, password);
      if (!result.ok) {
        const msg = result.data?.error || result.data?.message || '';
        let friendly = 'Ocorreu um erro. Tente novamente.';
        if (msg.toLowerCase().includes('invalid login credentials')) {
          friendly = 'E-mail ou senha incorretos. Verifique seus dados e tente novamente.';
        } else if (msg.toLowerCase().includes('email not confirmed')) {
          friendly = 'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.';
        }
        toast({ title: 'Erro', description: friendly, variant: 'destructive' });
        setLoading(false);
        return;
      }

      // Check MFA factors
      const factorsData = await authApi.mfaListFactors();
      const verifiedFactors = factorsData?.totp?.filter((f: any) => f.status === 'verified') ?? [];

      if (verifiedFactors.length > 0) {
        setMfaFactorId(verifiedFactors[0].id);
        setMfaRequired(true);
        setMfaCode('');
        setLoading(false);
        return;
      }

      await navigateAfterLogin();
    } catch (error: any) {
      toast({ title: 'Erro', description: 'Ocorreu um erro. Tente novamente.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleMfaVerify = async () => {
    if (mfaCode.length !== 6) return;
    setMfaLoading(true);

    try {
      const challengeResult = await authApi.mfaChallenge(mfaFactorId);
      if (!challengeResult.ok) throw new Error('Challenge failed');

      const verifyResult = await authApi.mfaVerify(
        mfaFactorId,
        challengeResult.data.id,
        mfaCode,
      );
      if (!verifyResult.ok) throw new Error('Verify failed');

      await navigateAfterLogin();
    } catch {
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

  // ── MFA Challenge screen ──
  if (mfaRequired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md glass-card">
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
            <Button onClick={handleMfaVerify} disabled={mfaCode.length !== 6 || mfaLoading} className="w-full bg-primary hover:bg-primary/90">
              {mfaLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Verificar
            </Button>
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setMfaRequired(false);
                  setMfaCode('');
                  authApi.logout();
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

  // ── Login form ──
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md glass-card">
        <CardHeader className="text-center space-y-4">
          <div className="flex items-center justify-center">
            <NFeVigiaLogo height={40} />
          </div>
          <CardDescription className="text-muted-foreground">Acesse sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">E-mail</Label>
              <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-muted/50 border-border focus:border-primary" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Senha</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="bg-muted/50 border-border focus:border-primary" />
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" disabled={loading || !email.trim() || !password || password.length < 6}>
              {loading ? 'Aguarde...' : 'Entrar'}
            </Button>
          </form>
          <div className="mt-3 text-center">
            <button type="button" onClick={() => setForgotOpen(true)} className="text-sm text-muted-foreground underline-offset-4 hover:underline hover:text-primary">
              Esqueci minha senha
            </button>
          </div>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowSignupInfo(true)}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Criar conta
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Signup info dialog */}
      <Dialog open={showSignupInfo} onOpenChange={setShowSignupInfo}>
        <DialogContent className="max-w-sm glass-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              Cadastro por convite
            </DialogTitle>
            <DialogDescription>
              Para criar sua conta, solicite o link de acesso ao síndico do seu condomínio.
            </DialogDescription>
          </DialogHeader>
          <Button variant="outline" onClick={() => setShowSignupInfo(false)} className="w-full">
            Entendi
          </Button>
        </DialogContent>
      </Dialog>

      {/* Forgot password dialog */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="glass-card">
          <DialogHeader>
            <DialogTitle>Recuperar senha</DialogTitle>
            <DialogDescription>Informe seu e-mail para receber o link de redefinição de senha.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="forgot-email">E-mail</Label>
              <Input id="forgot-email" type="email" placeholder="seu@email.com" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required className="bg-muted/50 border-border" />
            </div>
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={forgotLoading}>
              {forgotLoading ? 'Enviando...' : 'Enviar link de recuperação'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
