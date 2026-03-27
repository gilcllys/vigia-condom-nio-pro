import { useEffect, useState, useCallback } from 'react';
import { authApi, apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Shield, ShieldAlert, ShieldCheck, Loader2, RefreshCw } from 'lucide-react';

type MfaState = 'loading' | 'none' | 'pending' | 'active';

interface TOTPFactor {
  id: string;
  friendly_name?: string;
  status: 'verified' | 'unverified';
}

export function MfaSecuritySection() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [mfaState, setMfaState] = useState<MfaState>('loading');
  const [factors, setFactors] = useState<TOTPFactor[]>([]);
  const [aalLevel, setAalLevel] = useState<string | null>(null);
  const [canCritical, setCanCritical] = useState<boolean | null>(null);

  // Enrollment
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [enrollFactorId, setEnrollFactorId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);

  // Unenroll
  const [unenrollOpen, setUnenrollOpen] = useState(false);
  const [unenrollTargetId, setUnenrollTargetId] = useState<string | null>(null);
  const [unenrollLoading, setUnenrollLoading] = useState(false);

  const loadState = useCallback(async () => {
    setMfaState('loading');

    try {
      const [factorsData, aalRes] = await Promise.all([
        authApi.mfaListFactors(),
        apiFetch('/api/auth/mfa/aal-level/'),
      ]);

      const totp = (factorsData?.totp as TOTPFactor[]) ?? [];
      setFactors(totp);

      const aalData = await aalRes.json();
      setAalLevel(aalData?.current_level ?? null);
      setCanCritical(!!aalData?.is_sindico_aal2);

      const hasVerified = totp.some((f) => f.status === 'verified');
      const hasPending = totp.some((f) => f.status === 'unverified');

      if (hasVerified) {
        setMfaState('active');
      } else if (hasPending) {
        setMfaState('pending');
      } else {
        setMfaState('none');
      }
    } catch {
      setMfaState('none');
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [user, loadState]);

  // ── Clean pending + enroll fresh ──
  const cleanAndEnroll = async () => {
    setEnrollLoading(true);
    setEnrollOpen(true);
    setOtpCode('');
    setQrCode('');

    // Remove ALL unverified factors to avoid conflicts
    const existing = await authApi.mfaListFactors();
    const unverified = existing?.totp?.filter((f: any) => (f.status as string) === 'unverified') ?? [];
    for (const f of unverified) {
      await authApi.mfaUnenroll(f.id);
    }

    const data = await authApi.mfaEnroll('totp');

    if (data?.error || !data?.id) {
      // If "already exists" error, try to recover
      if (data?.error?.includes?.('already exists') || data?.msg?.includes?.('already exists')) {
        toast({
          title: 'Fator já existe',
          description: 'Tentando recuperar automaticamente. Por favor, tente novamente.',
          variant: 'destructive',
        });
        // Force cleanup all unverified
        const retry = await authApi.mfaListFactors();
        const stale = retry?.totp?.filter((f: any) => (f.status as string) === 'unverified') ?? [];
        for (const f of stale) {
          await authApi.mfaUnenroll(f.id);
        }
      } else {
        toast({ title: 'Erro', description: data?.error ?? 'Erro ao iniciar cadastro.', variant: 'destructive' });
      }
      setEnrollOpen(false);
      setEnrollLoading(false);
      await loadState();
      return;
    }

    setEnrollFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setEnrollLoading(false);
  };

  // ── Verify enrollment (challenge + verify) ──
  const verifyEnrollment = async () => {
    if (otpCode.length !== 6) return;
    setVerifyLoading(true);

    try {
      const challengeResult = await authApi.mfaChallenge(enrollFactorId);
      if (!challengeResult.ok) throw new Error('Challenge failed');

      const verifyResult = await authApi.mfaVerify(
        enrollFactorId,
        challengeResult.data.id,
        otpCode,
      );
      if (!verifyResult.ok) throw new Error('Verify failed');

      toast({ title: '2FA ativado!', description: 'Autenticação em duas etapas ativada com sucesso.' });
      setEnrollOpen(false);
      await loadState();
    } catch (err: any) {
      toast({
        title: 'Código inválido',
        description: err.message || 'Verifique o código no seu app autenticador.',
        variant: 'destructive',
      });
      setOtpCode('');
    } finally {
      setVerifyLoading(false);
    }
  };

  // ── Unenroll ──
  const handleUnenroll = async () => {
    if (!unenrollTargetId) return;
    setUnenrollLoading(true);

    const result = await authApi.mfaUnenroll(unenrollTargetId);
    if (!result.ok) {
      toast({ title: 'Erro', description: 'Não foi possível desativar 2FA.', variant: 'destructive' });
    } else {
      toast({ title: '2FA desativado', description: 'Autenticação em duas etapas foi removida.' });
    }

    setUnenrollOpen(false);
    setUnenrollTargetId(null);
    setUnenrollLoading(false);
    await loadState();
  };

  // ── Reset pending (cancel stuck enrollment) ──
  const resetPending = async () => {
    setEnrollLoading(true);
    const existing = await authApi.mfaListFactors();
    const pending = existing?.totp?.filter((f: any) => (f.status as string) === 'unverified') ?? [];
    for (const f of pending) {
      await authApi.mfaUnenroll(f.id);
    }
    setEnrollLoading(false);
    toast({ title: 'Configuração resetada', description: 'Fatores pendentes foram removidos.' });
    await loadState();
  };

  const openUnenrollDialog = (factorId: string) => {
    setUnenrollTargetId(factorId);
    setUnenrollOpen(true);
  };

  // ── Status badge/icon helpers ──
  const statusConfig = {
    loading: { icon: Loader2, label: 'Verificando...', variant: 'outline' as const },
    none: { icon: ShieldAlert, label: 'Desativada', variant: 'destructive' as const },
    pending: { icon: Shield, label: 'Em configuração', variant: 'outline' as const },
    active: { icon: ShieldCheck, label: 'Ativada', variant: 'secondary' as const },
  };

  const status = statusConfig[mfaState];
  const StatusIcon = status.icon;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            Segurança da Conta
          </CardTitle>
          <CardDescription>
            Status da autenticação reforçada e verificação em duas etapas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mfaState === 'loading' ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando...
            </div>
          ) : (
            <>
              {/* 2FA Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusIcon className={`h-4 w-4 ${mfaState === 'active' ? 'text-primary' : mfaState === 'none' ? 'text-destructive' : 'text-muted-foreground'}`} />
                  <span className="text-sm text-foreground">Autenticação em duas etapas (2FA)</span>
                </div>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>

              {/* Session AAL */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">Nível da sessão</span>
                </div>
                <Badge variant={aalLevel === 'aal2' ? 'secondary' : 'outline'}>
                  {aalLevel?.toUpperCase() ?? '—'}
                </Badge>
              </div>

              {/* Critical Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">Ações críticas de síndico</span>
                </div>
                <Badge variant={canCritical ? 'secondary' : 'outline'}>
                  {canCritical ? 'Habilitadas' : 'Não disponíveis'}
                </Badge>
              </div>

              {/* ── STATE: none ── */}
              {mfaState === 'none' && (
                <Button onClick={cleanAndEnroll} disabled={enrollLoading} className="w-full">
                  {enrollLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Ativar autenticação em 2 fatores
                </Button>
              )}

              {/* ── STATE: pending ── */}
              {mfaState === 'pending' && (
                <div className="space-y-2">
                  <div className="rounded-md border border-border bg-muted/50 p-3">
                    <p className="text-sm text-muted-foreground">
                      Existe uma configuração de 2FA pendente que não foi concluída.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={cleanAndEnroll} disabled={enrollLoading} className="flex-1">
                      {enrollLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Recomeçar configuração
                    </Button>
                    <Button variant="outline" onClick={resetPending} disabled={enrollLoading} className="flex-1">
                      Cancelar pendência
                    </Button>
                  </div>
                </div>
              )}

              {/* ── STATE: active ── */}
              {mfaState === 'active' && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      const verified = factors.find((f) => f.status === 'verified');
                      if (verified) openUnenrollDialog(verified.id);
                    }}
                  >
                    Desativar 2FA
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={async () => {
                      // Unenroll verified, then start fresh enrollment
                      const verified = factors.find((f) => f.status === 'verified');
                      if (verified) {
                        await authApi.mfaUnenroll(verified.id);
                      }
                      await cleanAndEnroll();
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reconfigurar 2FA
                  </Button>
                </div>
              )}

              {/* Warning */}
              <div className="rounded-md border border-border bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">
                  <strong>Importante:</strong> Ações críticas como iniciar execução de OS, enviar para aprovação,
                  alterar prioridade, anexar NF, trocar síndico, alterar permissões e desativar usuários
                  exigem autenticação reforçada (2FA ativa + sessão AAL2).
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Enrollment Dialog ── */}
      <Dialog open={enrollOpen} onOpenChange={(open) => { if (!open) { setEnrollOpen(false); loadState(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ativar autenticação em 2 fatores</DialogTitle>
            <DialogDescription>
              Escaneie o QR Code com seu app autenticador (Google Authenticator, Authy, etc.) e insira o código gerado.
            </DialogDescription>
          </DialogHeader>

          {enrollLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : qrCode ? (
            <div className="space-y-4">
              <div className="flex justify-center">
                <img src={qrCode} alt="QR Code para autenticação" className="rounded-md" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Digite o código de 6 dígitos do seu app autenticador:
              </p>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
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
              <Button onClick={verifyEnrollment} disabled={otpCode.length !== 6 || verifyLoading} className="w-full">
                {verifyLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Verificar e ativar
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Unenroll Confirmation ── */}
      <Dialog open={unenrollOpen} onOpenChange={(open) => { if (!open) { setUnenrollOpen(false); setUnenrollTargetId(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desativar autenticação em 2 fatores</DialogTitle>
            <DialogDescription>
              Tem certeza? Ações críticas ficarão indisponíveis até que um novo fator seja cadastrado.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setUnenrollOpen(false); setUnenrollTargetId(null); }}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleUnenroll} disabled={unenrollLoading}>
              {unenrollLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar remoção
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
