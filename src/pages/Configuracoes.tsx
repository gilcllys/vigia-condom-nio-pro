import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';

export default function Configuracoes() {
  const { user } = useAuth();
  const [canCritical, setCanCritical] = useState<boolean | null>(null);
  const [hasMFA, setHasMFA] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSecurity = async () => {
      setLoading(true);

      // Check critical actions permission
      const { data: criticalData } = await supabase
        .schema('nfe_vigia')
        .rpc('can_current_user_do_sindico_critical_actions');
      setCanCritical(!!criticalData);

      // Check MFA factors
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const verified = factors?.totp?.some((f) => f.status === 'verified') ?? false;
      setHasMFA(verified);

      setLoading(false);
    };
    checkSecurity();
  }, [user]);

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
                  {hasMFA ? (
                    <ShieldCheck className="h-4 w-4 text-primary" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm text-foreground">Autenticação em duas etapas (2FA)</span>
                </div>
                <Badge variant={hasMFA ? 'secondary' : 'destructive'}>
                  {hasMFA ? 'Ativada' : 'Desativada'}
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
    </div>
  );
}
