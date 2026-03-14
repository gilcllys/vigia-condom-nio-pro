import { FileText, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface ApprovalRow {
  doc: string;
  value: string;
  tier: string;
  tierColor: string;
  deadline: string;
}

const mockApprovals: ApprovalRow[] = [
  { doc: 'NF #3245', value: 'R$ 1.200,00', tier: 'SUBSÍNDICO', tierColor: 'bg-primary text-primary-foreground', deadline: '2 dias' },
  { doc: 'NF #5678', value: 'R$ 3.450,00', tier: 'CONSELHO', tierColor: 'bg-warning text-warning-foreground', deadline: '4 dias' },
  { doc: 'NF #8912', value: 'R$ 5.800,00', tier: 'SÍNDICO', tierColor: 'bg-secondary text-secondary-foreground', deadline: '1 dia' },
];

export function DashboardApprovals() {
  const navigate = useNavigate();

  return (
    <div className="glass-card">
      <div className="flex items-center justify-between p-5 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">Aprovações Pendentes</h2>
        </div>
        <button onClick={() => navigate('/almoxarifado')} className="text-muted-foreground hover:text-primary transition-colors">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-5 gap-4 px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b border-border/50">
        <span>Documento</span>
        <span>Valor</span>
        <span>Alçada</span>
        <span>Prazo</span>
        <span className="text-right">Ações</span>
      </div>

      {/* Rows */}
      {mockApprovals.map((row) => (
        <div key={row.doc} className="grid grid-cols-5 gap-4 px-5 py-4 items-center border-b border-border/30 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{row.doc}</span>
          </div>
          <span className="text-sm text-foreground">{row.value}</span>
          <Badge className={`${row.tierColor} text-xs w-fit`}>{row.tier}</Badge>
          <span className="text-sm text-muted-foreground">{row.deadline}</span>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" className="h-7 text-xs border-primary/30 text-primary hover:bg-primary/10">
              Aprovar
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs border-destructive/30 text-destructive hover:bg-destructive/10">
              Rejeitar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
