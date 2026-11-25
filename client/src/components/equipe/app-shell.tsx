import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { usePermission, useTenantsData } from '@djpanda/convex-tenants/react';
import { useConvexAuth, useQuery } from 'convex/react';
import { LogOut, User } from 'lucide-react';
import { toast } from 'sonner';
import { BloomaWordmark } from '@/components/blooma-brand';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { OrganizationContextControl } from '@/components/organization-context-control';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

type Secao = 'fila' | 'pacientes' | 'perfil';

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
      <Aviso>
        Conta de administração da plataforma. Use o{' '}
        <Link to="/admin" className="underline">
          painel de administração
        </Link>{' '}
        para criar hospitais e convidar pessoas.
      </Aviso>
    ) : (
      <Aviso data-testid="waiting-for-invitation">
        {statusConvite?.status === 'invited'
          ? 'Seu convite está pronto. Entre com o Google usando o e-mail que recebeu o convite.'
          : 'Você ainda não faz parte de nenhum hospital. Peça um convite para a pessoa responsável pela equipe.'}
      </Aviso>
    );
  } else if (perfil === null) {
    conteudo = (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Antes de começar</CardTitle>
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
      <main className="flex-1 container px-4 md:px-6 py-6 md:py-8">{conteudo}</main>
      <footer className="border-t py-4">
        <p className="container px-4 md:px-6 text-center text-sm text-muted-foreground">
          Triagem de psicologia · Instituto Blooma. Esta triagem não é diagnóstico: quem cuida é
          sempre a equipe.
        </p>
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
          <BloomaWordmark compact />
          <OrganizationContextControl isPlatformAdmin={ehAdminDaPlataforma} />
        </div>
        <nav className="flex flex-wrap items-center gap-1">
          {mostrarNavegacao ? (
            <>
              <ItemMenu para="/" ativo={secao === 'fila'}>
                Fila
              </ItemMenu>
              <ItemMenu para="/pacientes" ativo={secao === 'pacientes'}>
                Todas as pacientes
              </ItemMenu>
            </>
          ) : null}
          {podeGerenciar.allowed ? (
            <ItemMenu para="/settings/members" ativo={false}>
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
