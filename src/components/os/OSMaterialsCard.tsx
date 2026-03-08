import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package } from 'lucide-react';

interface SOMaterial {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  cost: number | null;
}

interface Props {
  materials: SOMaterial[];
}

export function OSMaterialsCard({ materials }: Props) {
  const totalCost = materials.reduce((sum, m) => sum + (m.cost ?? 0), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          Materiais Utilizados
        </CardTitle>
      </CardHeader>
      <CardContent>
        {materials.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum material registrado.</p>
        ) : (
          <div className="space-y-2">
            {materials.map((m) => (
              <div key={m.id} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{m.name}</span>
                <span className="text-muted-foreground">
                  {m.quantity ?? '—'} {m.unit ?? ''}
                  {m.cost != null && ` · R$ ${m.cost.toFixed(2)}`}
                </span>
              </div>
            ))}
            {totalCost > 0 && (
              <div className="pt-2 border-t border-border flex justify-between text-sm font-medium">
                <span className="text-foreground">Total</span>
                <span className="text-foreground">R$ {totalCost.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
