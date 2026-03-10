import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCondo } from '@/contexts/CondoContext';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Building2,
  Users,
  FileText,
  ShieldCheck,
  Activity,
  Bell,
  CheckCircle2,
  Info,
  UserPlus,
  Pencil,
  Trash2,
  Plus,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PendingApprovalsCards } from '@/components/dashboard/PendingApprovalsCards';

interface ActivityLog {
  id: string;
  action: string;
  entity: string;
  description: string;
  created_at: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { condoId, condoName, role } = useCondo();
  const [counts, setCounts] = useState({ condos: 0, residents: 0, invoices: 0 });
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!condoId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);

      const [condosRes, residentsRes, invoicesRes] = await Promise.all([
        // Count condos the user has access to via get_my_condos
        supabase.schema('nfe_vigia').rpc('get_my_condos'),
        // Count residents for active condo
        supabase
          .schema('nfe_vigia')
          .from('residents')
          .select('*', { count: 'exact', head: true })
          .eq('condo_id', condoId),
        // Count invoices for active condo (table may not exist yet)
        supabase
          .schema('nfe_vigia')
          .from('invoices')
          .select('*', { count: 'exact', head: true })
          .eq('condo_id', condoId),
      ]);

      // activity_logs table does not exist yet — skip
      const recentRes = { error: true as const, data: null };

      const condoCount = Array.isArray(condosRes.data) ? condosRes.data.length : 0;

      setCounts({
        condos: condoCount,
        residents: residentsRes.count ?? 0,
        invoices: invoicesRes.error ? 0 : (invoicesRes.count ?? 0),
      });

      setActivities(recentRes.error ? [] : (recentRes.data ?? []));
      setLoading(false);
    };

    fetchData();
  }, [condoId]);

  const roleLabel = (r: string | null) => {
    switch (r) {
      case 'SINDICO':
        return 'Síndico';
      case 'SUBSINDICO':
        return 'Subsíndico';
      case 'CONSELHO':
        return 'Conselho';
      case 'ZELADOR':
        return 'Zelador';
      case 'MORADOR':
        return 'Morador';
      case 'ADMIN':
        return 'Administrador do Sistema';
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

      {/* ── Pending Approval Cards ── */}
      <PendingApprovalsCards />

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
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Condomínio
                </p>
                <p className="text-sm font-semibold text-foreground">{condoName ?? '—'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Sua função
                </p>
                <p className="text-sm font-semibold text-foreground">{roleLabel(role)}</p>
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
            <CardDescription>Últimas ações no condomínio</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {loading ? (
                <>
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </>
              ) : activities.length === 0 ? (
                <div className="flex items-center gap-3 rounded-md border border-dashed border-border p-4">
                  <Info className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
                </div>
              ) : (
                activities.map((log) => {
                  const IconComp =
                    log.action === 'create' ? Plus :
                    log.action === 'update' ? Pencil :
                    log.action === 'delete' ? Trash2 : Activity;
                  return (
                    <div key={log.id} className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-full bg-muted p-1.5">
                        <IconComp className="h-3 w-3 text-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{log.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(log.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })
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
              {loading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <div className="flex items-center gap-3 rounded-md border border-dashed border-border p-4">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Nenhum alerta no momento.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
