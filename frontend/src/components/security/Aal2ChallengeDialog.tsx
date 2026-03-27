import { useState, useEffect } from 'react';
import { authApi } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ShieldCheck } from 'lucide-react';

interface Aal2ChallengeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

/**
 * Dialog to elevate a session from AAL1 to AAL2 without logout.
 * Used when a user with active MFA tries a critical action in an AAL1 session.
 */
export function Aal2ChallengeDialog({ open, onOpenChange, onSuccess }: Aal2ChallengeDialogProps) {
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCode('');
      // Find the verified TOTP factor
      authApi.mfaListFactors().then((data) => {
        const verified = data?.totp?.find((f: any) => f.status === 'verified');
        setFactorId(verified?.id ?? null);
      });
    }
  }, [open]);

  const handleVerify = async () => {
    if (code.length !== 6 || !factorId) return;
    setLoading(true);

    try {
      const challengeResult = await authApi.mfaChallenge(factorId);
      if (!challengeResult.ok) throw new Error('Challenge failed');

      const verifyResult = await authApi.mfaVerify(
        factorId,
        challengeResult.data.id,
        code,
      );
      if (!verifyResult.ok) throw new Error('Verify failed');

      toast({ title: 'Sessão elevada', description: 'Autenticação reforçada (AAL2) ativada.' });
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({
        title: 'Código inválido',
        description: err.message || 'Verifique o código no seu app autenticador.',
        variant: 'destructive',
      });
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Validar autenticação reforçada
          </DialogTitle>
          <DialogDescription>
            Esta ação exige autenticação reforçada (AAL2). Digite o código do seu app autenticador para continuar.
          </DialogDescription>
        </DialogHeader>

        {!factorId ? (
          <p className="text-sm text-destructive">
            Nenhum fator 2FA ativo encontrado. Ative a autenticação em duas etapas nas Configurações.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={code} onChange={setCode}>
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
            <Button onClick={handleVerify} disabled={code.length !== 6 || loading} className="w-full">
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Verificar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
