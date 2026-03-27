import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useCondo } from '@/contexts/CondoContext';
import { useFinancialConfig, getRequiredRoles } from '@/hooks/useFinancialConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DollarSign, FileText, CheckCircle2, Gavel, Clock, ArrowRight } from 'lucide-react';
import { differenceInHours } from 'date-fns';

export function PendingApprovalsCards() {
  const { user } = useAuth();
  const { condoId, role } = useCondo();
  const { config } = useFinancialConfig(condoId);
  const navigate = useNavigate();
  const [pendingMyApprovals, setPendingMyApprovals] = useState(0);
  const [minervaCount, setMinervaCount] = useState(0);
  const [pendingNFDocs, setPendingNFDocs] = useState(0);
  const [minExpiry, setMinExpiry] = useState<string | null>(null);
  const [internalUserId, setInternalUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isSindico = role === 'SINDICO' || role === 'ADMIN';
  const isApprover = role === 'SUBSINDICO' || role === 'CONSELHO';
  const showCards = isSindico || isApprover;

  useEffect(() => {
    if (!user) return;
    apiFetch(`/api/data/users/by-auth-id/?auth_user_id=${user.id}`)
      .then(res => res.json())
      .then(data => setInternalUserId(data?.id ?? null))
      .catch(() => setInternalUserId(null));
  }, [user]);

  useEffect(() => {
    if (!condoId || !internalUserId || !showCards) {
      setLoading(false);
      return;
    }

    const fetchPending = async () => {
      setLoading(true);

      try {
        // OS approvals
        const osRes = await apiFetch(`/api/data/os-approvals/?condo_id=${condoId}&approver_id=${internalUserId}&decision=pendente`);
        const osData = await osRes.json();
        const osRows = Array.isArray(osData) ? osData : osData?.results ?? [];

        const osCount = osRows.length;
        const osMinExp = osRows.reduce((min: string | null, a: any) => {
          if (!min || a.expires_at < min) return a.expires_at;
          return min;
        }, null as string | null) ?? null;

        setPendingMyApprovals(osCount);
        setMinExpiry(osMinExp);

        // NF docs pending
        const nfRes = await apiFetch(`/api/data/fiscal-documents/?condo_id=${condoId}&status=PENDENTE`);
        const nfData = await nfRes.json();
        const pendingDocs = Array.isArray(nfData) ? nfData : nfData?.results ?? [];

        let nfCount = 0;
        if (pendingDocs.length > 0) {
          const votesRes = await apiFetch(`/api/data/approvals/?approver_user_id=${internalUserId}&decision=aprovado,rejeitado`);
          const votesData = await votesRes.json();
          const votesRows = Array.isArray(votesData) ? votesData : votesData?.results ?? [];
          const votedIds = new Set(votesRows.map((v: any) => v.fiscal_document_id));

          for (const doc of pendingDocs) {
            if (votedIds.has(doc.id)) continue;
            const required = getRequiredRoles(doc.amount ?? 0, config);
            if (isSindico) {
              if (required.includes('SINDICO')) nfCount++;
            } else if (required.includes(role ?? '')) {
              nfCount++;
            }
          }
        }
        setPendingNFDocs(nfCount);

        // Minerva for síndico
        if (isSindico) {
          const minervaRes = await apiFetch(`/api/data/os-approvals/?condo_id=${condoId}&is_minerva=true&minerva_justification__isnull=true`);
          const minervaData = await minervaRes.json();
          const minervaRows = Array.isArray(minervaData) ? minervaData : minervaData?.results ?? [];
          setMinervaCount(minervaRows.length);
        }
      } catch {
        setPendingMyApprovals(0);
        setPendingNFDocs(0);
        setMinervaCount(0);
      }

      setLoading(false);
    };

    fetchPending();
  }, [condoId, internalUserId, showCards, config]);

  if (!showCards || loading) return null;

  const hasAnyPending = pendingMyApprovals > 0 || minervaCount > 0 || pendingNFDocs > 0;
  if (!hasAnyPending) return null;

  const expiryLabel = (expiry: string | null) => {
    if (!expiry) return null;
    const hours = differenceInHours(new Date(expiry), new Date());
    if (hours <= 0) return 'Expirado';
    return `Expira em ${hours}h`;
  };

  const cards = [
    { show: pendingMyApprovals > 0, icon: DollarSign, label: 'Aprovações de OS pendentes', count: pendingMyApprovals, expiry: minExpiry, path: '/ordens-servico' },
    { show: isSindico && minervaCount > 0, icon: Gavel, label: 'Votos de minerva pendentes', count: minervaCount, expiry: null, path: '/ordens-servico' },
    { show: pendingNFDocs > 0, icon: FileText, label: 'NFs aguardando seu voto', count: pendingNFDocs, expiry: null, path: '/almoxarifado' },
  ].filter(c => c.show);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ icon: Icon, label, count, expiry, path }, i) => (
        <Card key={i} className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(path)}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            <div className="rounded-md bg-amber-100 dark:bg-amber-900 p-2">
              <Icon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums text-foreground">{count}</p>
            {expiry && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Clock className="h-3 w-3" /> {expiryLabel(expiry)}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
