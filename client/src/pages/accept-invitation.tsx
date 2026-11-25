import { useNavigate, useParams } from '@tanstack/react-router';
import { AcceptInvitation, useAcceptInvitation } from '@djpanda/convex-tenants/react';
import { Authenticated, Unauthenticated, useConvexAuth } from 'convex/react';
import { AuthForm } from '@/components/auth-form';
import { Creditos, FundoDodecagonos, OlharHumanoLogo } from '@/components/olhar-humano-marca';
import { api } from '../../../convex/_generated/api';

function AcceptInvitationContent() {
  const { id: invitationId } = useParams({ from: '/accept-invitation/$id' });
  const navigate = useNavigate();
  const { isAuthenticated } = useConvexAuth();
  const acceptState = useAcceptInvitation({
    invitationId,
    getInvitationQuery: api.tenants.getInvitation as never,
    acceptInvitationMutation: api.tenants.acceptInvitation,
    declineInvitationMutation: api.tenants.declineInvitation,
  });

  return (
    <div className="mx-auto w-full max-w-md space-y-4 py-6">
      <div className="space-y-3 text-center">
        <h1 className="font-serif text-3xl">Você recebeu um convite</h1>
        <p className="text-muted-foreground">
          Aceite para entrar na equipe de psicologia do hospital no Olhar Humano.
        </p>
      </div>
      <AcceptInvitation
        invitation={acceptState.invitation ?? null}
        organizationName={acceptState.organizationName}
        isLoading={acceptState.isLoading}
        isAuthenticated={isAuthenticated}
        isAccepting={acceptState.isAccepting}
        isDeclining={acceptState.isDeclining}
        accepted={acceptState.accepted}
        declined={acceptState.declined}
        error={acceptState.error ?? undefined}
        onAccept={async () => {
          await acceptState.acceptInvitation();
        }}
        onDecline={async () => {
          await acceptState.declineInvitation();
        }}
        onNavigateToLogin={() => {
          void navigate({ to: '/login' });
        }}
        onNavigateHome={() => {
          void navigate({ to: '/' });
        }}
      />
      {acceptState.isLoading ? (
        <p className="text-center text-sm text-muted-foreground">Carregando o convite...</p>
      ) : null}
    </div>
  );
}

export function AcceptInvitationPage() {
  return (
    <>
      <Unauthenticated>
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
          <FundoDodecagonos />
          <div className="relative z-10 w-full max-w-md space-y-6">
            <AcceptInvitationContent />
            <AuthForm />
            <Creditos />
          </div>
        </div>
      </Unauthenticated>
      <Authenticated>
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
          <FundoDodecagonos />
          <div className="relative z-10 w-full max-w-md space-y-6">
            <OlharHumanoLogo className="justify-center" tamanho="grande" subtitulo />
            <AcceptInvitationContent />
            <Creditos />
          </div>
        </div>
      </Authenticated>
    </>
  );
}
