import { MfaSecuritySection } from '@/components/security/MfaSecuritySection';
import JoinCondoSection from '@/components/moradores/JoinCondoSection';

export default function Configuracoes() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h1>
        <p className="text-muted-foreground">Perfil e preferências do usuário.</p>
      </div>

      <JoinCondoSection />
      <MfaSecuritySection />
    </div>
  );
}
