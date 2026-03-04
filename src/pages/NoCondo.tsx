import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCondo } from '@/contexts/CondoContext';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building2, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function NoCondo() {
  const { signOut } = useAuth();
  const { refresh } = useCondo();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    setSubmitting(true);
    const { error } = await supabase.schema('nfe_vigia').rpc('onboard_create_condo', {
      p_name: name.trim(),
      p_document: cnpj.trim() || null,
    });

    if (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao criar condomínio',
        description: error.message,
      });
      setSubmitting(false);
      return;
    }

    await refresh();
    navigate('/dashboard');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Building2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl">Você ainda não está vinculado a um condomínio</CardTitle>
          <CardDescription>Crie seu condomínio para começar a usar o NFe Vigia.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="condo-name">Nome do condomínio</Label>
            <Input
              id="condo-name"
              placeholder="Ex: Residencial Flores"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="condo-cnpj">CNPJ (opcional)</Label>
            <Input
              id="condo-cnpj"
              placeholder="00.000.000/0000-00"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              disabled={submitting}
            />
          </div>
          <Button
            className="w-full"
            disabled={!name.trim() || submitting}
            onClick={handleCreate}
          >
            {submitting && <Loader2 className="animate-spin" />}
            Criar condomínio
          </Button>
          <Button variant="outline" onClick={signOut} className="w-full" disabled={submitting}>
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
