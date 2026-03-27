import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Building2, Loader2 } from 'lucide-react';

export default function JoinCondoSection() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const extractCode = (input: string): string => {
    // Extract code from full URL or just the code
    const match = input.match(/convite=([A-Za-z0-9]+)/);
    return match ? match[1] : input.trim();
  };

  const handleJoin = async () => {
    if (!user || !code.trim()) return;
    setLoading(true);

    const inviteCode = extractCode(code);

    try {
      // Validate invite code
      const condoRes = await apiFetch(`/api/data/condos/validate-invite/?code=${encodeURIComponent(inviteCode)}`);
      const condo = await condoRes.json();

      if (!condo || !condo.id) {
        toast({ title: 'Código inválido', description: 'O link de convite é inválido ou expirou.', variant: 'destructive' });
        setLoading(false);
        return;
      }

      // Get user id from nfe_vigia.users
      const userRes = await apiFetch(`/api/data/users/by-auth-id/?auth_user_id=${user.id}`);
      const userRow = await userRes.json();

      if (!userRow || !userRow.id) {
        toast({ title: 'Erro', description: 'Não foi possível encontrar seu perfil.', variant: 'destructive' });
        setLoading(false);
        return;
      }

      // Check if already linked
      const existingRes = await apiFetch(`/api/data/user-condos/?user_id=${userRow.id}&condo_id=${condo.id}`);
      const existingData = await existingRes.json();
      const existingList = Array.isArray(existingData) ? existingData : existingData?.results ?? [];

      if (existingList.length > 0) {
        toast({ title: 'Você já está vinculado a este condomínio', variant: 'destructive' });
        setLoading(false);
        return;
      }

      // Create pending user_condos entry
      const createRes = await apiFetch('/api/data/user-condos/', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userRow.id,
          condo_id: condo.id,
          role: 'MORADOR',
          status: 'pendente',
          is_default: false,
        }),
      });

      if (!createRes.ok) {
        toast({ title: 'Erro ao solicitar acesso', description: 'Tente novamente.', variant: 'destructive' });
      } else {
        toast({ title: 'Solicitação enviada!', description: `Aguarde a aprovação do síndico de ${condo.name}.` });
        setCode('');
      }
    } catch {
      toast({ title: 'Erro ao solicitar acesso', description: 'Tente novamente.', variant: 'destructive' });
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-5 w-5" />
          Solicitar acesso a outro condomínio
        </CardTitle>
        <CardDescription>Cole o link ou código de convite recebido do síndico.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="invite-code">Link ou código de convite</Label>
          <Input
            id="invite-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Cole o link ou código aqui"
          />
        </div>
        <Button onClick={handleJoin} disabled={!code.trim() || loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Solicitar acesso
        </Button>
      </CardContent>
    </Card>
  );
}
