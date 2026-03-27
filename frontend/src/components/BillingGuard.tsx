import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { apiFetch } from '@/lib/api';
import { useCondo } from '@/contexts/CondoContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled' | null;

interface BillingGuardProps {
  children: React.ReactNode;
}

/**
 * Wraps protected routes and enforces subscription access:
 * - trial / active  → full access
 * - past_due        → access with top-bar warning
 * - canceled        → redirect to /billing
 * - unknown/loading → allow (fail-open to avoid locking out on transient errors)
 */
export function BillingGuard({ children }: BillingGuardProps) {
  const { condoId, loading: condoLoading } = useCondo();
  const location = useLocation();

  const [status, setStatus] = useState<SubscriptionStatus>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!condoId) {
      setLoading(false);
      return;
    }

    const fetchBilling = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`/api/data/condos/${condoId}/billing/`);
        const data = await res.json();
        setStatus((data?.subscription_status as SubscriptionStatus) ?? 'trial');
      } catch {
        setStatus('trial'); // fail-open
      }
      setLoading(false);
    };

    fetchBilling();
  }, [condoId]);

  // Still loading condo or subscription — fail open (don't flash a redirect)
  if (condoLoading || loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Already on /billing — always allow to avoid redirect loops
  if (location.pathname === '/billing') {
    return <>{children}</>;
  }

  // Canceled — hard block, redirect to billing
  if (status === 'canceled') {
    return <Navigate to="/billing" replace />;
  }

  // Past due — soft warning banner + access
  if (status === 'past_due') {
    return (
      <div className="space-y-4">
        <Alert variant="destructive" className="border-warning/50 bg-warning/10 text-warning [&>svg]:text-warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="text-warning">Pagamento pendente</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
            <span className="text-warning/80 text-sm">
              Houve uma falha no pagamento da assinatura. Atualize seus dados para evitar a suspensão do acesso.
            </span>
            <Button size="sm" variant="outline" className="border-warning/50 text-warning hover:bg-warning/10 shrink-0" asChild>
              <Link to="/billing">Resolver agora</Link>
            </Button>
          </AlertDescription>
        </Alert>
        {children}
      </div>
    );
  }

  // trial / active / null (fail-open) — full access
  return <>{children}</>;
}
