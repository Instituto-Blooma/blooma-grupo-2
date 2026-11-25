import { useQuery } from 'convex/react';
import { AppShell } from '@/components/equipe/app-shell';
import { PerfilForm } from '@/components/equipe/perfil-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '../../../convex/_generated/api';

export function PerfilPage() {
  return <AppShell secao="perfil">{() => <Perfil />}</AppShell>;
}

function Perfil() {
  const perfil = useQuery(api.equipe.meuPerfil);
  if (perfil === undefined) return null;
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>Meu perfil</CardTitle>
        <CardDescription>
          Seu nome e sua função vão no começo de cada mensagem que você manda para as pacientes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PerfilForm key={`${perfil?.nome}-${perfil?.funcao}`} inicial={perfil} />
      </CardContent>
    </Card>
  );
}
