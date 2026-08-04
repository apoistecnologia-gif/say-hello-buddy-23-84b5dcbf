import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

export const Route = createFileRoute('/cadastro')({
  component: CadastroPage,
});

function CadastroPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!fullName || !email || !phone || !password || !confirmPassword) {
      toast.error('Por favor, preencha todos os campos.');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem.');
      return;
    }

    if (password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (!acceptTerms) {
      toast.error('Você precisa aceitar os termos e condições.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone: phone,
          },
        },
      });

      if (error) {
        if (error.message.includes('User already registered')) {
          toast.error('Este e-mail já está cadastrado.');
        } else {
          toast.error(error.message);
        }
      } else {
        toast.success('Cadastro realizado! Verifique seu e-mail para confirmar a conta.');
        navigate({ to: '/login' });
      }
    } catch (err) {
      toast.error('Ocorreu um erro ao realizar o cadastro.');
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3').replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return numbers.slice(0, 11);
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-6 pt-8 pb-24 overflow-y-auto">
      <Link to="/login" className="mb-6 inline-flex items-center text-gray-400">
        <ArrowLeft size={20} className="mr-2" />
        Voltar para o login
      </Link>

      <h1 className="text-3xl font-bold mb-2">Criar conta</h1>
      <p className="text-gray-400 mb-8">Preencha os dados abaixo para começar.</p>

      <form onSubmit={handleRegister} className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Nome completo</label>
          <Input 
            placeholder="Seu nome completo" 
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={loading}
            className="w-full bg-[#1e1e1e] border-gray-800 text-white h-14 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">E-mail</label>
          <Input 
            type="email" 
            placeholder="seu@email.com" 
            value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            disabled={loading}
            className="w-full bg-[#1e1e1e] border-gray-800 text-white h-14 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Telefone</label>
          <Input 
            type="tel" 
            placeholder="(00) 00000-0000" 
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={loading}
            className="w-full bg-[#1e1e1e] border-gray-800 text-white h-14 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Senha</label>
          <div className="relative">
            <Input 
              type={showPassword ? "text" : "password"} 
              placeholder="Crie uma senha segura" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="w-full bg-[#1e1e1e] border-gray-800 text-white h-14 rounded-xl pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Confirmar senha</label>
          <Input 
            type="password" 
            placeholder="Repita sua senha" 
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            className="w-full bg-[#1e1e1e] border-gray-800 text-white h-14 rounded-xl"
          />
        </div>

        <div className="flex items-center space-x-2 pt-2">
          <Checkbox 
            id="terms" 
            checked={acceptTerms}
            onCheckedChange={(checked) => setAcceptTerms(!!checked)}
            className="border-gray-800 data-[state=checked]:bg-yellow-500 data-[state=checked]:text-black"
          />
          <label htmlFor="terms" className="text-xs text-gray-400 leading-tight">
            Eu aceito os <span className="text-yellow-500">Termos de Uso</span> e a <span className="text-yellow-500">Política de Privacidade</span>.
          </label>
        </div>

        <Button 
          type="submit" 
          disabled={loading}
          className="w-full bg-yellow-500 hover:bg-yellow-600 text-black h-14 rounded-xl font-bold text-lg mt-6"
        >
          {loading ? <Loader2 className="animate-spin" /> : 'Criar minha conta'}
        </Button>
      </form>
    </div>
  );
}
