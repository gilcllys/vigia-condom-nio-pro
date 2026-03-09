import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Shield, ShieldAlert, ShieldCheck, Trash2, Loader2 } from 'lucide-react';

interface TOTPFactor {
  id: string;
  friendly_name?: string;
  status: 'verified' | 'unverified';
  created_at: string;
}

export default function Configuracoes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [canCritical, setCanCritical] = useState<boolean | null>(null);
  const [factors, setFactors] = useState<TOTPFactor[]>([]);
  const [loading, setLoading] = useState(true);

  // Enrollment state
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [factorId, setFactorId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);

  // Unenroll state
  const [unenrollId, setUnenrollId] = useState<string | null>(null);
  const [unenrollLoading, setUnenrollLoading] = useState(false);

  const loadSecurity = useCallback(async () => {
    setLoading(true);

    const [critRes, factorsRes] = await Promise.all([
      supabase.schema('nfe_vigia').rpc('can_current_user_do_sindico_critical_actions'),
      supabase.auth.mfa.listFactors(),
    ]);

    setCanCritical(!!critRes.data);
    setFactors((factorsRes.data?.totp as TOTPFactor[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSecurity();
  }, [user, loadSecurity]);

  const hasVerifiedFactor = factors.some((f) => f.status === 'verified');

  // ── Enrollment ──
  const startEnrollment = async () => {
    setEnrollLoading(true);
    setEnrollOpen(true);
    setOtpCode('');
    setQrCode('');

    // Clean up any stuck unverified factors first
    const { data: existingFactors } = await supabase.auth.mfa.listFactors();
    const unverified = existingFactors?.totp?.filter((f) => f.status === 'unverified') ?? [];
    for (const f of unverified) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }

    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });

    if (error || !data) {
      toast({ title: 'Erro', description: error?.message ?? 'Não foi possível iniciar o cadastro.', variant: 'destructive' });
      setEnrollOpen(false);
      setEnrollLoading(false);
      return;
    }

    setFactorId(data.id);
    setQrCode(data.totp.qr_code);
    setEnrollLoading(false);
  };

  const verifyEnrollment = async () => {
    if (otpCode.length !== 6) return;
    setVerifyLoading(true);

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });

    if (challengeError) {
      toast({ title: 'Erro', description: challengeError.message, variant: 'destructive' });
      setVerifyLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: otpCode,
    });

    if (verifyError) {
      toast({ title: 'Código inválido', description: 'Verifique o código no seu app autenticador e tente novamente.', variant: 'destructive' });
      setOtpCode('');
      setVerifyLoading(false);
      return;
    }

    toast({ title: '2FA ativado!', description: 'Autenticação em duas etapas ativada com sucesso.' });
    setEnrollOpen(false);
    setVerifyLoading(false);
    loadSecurity();
  };

  // ── Unenroll ──
  const confirmUnenroll = async () => {
    if (!unenrollId) return;
    setUnenrollLoading(true);

    const { error } = await supabase.auth.mfa.unenroll({ factorId: unenrollId });

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      setUnenrollLoading(false);
      return;
    }

    toast({ title: 'Fator removido', description: 'Autenticação em duas etapas desativada.' });
    setUnenrollId(null);
    setUnenrollLoading(false);
    loadSecurity();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h1>
        <p className="text-muted-foreground">Perfil e preferências do usuário.</p>
      </div>

      {/* Segurança da Conta */}
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
          {loading ? (
            <p className="text-sm text-muted-foreground">Verificando...</p>
          ) : (
            <>
              {/* MFA Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {hasVerifiedFactor ? (
                    <ShieldCheck className="h-4 w-4 text-primary" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm text-foreground">Autenticação em duas etapas (2FA)</span>
                </div>
                <Badge variant={hasVerifiedFactor ? 'secondary' : 'destructive'}>
                  {hasVerifiedFactor ? 'Ativada' : 'Desativada'}
                </Badge>
              </div>

              {/* Critical Actions Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">Ações críticas de síndico</span>
                </div>
                <Badge variant={canCritical ? 'secondary' : 'outline'}>
                  {canCritical ? 'Habilitadas' : 'Não disponíveis'}
                </Badge>
              </div>

              {/* Factor list */}
              {factors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Fatores cadastrados</p>
                  {factors.map((f) => (
                    <div key={f.id} className="flex items-center justify-between rounded-md border border-border p-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">
                          TOTP {f.friendly_name ? `(${f.friendly_name})` : ''}
                        </span>
                        <Badge variant={f.status === 'verified' ? 'secondary' : 'outline'} className="text-xs">
                          {f.status === 'verified' ? 'Verificado' : 'Pendente'}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setUnenrollId(f.id)}
                        title="Remover fator"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Enroll button */}
              {!hasVerifiedFactor && (
                <Button onClick={startEnrollment} disabled={enrollLoading} className="w-full">
                  {enrollLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Ativar autenticação em 2 fatores
                </Button>
              )}

              {hasVerifiedFactor && factors.length > 0 && (
                <Button variant="outline" onClick={() => setUnenrollId(factors.find(f => f.status === 'verified')?.id ?? null)} className="w-full">
                  Desativar autenticação em 2 fatores
                </Button>
              )}

              {/* Warning */}
              <div className="rounded-md border border-border bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">
                  <strong>Importante:</strong> Ações críticas como iniciar execução de OS, enviar para aprovação,
                  alterar prioridade, anexar NF, trocar síndico, alterar permissões e desativar usuários
                  exigem autenticação reforçada (2FA ativa). Caso não tenha acesso, entre em contato com o
                  administrador do condomínio.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Enrollment Dialog */}
      <Dialog open={enrollOpen} onOpenChange={(open) => { if (!open) setEnrollOpen(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ativar autenticação em 2 fatores</DialogTitle>
            <DialogDescription>
              Escaneie o QR Code abaixo com seu app autenticador (Google Authenticator, Authy, etc.) e insira o código gerado.
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
              <div className="space-y-2">
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
              </div>
              <Button
                onClick={verifyEnrollment}
                disabled={otpCode.length !== 6 || verifyLoading}
                className="w-full"
              >
                {verifyLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Verificar e ativar
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Unenroll Confirmation Dialog */}
      <Dialog open={!!unenrollId} onOpenChange={(open) => { if (!open) setUnenrollId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desativar autenticação em 2 fatores</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover este fator de autenticação? Ações críticas ficarão indisponíveis até que um novo fator seja cadastrado.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setUnenrollId(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmUnenroll} disabled={unenrollLoading}>
              {unenrollLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar remoção
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
