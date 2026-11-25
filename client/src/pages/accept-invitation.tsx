import { Link, useParams } from '@tanstack/react-router';
import { useAcceptInvitation } from '@djpanda/convex-tenants/react';
import { Authenticated, Unauthenticated } from 'convex/react';
import { AuthForm } from '@/components/auth-form';
import { dataHora } from '@/components/equipe/formato';
import { Creditos, FundoDodecagonos, OlharHumanoLogo } from '@/components/olhar-humano-marca';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '../../../convex/_generated/api';

const ROTULO_PAPEL: Record<string, string> = {
  admin: 'Responsável pela equipe',
  member: 'Equipe',
};

/** The invitation itself: hospital, role and the accept / decline buttons (after signing in). */
function Convite({ podeResponder }: { podeResponder: boolean }) {
  const { id: invitationId } = useParams({ from: '/accept-invitation/$id' });
  const estado = useAcceptInvitation({
    invitationId,
    getInvitationQuery: api.tenants.getInvitation as never,
    acceptInvitationMutation: api.tenants.acceptInvitation,
    declineInvitationMutation: api.tenants.declineInvitation,
  });
  const convite = estado.invitation;
  const hospital = estado.organizationName ?? 'o hospital';

  let conteudo;
  if (estado.isLoading) {
    conteudo = <p className="text-muted-foreground">Carregando o convite...</p>;
  } else if (!convite) {
    conteudo = (
      <p className="text-muted-foreground">
        Este convite não existe ou já foi cancelado. Peça um convite novo à pessoa responsável pela
        equipe.
      </p>
    );
  } else if (estado.accepted) {
    conteudo = (
      <div className="space-y-4">
        <p>Pronto! Agora você faz parte da equipe do {hospital}.</p>
        <Link to="/">
          <Button>Ir para a fila</Button>
        </Link>
      </div>
    );
  } else if (estado.declined) {
    conteudo = <p className="text-muted-foreground">Você recusou o convite.</p>;
  } else if (convite.isExpired || convite.status !== 'pending') {
    conteudo = (
      <p className="text-muted-foreground">
        Este convite venceu ou já foi usado. Peça um convite novo à pessoa responsável pela equipe.
      </p>
    );
  } else {
    conteudo = (
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="font-subtitulo text-xl font-semibold">{hospital}</p>
          <p className="text-sm text-muted-foreground">
            Para: {convite.inviteeIdentifier} · Papel: {ROTULO_PAPEL[convite.role] ?? convite.role}
          </p>
          <p className="text-sm text-muted-foreground">Vale até {dataHora(convite.expiresAt)}.</p>
        </div>
        {podeResponder ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void estado.acceptInvitation()} disabled={estado.isAccepting}>
              {estado.isAccepting ? 'Aceitando...' : 'Aceitar o convite'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => void estado.declineInvitation()}
              disabled={estado.isDeclining}
            >
              Recusar
            </Button>
          </div>
        ) : (
          <p className="text-sm">
            Para aceitar, entre logo abaixo com o e-mail{' '}
            <strong>{convite.inviteeIdentifier}</strong>. No primeiro acesso, clique em
            &quot;Primeiro acesso? Criar senha&quot;.
          </p>
        )}
        {estado.error ? (
          <p className="text-sm text-destructive">
            Não foi possível responder ao convite. Confira se você entrou com o e-mail do convite.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <h1 className="font-serif text-3xl">Você recebeu um convite</h1>
        {conteudo}
      </CardContent>
    </Card>
  );
}

export function AcceptInvitationPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <FundoDodecagonos />
      <div className="relative z-10 w-full max-w-md space-y-6">
        <Unauthenticated>
          <Convite podeResponder={false} />
          <AuthForm />
        </Unauthenticated>
        <Authenticated>
          <OlharHumanoLogo className="justify-center" tamanho="grande" subtitulo />
          <Convite podeResponder />
        </Authenticated>
        <Creditos />
      </div>
    </div>
  );
}
