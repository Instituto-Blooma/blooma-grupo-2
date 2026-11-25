import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { usePermission, useTenantsData } from '@djpanda/convex-tenants/react';
import { useConvexAuth, useQuery } from 'convex/react';
import {
  Bell,
  CircleHelp,
  CircleUserRound,
  ListOrdered,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Siren,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { Creditos, OlharHumanoLogo } from '@/components/olhar-humano-marca';
import { OrganizationContextControl } from '@/components/organization-context-control';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { api } from '../../../../convex/_generated/api';
import { PerfilForm } from './perfil-form';

export type Hospital = { organizationId: string; nome: string };

export type Secao =
  | 'fila'
  | 'urgentes'
  | 'nao_entendeu'
  | 'avisos'
  | 'pacientes'
  | 'equipe'
  | 'configuracoes'
  | 'perfil';

type Usuario = { name?: string | null; email?: string | null; image?: string | null } | null;

/**
 * Side panel, and the checks every team page needs: signed in, member of a hospital and with a
 * profile (name and role). Only then the page itself is shown.
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
  const [menuAberto, setMenuAberto] = useState(false);

  let conteudo: ReactNode;
  if (usuario === undefined || isOrganizationsLoading || perfil === undefined) {
    conteudo = <p className="py-16 text-center text-muted-foreground">Carregando...</p>;
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
          ? 'Seu convite está pronto. Entre com o e-mail que recebeu o convite.'
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

  const comMenu = Boolean(currentOrganization) && Boolean(perfil);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ImpersonationBanner />
      <div className="flex flex-1">
        {/* Side panel: fixed on large screens, a drawer on phones. */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 w-72 border-r bg-background transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
            menuAberto ? 'translate-x-0 shadow-xl' : '-translate-x-full'
          )}
          aria-label="Menu principal"
        >
          <PainelLateral
            secao={secao}
            usuario={usuario ?? null}
            organizationId={comMenu ? currentOrganization?._id : undefined}
            ehAdminDaPlataforma={Boolean(ehAdminDaPlataforma)}
            aoNavegar={() => setMenuAberto(false)}
            aoFechar={() => setMenuAberto(false)}
          />
        </aside>
        {menuAberto ? (
          <button
            type="button"
            aria-label="Fechar o menu"
            className="fixed inset-0 z-40 bg-marca-titulo/30 lg:hidden"
            onClick={() => setMenuAberto(false)}
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar only on phones and tablets. */}
          <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
            <Link to="/" aria-label="Olhar Humano: ir para a fila">
              <OlharHumanoLogo />
            </Link>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Abrir o menu"
              onClick={() => setMenuAberto(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
          <main className="w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-10">{conteudo}</main>
          <footer className="border-t py-5">
            <Creditos className="px-4" />
          </footer>
        </div>
      </div>
    </div>
  );
}

function PainelLateral({
  secao,
  usuario,
  organizationId,
  ehAdminDaPlataforma,
  aoNavegar,
  aoFechar,
}: {
  secao?: Secao;
  usuario: Usuario;
  organizationId: string | undefined;
  ehAdminDaPlataforma: boolean;
  aoNavegar: () => void;
  aoFechar: () => void;
}) {
  const { signOut } = useAuthActions();
  const podeGerenciar = usePermission({
    organizationId,
    permission: 'settings:manage',
    checkPermissionQuery: api.tenants.checkPermission,
  });
  const resumo = useQuery(api.equipe.resumoDaFila, organizationId ? { organizationId } : 'skip');
  const nome = usuario?.name ?? 'Usuária';

  const sair = async () => {
    try {
      await signOut();
      toast.success('Você saiu da conta.');
    } catch {
      toast.error('Não foi possível sair. Tente de novo.');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-5 pt-5">
        <Link to="/" onClick={aoNavegar} aria-label="Olhar Humano: ir para a fila">
          <OlharHumanoLogo />
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Fechar o menu"
          onClick={aoFechar}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="px-5 pb-4 pt-2">
        <OrganizationContextControl isPlatformAdmin={ehAdminDaPlataforma} />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {organizationId ? (
          <>
            <Grupo titulo="Atendimento">
              <Item para="/" icone={ListOrdered} ativo={secao === 'fila'} aoNavegar={aoNavegar}>
                Fila
              </Item>
              <Item
                para="/"
                busca={{ filtro: 'risco' }}
                icone={Siren}
                ativo={secao === 'urgentes'}
                aoNavegar={aoNavegar}
                contagem={resumo?.risco.total}
                tom="risco"
              >
                Sinal de risco
              </Item>
              <Item
                para="/"
                busca={{ filtro: 'nao_entendeu' }}
                icone={CircleHelp}
                ativo={secao === 'nao_entendeu'}
                aoNavegar={aoNavegar}
                contagem={resumo?.naoEntendeu.total}
                tom="robo"
              >
                Robô não entendeu
              </Item>
              <Item
                para="/avisos"
                icone={Bell}
                ativo={secao === 'avisos'}
                aoNavegar={aoNavegar}
                contagem={resumo?.avisosNaoVistos.total}
                tom="aviso"
              >
                Avisos
              </Item>
              <Item
                para="/pacientes"
                icone={Users}
                ativo={secao === 'pacientes'}
                aoNavegar={aoNavegar}
              >
                Pacientes
              </Item>
            </Grupo>
            <Grupo titulo="Hospital">
              {podeGerenciar.allowed ? (
                <Item
                  para="/settings/members"
                  icone={UsersRound}
                  ativo={secao === 'equipe'}
                  aoNavegar={aoNavegar}
                >
                  Equipe
                </Item>
              ) : null}
              <Item
                para="/settings/org"
                icone={Settings}
                ativo={secao === 'configuracoes'}
                aoNavegar={aoNavegar}
              >
                Configurações
              </Item>
            </Grupo>
          </>
        ) : null}
        <Grupo titulo="Conta">
          {organizationId ? (
            <Item
              para="/perfil"
              icone={CircleUserRound}
              ativo={secao === 'perfil'}
              aoNavegar={aoNavegar}
            >
              Meu perfil
            </Item>
          ) : null}
          {ehAdminDaPlataforma ? (
            <Item para="/admin" icone={ShieldCheck} ativo={false} aoNavegar={aoNavegar}>
              Administração
            </Item>
          ) : null}
          <button
            type="button"
            onClick={sair}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sair
          </button>
        </Grupo>
      </nav>

      <div className="flex items-center gap-3 border-t px-5 py-4">
        <Avatar className="h-9 w-9">
          <AvatarImage src={usuario?.image ?? undefined} />
          <AvatarFallback className="bg-secondary">{nome.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{nome}</p>
          <p className="truncate text-xs text-muted-foreground">{usuario?.email ?? ''}</p>
        </div>
        <ThemeToggle />
      </div>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </p>
      {children}
    </div>
  );
}

const TONS = {
  risco: 'bg-marca-laranja-escuro text-white',
  robo: 'bg-marca-azul-escuro text-white',
  aviso: 'bg-marca-menta-escuro text-white',
} as const;

function Item({
  para,
  busca,
  icone: Icone,
  ativo,
  aoNavegar,
  contagem,
  tom,
  children,
}: {
  para: string;
  busca?: { filtro: 'risco' | 'nao_entendeu' };
  icone: LucideIcon;
  ativo: boolean;
  aoNavegar: () => void;
  contagem?: number;
  tom?: keyof typeof TONS;
  children: ReactNode;
}) {
  return (
    <Link
      to={para}
      search={busca ?? {}}
      onClick={aoNavegar}
      aria-current={ativo ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        ativo
          ? 'bg-secondary text-secondary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      <Icone className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">{children}</span>
      {contagem && tom ? (
        <span
          className={cn('rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', TONS[tom])}
          aria-label={`${contagem} pendentes`}
        >
          {contagem}
        </span>
      ) : null}
    </Link>
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
      <CardContent className="space-y-3 pb-8 pt-8">
        <h1 className="font-serif text-3xl">{titulo}</h1>
        <p className="text-muted-foreground">{children}</p>
      </CardContent>
    </Card>
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
