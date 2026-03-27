import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
// No auth/apiFetch needed — signup uses unauthenticated fetch to backend
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';

export default function Cadastro() {
  const [searchParams] = useSearchParams();
  const inviteCode = searchParams.get('convite') ?? '';
  const navigate = useNavigate();
  const { toast } = useToast();

  const [validating, setValidating] = useState(true);
  const [condoName, setCondoName] = useState('');
  const [condoId, setCondoId] = useState('');
  const [invalidCode, setInvalidCode] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [docType, setDocType] = useState<'cpf' | 'rg'>('cpf');
  const [document, setDocument] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Residence
  const [residenceType, setResidenceType] = useState<'apartamento' | 'casa'>('apartamento');
  const [block, setBlock] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [street, setStreet] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [complement, setComplement] = useState('');

  const [saving, setSaving] = useState(false);

  // Validate invite code via backend
  useEffect(() => {
    const validate = async () => {
      if (!inviteCode) {
        setInvalidCode(true);
        setValidating(false);
        return;
      }
      try {
        const res = await fetch(
          `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/api/data/condos/validate-invite/?code=${encodeURIComponent(inviteCode)}`,
        );
        if (!res.ok) {
          setInvalidCode(true);
        } else {
          const data = await res.json();
          if (data?.id && data?.name) {
            setCondoId(data.id);
            setCondoName(data.name);
          } else {
            setInvalidCode(true);
          }
        }
      } catch {
        setInvalidCode(true);
      }
      setValidating(false);
    };
    validate();
  }, [inviteCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({ title: 'As senhas não coincidem', variant: 'destructive' });
      return;
    }
    if (password.length < 8) {
      toast({ title: 'A senha deve ter no mínimo 8 caracteres', variant: 'destructive' });
      return;
    }

    setSaving(true);

    try {
      // Build residence fields
      let blockVal: string | null = null;
      let unitVal: string | null = null;
      let unitLabelVal: string | null = null;

      if (residenceType === 'apartamento') {
        blockVal = block.trim() || null;
        unitVal = unitNumber.trim() || null;
      } else {
        blockVal = street.trim() || null;
        unitVal = houseNumber.trim() || null;
        unitLabelVal = complement.trim() || null;
      }

      // Use the composite signup-register endpoint
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}/api/data/signup-register/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password,
            redirect_to: window.location.origin,
            condo_id: condoId,
            full_name: fullName.trim(),
            cpf_rg: document.trim() || null,
            birth_date: birthDate || null,
            block: blockVal,
            unit: unitVal,
            unit_label: unitLabelVal,
          }),
        },
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData?.error || errData?.message || '';
        if (msg.toLowerCase().includes('user already registered') || msg.toLowerCase().includes('already registered')) {
          toast({ title: 'Este e-mail já está cadastrado', description: 'Tente fazer login ou recupere sua senha.', variant: 'destructive' });
        } else {
          toast({ title: 'Erro ao criar conta', description: msg || 'Tente novamente.', variant: 'destructive' });
        }
        setSaving(false);
        return;
      }

      setSubmitted(true);
    } catch {
      toast({ title: 'Erro inesperado', description: 'Tente novamente.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (validating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (invalidCode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-2">
              <XCircle className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle>Link inválido</CardTitle>
            <CardDescription>
              Este link de convite é inválido ou expirou. Solicite um novo link ao síndico do seu condomínio.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate('/login')} className="w-full">
              Voltar ao login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-2">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            </div>
            <CardTitle>Cadastro realizado!</CardTitle>
            <CardDescription>
              Aguarde a aprovação do síndico. Você receberá um e-mail quando seu acesso for liberado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate('/login')} className="w-full">
              Voltar ao login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">Cadastro</CardTitle>
          <CardDescription>
            Você está se cadastrando no <strong>{condoName}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Personal data */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Dados pessoais</h3>

              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo *</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="h-12 text-base" />
              </div>

              <div className="space-y-2">
                <Label>Tipo de documento *</Label>
                <RadioGroup value={docType} onValueChange={(v) => setDocType(v as 'cpf' | 'rg')} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="cpf" id="doc-cpf" />
                    <Label htmlFor="doc-cpf">CPF</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="rg" id="doc-rg" />
                    <Label htmlFor="doc-rg">RG</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="document">{docType === 'cpf' ? 'CPF' : 'RG'} *</Label>
                <Input
                  id="document"
                  value={document}
                  onChange={(e) => setDocument(e.target.value)}
                  required
                  inputMode="numeric"
                  className="h-12 text-base"
                  placeholder={docType === 'cpf' ? '000.000.000-00' : '00.000.000-0'}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthDate">Data de nascimento *</Label>
                <Input id="birthDate" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required className="h-12 text-base" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-mail *</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-12 text-base" placeholder="seu@email.com" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha * (mínimo 8 caracteres)</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="h-12 text-base pr-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar senha *</Label>
                <Input
                  id="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="h-12 text-base"
                />
              </div>
            </div>

            {/* Residence */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Endereço</h3>

              <div className="space-y-2">
                <Label>Condomínio</Label>
                <Input value={condoName} disabled className="h-12 text-base bg-muted" />
              </div>

              <div className="space-y-2">
                <Label>Tipo de residência *</Label>
                <RadioGroup value={residenceType} onValueChange={(v) => setResidenceType(v as 'apartamento' | 'casa')} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="apartamento" id="res-apto" />
                    <Label htmlFor="res-apto">Apartamento</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="casa" id="res-casa" />
                    <Label htmlFor="res-casa">Casa</Label>
                  </div>
                </RadioGroup>
              </div>

              {residenceType === 'apartamento' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="block">Torre / Bloco *</Label>
                    <Input id="block" value={block} onChange={(e) => setBlock(e.target.value)} required className="h-12 text-base" placeholder="Ex: Bloco A" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unitNumber">Apartamento *</Label>
                    <Input id="unitNumber" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} required className="h-12 text-base" placeholder="Ex: 203" />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2 space-y-2">
                      <Label htmlFor="street">Rua *</Label>
                      <Input id="street" value={street} onChange={(e) => setStreet(e.target.value)} required className="h-12 text-base" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="houseNumber">Número *</Label>
                      <Input id="houseNumber" value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} required className="h-12 text-base" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="complement">Complemento (opcional)</Label>
                    <Input id="complement" value={complement} onChange={(e) => setComplement(e.target.value)} className="h-12 text-base" />
                  </div>
                </div>
              )}
            </div>

            <Button type="submit" className="w-full h-12 text-base" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {saving ? 'Cadastrando...' : 'Criar conta'}
            </Button>

            <div className="text-center">
              <button type="button" onClick={() => navigate('/login')} className="text-sm text-muted-foreground underline-offset-4 hover:underline hover:text-primary">
                Já tenho conta — fazer login
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
