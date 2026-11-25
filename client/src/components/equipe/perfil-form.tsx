import { useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '../../../../convex/_generated/api';
import { mensagemDeErro } from './formato';

/** Name and role that go at the top of every message the patient receives from this person. */
export function PerfilForm({
  inicial,
  aoSalvar,
}: {
  inicial: { nome: string; funcao: string } | null;
  aoSalvar?: () => void;
}) {
  const salvar = useMutation(api.equipe.salvarMeuPerfil);
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [funcao, setFuncao] = useState(inicial?.funcao ?? '');
  const [salvando, setSalvando] = useState(false);
  const primeiroNome = nome.trim().split(/\s+/)[0] || 'Ana';

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    try {
      await salvar({ nome, funcao });
      toast.success('Perfil salvo.');
      aoSalvar?.();
    } catch (erro) {
      toast.error(mensagemDeErro(erro));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="perfil-nome">Seu nome</Label>
        <Input
          id="perfil-nome"
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
          placeholder="Ana Souza"
          maxLength={60}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="perfil-funcao">Sua função</Label>
        <Input
          id="perfil-funcao"
          value={funcao}
          onChange={(evento) => setFuncao(evento.target.value)}
          placeholder="psicóloga"
          maxLength={40}
          required
        />
      </div>
      <p className="text-sm text-muted-foreground">
        A paciente vai ver suas mensagens assim no WhatsApp:{' '}
        <span className="font-semibold text-foreground">
          {primeiroNome} ({funcao.trim() || 'psicóloga'}):
        </span>
      </p>
      <Button type="submit" disabled={salvando}>
        {salvando ? 'Salvando...' : 'Salvar'}
      </Button>
    </form>
  );
}
