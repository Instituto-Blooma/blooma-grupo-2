import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { usePermission, useTenantsData } from '@djpanda/convex-tenants/react';
import { useConvexAuth, useQuery } from 'convex/react';
import { LogOut, User } from 'lucide-react';
import { toast } from 'sonner';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { Creditos, OlharHumanoLogo } from '@/components/olhar-humano-marca';
import { OrganizationContextControl } from '@/components/organization-context-control';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { api } from '../../../../convex/_generated/api';
import { PerfilForm } from './perfil-form';

export type Hospital = { organizationId: string; nome: string };

type Secao = 'fila' | 'pacientes' | 'perfil' | 'equipe';

/**
 * Header, navigation and the checks every team page needs: signed in, member of a hospital and
 * with a profile (name and role). Only then the page itself is shown.
 */
export function AppShell({
  secao,
  children,
}: {
  secao?: Secao;
  children: (hospital: Hospital) => ReactNode;
}) {
  const { isAuthenticated } = useConvexAuth();
  const usuario = useQuery(api.users.current, isAuthenticated ? {} : 'skip');
  const statusConvite = useQuery(
    api.onboarding.getMyOnboardingStatus,
    isAuthenticated ? {} : 'skip'
  );
  const ehAdminDaPlataforma = useQuery(
    api.platform.isCurrentUserPlatformAdmin,
    isAuthenticated ? {} : 'skip'
  );
  const perfil = useQuery(api.equipe.meuPerfil, isAuthenticated ? {} : 'skip');
  const { currentOrganization, isOrganizationsLoading } = useTenantsData();

  let conteudo: ReactNode;
  if (usuario === undefined || isOrganizationsLoading || perfil === undefined) {
    conteudo = <Aviso>Carregando...</Aviso>;
  } else if (!currentOrganization) {
    conteudo = ehAdminDaPlataforma ? (
      <Recado titulo="Administração da plataforma">
        Esta conta cria hospitais e convida pessoas. Use o{' '}
        <Link to="/admin" className="font-medium text-primary underline underline-offset-4">
          painel de administração
        </Link>
        .
      </Recado>
    ) : (
      <Recado titulo="Aguardando convite" data-testid="waiting-for-invitation">
        {statusConvite?.status === 'invited'
          ? 'Seu convite está pronto. Entre com o Google usando o e-mail que recebeu o convite.'
          : 'Você ainda não faz parte da equipe de nenhum hospital. Peça um convite à pessoa responsável pela equipe e entre de novo com o mesmo e-mail.'}
      </Recado>
    );
  } else if (perfil === null) {
    conteudo = (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <h1 className="font-serif text-3xl">Antes de começar</h1>
          <CardDescription>
            Conte como você quer aparecer para as pacientes. Seu nome e sua função vão no começo de
            cada mensagem que você mandar pelo WhatsApp. Dá para mudar depois em &quot;Meu
            perfil&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PerfilForm inicial={usuario?.name ? { nome: usuario.name, funcao: '' } : null} />
        </CardContent>
      </Card>
    );
  } else {
    conteudo = children({
      organizationId: currentOrganization._id,
      nome: currentOrganization.name,
    });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ImpersonationBanner />
      <Cabecalho
        secao={secao}
        usuario={usuario ?? null}
        organizationId={currentOrganization?._id}
        ehAdminDaPlataforma={Boolean(ehAdminDaPlataforma)}
        temPerfil={Boolean(perfil)}
      />
      <main className="container flex-1 px-4 py-6 md:px-6 md:py-10">{conteudo}</main>
      <footer className="border-t py-5">
        <Creditos className="container px-4 md:px-6" />
      </footer>
    </div>
  );
}

function Cabecalho({
  secao,
  usuario,
  organizationId,
  ehAdminDaPlataforma,
  temPerfil,
}: {
  secao?: Secao;
  usuario: { name?: string | null; email?: string | null; image?: string | null } | null;
  organizationId: string | undefined;
  ehAdminDaPlataforma: boolean;
  temPerfil: boolean;
}) {
  const { signOut } = useAuthActions();
  const podeGerenciar = usePermission({
    organizationId,
    permission: 'settings:manage',
    checkPermissionQuery: api.tenants.checkPermission,
  });
  const nome = usuario?.name ?? 'Usuária';

  const sair = async () => {
    try {
      await signOut();
      toast.success('Você saiu da conta.');
    } catch {
      toast.error('Não foi possível sair. Tente de novo.');
    }
  };

  const mostrarNavegacao = Boolean(organizationId) && temPerfil;

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex min-h-14 flex-wrap items-center justify-between gap-2 px-4 py-2 md:px-6">
        <div className="flex items-center gap-3">
          <Link to="/" aria-label="Olhar Humano: ir para a fila">
            <OlharHumanoLogo />
          </Link>
          {organizationId ? <span className="h-6 w-px bg-border" aria-hidden /> : null}
          <OrganizationContextControl isPlatformAdmin={ehAdminDaPlataforma} />
        </div>
        <nav className="flex flex-wrap items-center gap-1">
          {mostrarNavegacao ? (
            <>
              <ItemMenu para="/" ativo={secao === 'fila'}>
                Fila
              </ItemMenu>
              <ItemMenu para="/pacientes" ativo={secao === 'pacientes'}>
                Pacientes
              </ItemMenu>
            </>
          ) : null}
          {podeGerenciar.allowed ? (
            <ItemMenu para="/settings/members" ativo={secao === 'equipe'}>
              Equipe
            </ItemMenu>
          ) : null}
          {ehAdminDaPlataforma ? (
            <ItemMenu para="/admin" ativo={false}>
              Administração
            </ItemMenu>
          ) : null}
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative h-9 w-9 rounded-full"
                aria-label="Menu da conta"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={usuario?.image ?? undefined} />
                  <AvatarFallback>{nome.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium leading-none">{nome}</p>
                <p className="mt-1 text-xs leading-none text-muted-foreground">
                  {usuario?.email ?? ''}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/perfil">
                  <User className="mr-2 h-4 w-4" />
                  Meu perfil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={sair}>
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  );
}

function ItemMenu({
  para,
  ativo,
  children,
}: {
  para: string;
  ativo: boolean;
  children: ReactNode;
}) {
  return (
    <Link to={para}>
      <Button
        variant={ativo ? 'secondary' : 'ghost'}
        size="sm"
        className={cn(ativo && 'font-semibold')}
      >
        {children}
      </Button>
    </Link>
  );
}

export function Aviso({ children, ...props }: { children: ReactNode; 'data-testid'?: string }) {
  return (
    <div
      className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
      {...props}
    >
      {children}
    </div>
  );
}

/** A short centered message with a title, for states like "waiting for an invitation". */
function Recado({
  titulo,
  children,
  ...props
}: {
  titulo: string;
  children: ReactNode;
  'data-testid'?: string;
}) {
  return (
    <Card className="mx-auto max-w-lg text-center" {...props}>
      <CardContent className="space-y-3 pt-8 pb-8">
        <h1 className="font-serif text-3xl">{titulo}</h1>
        <p className="text-muted-foreground">{children}</p>
      </CardContent>
    </Card>
  );
}
