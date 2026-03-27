import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { Copy, Link2, LinkIcon, Loader2 } from 'lucide-react';

interface InviteLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  condoId: string;
}

export default function InviteLinkDialog({ open, onOpenChange, condoId }: InviteLinkDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteActive, setInviteActive] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fullLink = inviteCode ? `https://www.nfevigia.com.br/cadastro?convite=${inviteCode}` : '';

  const fetchCurrent = async () => {
    setLoading(true);
    try {
      const condoRes = await apiFetch(`/api/data/condos/${condoId}/`);
      if (condoRes.ok) {
        const data = await condoRes.json();
        setInviteCode(data.invite_code ?? null);
        setInviteActive(data.invite_active ?? false);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchCurrent();
  }, [open, condoId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await apiFetch('/api/condos/invite/generate/', {
        method: 'POST',
        body: JSON.stringify({ condoId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast({ title: 'Erro ao gerar link', description: errData.error || 'Tente novamente.', variant: 'destructive' });
      } else {
        const data = await res.json();
        if (data.invite_code) {
          setInviteCode(data.invite_code);
          setInviteActive(true);
          toast({ title: 'Link de convite gerado!' });
        } else {
          toast({ title: 'Erro ao confirmar gravação', description: 'O código não foi salvo corretamente.', variant: 'destructive' });
        }
      }
    } catch {
      toast({ title: 'Erro ao gerar link', description: 'Tente novamente.', variant: 'destructive' });
    }
    setGenerating(false);
  };

  const handleDeactivate = async () => {
    try {
      const res = await apiFetch('/api/condos/invite/generate/', {
        method: 'POST',
        body: JSON.stringify({ condoId, action: 'deactivate' }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast({ title: 'Erro ao desativar link', description: errData.error || 'Tente novamente.', variant: 'destructive' });
      } else {
        setInviteActive(false);
        toast({ title: 'Link desativado' });
      }
    } catch {
      toast({ title: 'Erro ao desativar link', variant: 'destructive' });
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(fullLink);
    toast({ title: 'Link copiado!' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Link de Convite
          </DialogTitle>
          <DialogDescription>
            Gere um link para que novos moradores solicitem acesso ao condomínio.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : inviteCode && inviteActive ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Input value={fullLink} readOnly className="text-sm" />
              <Button variant="outline" size="icon" onClick={handleCopy}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              ⚠️ Qualquer pessoa com este link pode solicitar acesso. Desative após o cadastro dos moradores se desejar.
            </p>
            <Button variant="destructive" size="sm" onClick={handleDeactivate} className="w-full">
              Desativar link
            </Button>
          </div>
        ) : (
          <div className="space-y-4 text-center py-2">
            {inviteCode && !inviteActive && (
              <p className="text-sm text-muted-foreground">O link anterior foi desativado.</p>
            )}
            <Button onClick={handleGenerate} disabled={generating} className="w-full">
              {generating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              <LinkIcon className="h-4 w-4 mr-2" />
              Gerar novo link de convite
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
