import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useCondo } from '@/contexts/CondoContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  RefreshCw,
  Shield,
  CalendarDays,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ─── Types ────────────────────────────────────────────────────────────────────

type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled' | null;

interface CondoBillingInfo {
  name: string;
  subscription_status: SubscriptionStatus;
  subscription_id: string | null;
  subscription_expires_at: string | null;
}

interface CardForm {
  number: string;
  holder_name: string;
  exp_month: string;
  exp_year: string;
  cvv: string;
}

interface CustomerForm {
  name: string;
  email: string;
  document: string;
  phone: string;
}

const emptyCard: CardForm = { number: '', holder_name: '', exp_month: '', exp_year: '', cvv: '' };
const emptyCustomer: CustomerForm = { name: '', email: '', document: '', phone: '' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCardNumber(v: string) {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}
function formatCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}
function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d+)/, '($1) $2-$3');
  return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}

/** Tokenize card via Pagar.me public API — card data never reaches our server */
async function tokenizeCard(card: CardForm, publicKey: string): Promise<string> {
  const res = await fetch(`https://api.pagar.me/core/v5/tokens?appId=${publicKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'card',
      card: {
        number: card.number.replace(/\s/g, ''),
        holder_name: card.holder_name.trim(),
        exp_month: parseInt(card.exp_month, 10),
        exp_year: parseInt(card.exp_year, 10),
        cvv: card.cvv.trim(),
      },
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    const msg = data?.message ?? data?.errors?.map((e: any) => e.message).join(', ') ?? 'Erro ao tokenizar cartão';
    throw new Error(msg);
  }

  return data.id as string;
}

// ─── Status display ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  NonNullable<SubscriptionStatus>,
  { label: string; color: string; icon: typeof CheckCircle2; description: string }
> = {
  trial: {
    label: 'Período de teste',
    color: 'bg-primary/15 text-primary border-primary/30',
    icon: Shield,
    description: 'Você está no período gratuito. Assine para continuar usando após o período de avaliação.',
  },
  active: {
    label: 'Ativa',
    color: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
    icon: CheckCircle2,
    description: 'Sua assinatura está em dia. Obrigado!',
  },
  past_due: {
    label: 'Pagamento pendente',
    color: 'bg-warning/15 text-warning border-warning/30',
    icon: AlertTriangle,
    description: 'Houve uma falha no último pagamento. Atualize seus dados de pagamento para evitar a suspensão.',
  },
  canceled: {
    label: 'Cancelada',
    color: 'bg-destructive/15 text-destructive border-destructive/30',
    icon: XCircle,
    description: 'Sua assinatura está cancelada. Assine novamente para reativar o acesso.',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Billing() {
  const { user } = useAuth();
  const { condoId, condoName } = useCondo();
  const { toast } = useToast();

  const [billingInfo, setBillingInfo] = useState<CondoBillingInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);

  const [card, setCard] = useState<CardForm>(emptyCard);
  const [customer, setCustomer] = useState<CustomerForm>(emptyCustomer);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // ── Fetch billing info ────────────────────────────────────────────────────
  const fetchBillingInfo = async () => {
    if (!condoId) return;
    setLoadingInfo(true);
    try {
      const res = await apiFetch(`/api/data/condos/${condoId}/`);
      if (res.ok) {
        const data = await res.json();
        setBillingInfo({
          name: data.name,
          subscription_status: data.subscription_status,
          subscription_id: data.subscription_id,
          subscription_expires_at: data.subscription_expires_at,
        } as CondoBillingInfo);
      } else {
        setBillingInfo(null);
      }
    } catch {
      setBillingInfo(null);
    }
    setLoadingInfo(false);
  };

  useEffect(() => {
    fetchBillingInfo();
  }, [condoId]);

  // Pre-fill customer email from auth user
  useEffect(() => {
    if (user?.email && !customer.email) {
      setCustomer((prev) => ({ ...prev, email: user.email! }));
    }
  }, [user]);

  const status: SubscriptionStatus = billingInfo?.subscription_status ?? null;
  const statusConfig = status ? STATUS_CONFIG[status] : null;
  const needsSubscription = status === 'trial' || status === 'past_due' || status === 'canceled';

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!condoId || !user) return;

    // Basic validation
    const cardDigits = card.number.replace(/\s/g, '');
    if (cardDigits.length < 13) { toast({ title: 'Número do cartão inválido', variant: 'destructive' }); return; }
    if (!card.holder_name.trim()) { toast({ title: 'Nome no cartão é obrigatório', variant: 'destructive' }); return; }
    if (!card.exp_month || !card.exp_year) { toast({ title: 'Data de validade inválida', variant: 'destructive' }); return; }
    if (card.cvv.length < 3) { toast({ title: 'CVV inválido', variant: 'destructive' }); return; }
    if (!customer.name.trim()) { toast({ title: 'Nome completo é obrigatório', variant: 'destructive' }); return; }
    if (!customer.email.trim()) { toast({ title: 'E-mail é obrigatório', variant: 'destructive' }); return; }
    const docDigits = customer.document.replace(/\D/g, '');
    if (docDigits.length < 11) { toast({ title: 'CPF inválido', variant: 'destructive' }); return; }

    setSubmitting(true);

    try {
      const publicKey = import.meta.env.VITE_PAGARME_PUBLIC_KEY as string;
      if (!publicKey) throw new Error('Chave pública do Pagar.me não configurada (VITE_PAGARME_PUBLIC_KEY)');

      // Step 1: tokenize card in browser (PAN never reaches our server)
      let cardToken: string;
      try {
        cardToken = await tokenizeCard(card, publicKey);
      } catch (tokenErr: any) {
        toast({ title: 'Erro no cartão', description: tokenErr.message, variant: 'destructive' });
        setSubmitting(false);
        return;
      }

      // Step 2: call backend API with token + customer data
      const res = await apiFetch('/api/subscriptions/create/', {
        method: 'POST',
        body: JSON.stringify({
          card_token: cardToken,
          condo_id: condoId,
          customer: {
            name: customer.name.trim(),
            email: customer.email.trim(),
            document: customer.document.replace(/\D/g, ''),
            phone: customer.phone.replace(/\D/g, ''),
          },
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        const msg = typeof result.detail === 'string'
          ? result.detail
          : typeof result.error === 'string'
          ? result.error
          : 'Erro ao processar pagamento';
        toast({ title: 'Erro no pagamento', description: msg, variant: 'destructive' });
        setSubmitting(false);
        return;
      }

      toast({ title: '🎉 Assinatura ativada com sucesso!', description: 'Bem-vindo ao NFe Vigia Pro.' });
      setShowForm(false);
      setCard(emptyCard);
      await fetchBillingInfo();
    } catch (err: any) {
      toast({ title: 'Erro inesperado', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loadingInfo) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Cobrança</h1>
        <p className="text-sm text-muted-foreground">Gerencie a assinatura do condomínio.</p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Status da Assinatura
          </CardTitle>
          <CardDescription>{condoName ?? 'Condomínio ativo'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {statusConfig && (
            <div className="flex items-start gap-3">
              <statusConfig.icon className={`h-5 w-5 mt-0.5 shrink-0 ${
                status === 'active' ? 'text-emerald-500' :
                status === 'past_due' ? 'text-warning' :
                status === 'canceled' ? 'text-destructive' : 'text-primary'
              }`} />
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-xs ${statusConfig.color}`}>
                    {statusConfig.label}
                  </Badge>
                  {billingInfo?.subscription_expires_at && status === 'active' && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      Próxima cobrança: {format(new Date(billingInfo.subscription_expires_at), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{statusConfig.description}</p>
              </div>
            </div>
          )}

          {billingInfo?.subscription_id && (
            <div className="text-xs text-muted-foreground font-mono bg-muted/30 rounded px-3 py-2">
              ID: {billingInfo.subscription_id}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={fetchBillingInfo}>
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar status
            </Button>
            {needsSubscription && !showForm && (
              <Button size="sm" className="gap-1.5" onClick={() => setShowForm(true)}>
                <CreditCard className="h-3.5 w-3.5" />
                {status === 'past_due' ? 'Atualizar pagamento' : 'Assinar agora'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Plan info */}
      <Card className="border-primary/20 bg-primary/3">
        <CardContent className="pt-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-foreground">NFe Vigia Pro</p>
              <p className="text-sm text-muted-foreground">Assinatura mensal — acesso completo a todas as funcionalidades</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-foreground">R$ 365</p>
              <p className="text-xs text-muted-foreground">/mês</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Dados de Pagamento
            </CardTitle>
            <CardDescription>
              Seus dados de cartão são tokenizados diretamente no Pagar.me. Nunca chegam ao nosso servidor.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubscribe} className="space-y-5">
              {/* Customer data */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dados do responsável</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cust-name">Nome completo *</Label>
                    <Input
                      id="cust-name"
                      placeholder="João da Silva"
                      value={customer.name}
                      onChange={(e) => setCustomer((p) => ({ ...p, name: e.target.value }))}
                      disabled={submitting}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cust-email">E-mail *</Label>
                    <Input
                      id="cust-email"
                      type="email"
                      placeholder="joao@email.com"
                      value={customer.email}
                      onChange={(e) => setCustomer((p) => ({ ...p, email: e.target.value }))}
                      disabled={submitting}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cust-doc">CPF *</Label>
                    <Input
                      id="cust-doc"
                      placeholder="000.000.000-00"
                      value={customer.document}
                      onChange={(e) => setCustomer((p) => ({ ...p, document: formatCPF(e.target.value) }))}
                      disabled={submitting}
                      maxLength={14}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cust-phone">Telefone</Label>
                    <Input
                      id="cust-phone"
                      placeholder="(11) 99999-9999"
                      value={customer.phone}
                      onChange={(e) => setCustomer((p) => ({ ...p, phone: formatPhone(e.target.value) }))}
                      disabled={submitting}
                      maxLength={15}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Card data */}
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dados do cartão</p>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="card-number">Número do cartão *</Label>
                    <Input
                      id="card-number"
                      placeholder="0000 0000 0000 0000"
                      value={card.number}
                      onChange={(e) => setCard((p) => ({ ...p, number: formatCardNumber(e.target.value) }))}
                      disabled={submitting}
                      maxLength={19}
                      inputMode="numeric"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="card-holder">Nome impresso no cartão *</Label>
                    <Input
                      id="card-holder"
                      placeholder="JOAO DA SILVA"
                      value={card.holder_name}
                      onChange={(e) => setCard((p) => ({ ...p, holder_name: e.target.value.toUpperCase() }))}
                      disabled={submitting}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="card-month">Mês *</Label>
                      <Input
                        id="card-month"
                        placeholder="MM"
                        value={card.exp_month}
                        onChange={(e) => setCard((p) => ({ ...p, exp_month: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                        disabled={submitting}
                        maxLength={2}
                        inputMode="numeric"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="card-year">Ano *</Label>
                      <Input
                        id="card-year"
                        placeholder="AAAA"
                        value={card.exp_year}
                        onChange={(e) => setCard((p) => ({ ...p, exp_year: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                        disabled={submitting}
                        maxLength={4}
                        inputMode="numeric"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="card-cvv">CVV *</Label>
                      <Input
                        id="card-cvv"
                        placeholder="000"
                        value={card.cvv}
                        onChange={(e) => setCard((p) => ({ ...p, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                        disabled={submitting}
                        maxLength={4}
                        inputMode="numeric"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Shield className="h-3.5 w-3.5 text-emerald-500" />
                Pagamento seguro processado pelo Pagar.me. Dados de cartão nunca passam pelos nossos servidores.
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting} className="gap-2 min-w-[140px]">
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Processando...</>
                  ) : (
                    <><CreditCard className="h-4 w-4" /> Assinar — R$ 365/mês</>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
