import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MfaSecuritySection } from '@/components/security/MfaSecuritySection';
import JoinCondoSection from '@/components/moradores/JoinCondoSection';
import FinancialConfigSection from '@/components/configuracoes/FinancialConfigSection';
import Moradores from '@/pages/Moradores';

export default function Configuracoes() {
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') === 'moradores' ? 'moradores' : 'geral';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Configurações</h1>
        <p className="text-muted-foreground">Perfil e preferências do usuário.</p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList className="bg-muted/30 border border-border/50 backdrop-blur-sm">
          <TabsTrigger value="geral" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none">
            Geral
          </TabsTrigger>
          <TabsTrigger value="moradores" className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:shadow-none">
            Moradores
          </TabsTrigger>
        </TabsList>

        <TabsContent value="geral" className="mt-6 space-y-6">
          <JoinCondoSection />
          <FinancialConfigSection />
          <MfaSecuritySection />
        </TabsContent>

        <TabsContent value="moradores" className="mt-4">
          <Moradores />
        </TabsContent>
      </Tabs>
    </div>
  );
}
