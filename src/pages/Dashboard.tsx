import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCondo } from '@/contexts/CondoContext';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Building2,
  Users,
  FileText,
  ShieldCheck,
  Activity,
  AlertTriangle,
  Bell,
  Clock,
  CheckCircle2,
  Info,
} from 'lucide-react';

export default function Dashboard() {
  const { user } = useAuth();
  const { condoId, condoName, role } = useCondo();
  const [counts, setCounts] = useState({ condos: 0, residents: 0, invoices: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!condoId) {
      setLoading(false);
      return;
    }

    const fetchCounts = async () => {
      setLoading(true);
      const [condosRes, residentsRes, invoicesRes] = await Promise.all([
        supabase
          .schema('nfe_vigia')
          .from('condos')
          .select('*', { count: 'exact', head: true })
          .eq('id', condoId),
        supabase
          .schema('nfe_vigia')
          .from('residents')
          .select('*', { count: 'exact', head: true })
          .eq('condo_id', condoId),
        supabase
          .schema('nfe_vigia')
          .from('invoices')
          .select('*', { count: 'exact', head: true })
          .eq('condo_id', condoId),
      ]);
      setCounts({
        condos: condosRes.count ?? 0,
        residents: residentsRes.count ?? 0,
        invoices: invoicesRes.count ?? 0,
      });
      setLoading(false);
    };

    fetchCounts();
  }, [condoId]);

  const roleLabel = (r: string | null) => {
    switch (r) {
      case 'admin':
        return 'Administrador';
      case 'manager':
        return 'Síndico';
      case 'user':
        return 'Usuário';
      default:
        return r ?? '—';
    }
  };

  const statCards = [
    {
      label: 'Moradores',
      value: counts.residents,
      icon: Users,
      description: 'cadastrados neste condomínio',
    },
    {
      label: 'Condomínios',
      value: counts.condos,
      icon: Building2,
      description: 'vinculados à sua conta',
    },
    {
      label: 'Notas Fiscais',
      value: counts.invoices,
      icon: FileText,
      description: 'registradas no sistema',
    },
    {
      label: 'Seu Perfil',
      value: roleLabel(role),
      icon: ShieldCheck,
      description: 'função no condomínio ativo',
      isText: true,
    },
  ];

  const recentActivities = [
    { text: 'Nenhuma atividade recente registrada.', time: '', icon: Info, empty: true },
  ];

  const alerts = [
    { text: 'Nenhum alerta no momento.', type: 'info' as const, empty: true },
  ];

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Bem-vindo{user?.email ? `, ${user.email}` : ''}
          </p>
        </div>
        {condoName && (
          <div className="mt-2 flex items-center gap-2 sm:mt-0">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{condoName}</span>
            {role && (
              <Badge variant="secondary" className="text-xs">
                {roleLabel(role)}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon, description, isText }) => (
          <Card key={label} className="relative overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <div className="rounded-md bg-muted p-2">
                <Icon className="h-4 w-4 text-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-20" />
              ) : isText ? (
                <p className="text-lg font-semibold text-foreground">{value}</p>
              ) : (
                <p className="text-3xl font-bold tabular-nums text-foreground">{value}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Resumo do condomínio ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Resumo do condomínio
          </CardTitle>
          <CardDescription>Visão geral do condomínio ativo</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : !condoId ? (
            <p className="text-sm text-muted-foreground">Nenhum condomínio selecionado.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Condomínio
                </p>
                <p className="text-sm font-semibold text-foreground">{condoName ?? '—'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Moradores
                </p>
                <p className="text-sm font-semibold text-foreground">{counts.residents}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Notas Fiscais
                </p>
                <p className="text-sm font-semibold text-foreground">{counts.invoices}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Grid: Atividades + Alertas ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Atividades recentes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Atividades recentes
            </CardTitle>
            <CardDescription>Últimas ações realizadas no condomínio</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivities.map((item, i) =>
                item.empty ? (
                  <div key={i} className="flex items-center gap-3 rounded-md border border-dashed border-border p-4">
                    <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{item.text}</p>
                  </div>
                ) : (
                  <div key={i} className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full bg-muted p-1.5">
                      <item.icon className="h-3 w-3 text-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{item.text}</p>
                      <p className="text-xs text-muted-foreground">{item.time}</p>
                    </div>
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>

        {/* Alertas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-muted-foreground" />
              Alertas
            </CardTitle>
            <CardDescription>Notificações e avisos do sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {alerts.map((alert, i) =>
                alert.empty ? (
                  <div key={i} className="flex items-center gap-3 rounded-md border border-dashed border-border p-4">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{alert.text}</p>
                  </div>
                ) : (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-md border border-border bg-muted/50 p-3"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <p className="text-sm text-foreground">{alert.text}</p>
                  </div>
                ),
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
