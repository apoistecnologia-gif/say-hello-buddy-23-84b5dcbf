import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/recuperar-senha")({
  component: RecuperarSenhaPage,
});

function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Por favor, informe seu e-mail.");
      return;
    }

    setLoading(true);
    try {
      // O Supabase Auth lida com a recuperação de senha
      // O redirectUrl deve ser configurado para apontar para /redefinir-senha
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });

      if (error) {
        toast.error(error.message);
      } else {
        setSent(true);
        toast.success("Instruções enviadas para o seu e-mail.");
      }
    } catch (err) {
      toast.error("Erro ao solicitar recuperação de senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-6 pt-12">
      <Link to="/login" className="mb-8 inline-flex items-center text-gray-400">
        <ArrowLeft size={20} className="mr-2" />
        Voltar para o login
      </Link>

      {!sent ? (
        <>
          <h1 className="text-3xl font-bold mb-2">Recuperar senha</h1>
          <p className="text-gray-400 mb-8">
            Informe seu e-mail e enviaremos as instruções para você criar uma nova senha.
          </p>

          <form onSubmit={handleRecover} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">E-mail</label>
              <Input
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full bg-[#1e1e1e] border-gray-800 text-white h-14 rounded-xl"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-black h-14 rounded-xl font-bold text-lg"
            >
              {loading ? <Loader2 className="animate-spin" /> : "Enviar instruções"}
            </Button>
          </form>
        </>
      ) : (
        <div className="text-center py-10">
          <div className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center">
              <span className="text-black font-bold">✓</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-4">E-mail enviado!</h2>
          <p className="text-gray-400 mb-8">
            Verifique sua caixa de entrada e siga as instruções para redefinir sua senha.
          </p>
          <Link to="/login" className="text-yellow-500 font-bold hover:underline">
            Voltar para o login
          </Link>
        </div>
      )}
    </div>
  );
}
