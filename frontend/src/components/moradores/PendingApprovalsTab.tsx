import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';
import { logActivity } from '@/lib/activity-log';

interface PendingUser {
  id: string;
  full_name: string;
  email: string;
  document: string | null;
  document_type: string | null;
  birth_date: string | null;
  created_at: string;
  // from residents join
  block: string | null;
  unit: string | null;
  unit_label: string | null;
}

interface PendingApprovalsTabProps {
  condoId: string;
}

export default function PendingApprovalsTab({ condoId }: PendingApprovalsTabProps) {
  const { toast } = useToast();
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<PendingUser | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchPending = async () => {
    setLoading(true);
    console.log('[PendingApprovals] condoId usado na query:', condoId);

    const { data, error } = await supabase.rpc('list_pending_approvals', {
      p_condo_id: condoId,
    });

    console.log('[PendingApprovals] RPC resultado bruto:', data);
    if (error) console.error('[PendingApprovals] RPC erro:', error);

    if (error || !data?.length) {
      setUsers([]);
      setLoading(false);
      return;
    }

    const enriched: PendingUser[] = (data as any[]).map((row) => ({
      id: row.user_id,
      full_name: row.full_name,
      email: row.email,
      document: row.cpf_rg ?? null,
      document_type: null,
      birth_date: row.birth_date,
      created_at: row.created_at,
      block: row.block ?? null,
      unit: row.unit ?? null,
      unit_label: row.unit_label ?? null,
    }));

    setUsers(enriched);
    setLoading(false);
  };

  useEffect(() => {
    fetchPending();
  }, [condoId]);

  const handleApprove = async (user: PendingUser) => {
    setProcessing(user.id);

    const { error: userError } = await supabase
      .from('users')
      .update({ status: 'ativo' })
      .eq('id', user.id);

    if (userError) {
      toast({ title: 'Erro ao aprovar', description: 'Tente novamente.', variant: 'destructive' });
      setProcessing(null);
      return;
    }

    await supabase
      .from('user_condos')
      .update({ status: 'ativo' })
      .eq('user_id', user.id)
      .eq('condo_id', condoId);

    // Create resident record if one doesn't exist yet (users via invite don't have one)
    const { data: existingResident } = await supabase
      .from('residents')
      .select('id')
      .eq('email', user.email.toLowerCase())
      .eq('condo_id', condoId)
      .maybeSingle();

    if (!existingResident) {
      await supabase
        .from('residents')
        .insert({
          condo_id: condoId,
          full_name: user.full_name,
          email: user.email.toLowerCase(),
          block: user.block || null,
          unit: user.unit || null,
          unit_label: user.unit_label || null,
          unit_id: null,
          document: user.document || null,
          phone: null,
        });
    }

    await logActivity({
      condoId,
      action: 'update',
      entity: 'user',
      entityId: user.id,
      description: `Acesso de "${user.full_name}" aprovado`,
    });

    toast({ title: `Acesso de ${user.full_name} aprovado!` });
    setProcessing(null);
    fetchPending();
  };

  const openReject = (user: PendingUser) => {
    setRejectTarget(user);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setProcessing(rejectTarget.id);

    await supabase
      .from('users')
      .update({ status: 'recusado' })
      .eq('id', rejectTarget.id);

    await supabase
      .from('user_condos')
      .update({ status: 'recusado' })
      .eq('user_id', rejectTarget.id)
      .eq('condo_id', condoId);

    await logActivity({
      condoId,
      action: 'update',
      entity: 'user',
      entityId: rejectTarget.id,
      description: `Acesso de "${rejectTarget.full_name}" recusado. Motivo: ${rejectReason.trim()}`,
    });

    toast({ title: `Cadastro de ${rejectTarget.full_name} recusado` });
    setRejectDialogOpen(false);
    setProcessing(null);
    fetchPending();
  };

  const formatAddress = (u: PendingUser) =>
    [u.block, u.unit, u.unit_label].filter(Boolean).join(' · ') || '—';

  if (loading) {
    return <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>;
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-8 space-y-2">
        <CheckCircle2 className="h-10 w-10 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">Nenhum cadastro pendente de aprovação.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {users.map((user) => (
          <Card key={user.id}>
            <CardContent className="pt-4 pb-4 space-y-2">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <p className="font-medium text-foreground">{user.full_name}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Pendente
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">{user.document_type ?? 'Doc'}:</span>{' '}
                  {user.document ?? '—'}
                </div>
                <div>
                  <span className="text-muted-foreground">Nascimento:</span>{' '}
                  {user.birth_date ? new Date(user.birth_date).toLocaleDateString('pt-BR') : '—'}
                </div>
                <div>
                  <span className="text-muted-foreground">Endereço:</span>{' '}
                  {formatAddress(user)}
                </div>
                <div>
                  <span className="text-muted-foreground">Cadastrado em:</span>{' '}
                  {new Date(user.created_at).toLocaleDateString('pt-BR')}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => handleApprove(user)}
                  disabled={processing === user.id}
                >
                  {processing === user.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                  )}
                  Aprovar acesso
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => openReject(user)}
                  disabled={processing === user.id}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Recusar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recusar cadastro</DialogTitle>
            <DialogDescription>
              Informe o motivo da recusa do cadastro de <strong>{rejectTarget?.full_name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo *</Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Informe o motivo da recusa..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectReason.trim() || processing !== null}>
              Confirmar recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
