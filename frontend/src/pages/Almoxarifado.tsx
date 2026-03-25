import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, FileText, CheckCircle } from 'lucide-react';
import StockTab from '@/components/almoxarifado/StockTab';
import NFEntryTab from '@/components/almoxarifado/NFEntryTab';
import ApprovalsTab from '@/components/almoxarifado/ApprovalsTab';

export default function Almoxarifado() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Almoxarifado</h1>
        <p className="text-muted-foreground">Controle de estoque e materiais do condomínio.</p>
      </div>

      <Tabs defaultValue="estoque" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="estoque" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Estoque
          </TabsTrigger>
          <TabsTrigger value="entrada-nf" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Entrada por NF
          </TabsTrigger>
          <TabsTrigger value="aprovacoes" className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Aprovações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="estoque">
          <StockTab />
        </TabsContent>
        <TabsContent value="entrada-nf">
          <NFEntryTab />
        </TabsContent>
        <TabsContent value="aprovacoes">
          <ApprovalsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
