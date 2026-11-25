import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { Info, Loader2, Lock, LogOut } from 'lucide-react';
import { api } from '../../../../convex/_generated/api';

// TODO(equipe): nome do produto. Enquanto não houver, fica o nome descritivo.
export const PRODUCT_NAME = 'Triagem · Equipe de Psicologia';

function NavLink({ to, children }: { to: '/' | '/simulador'; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-full px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tri-celeste"
      activeProps={{ className: 'bg-white/15 text-white' }}
      activeOptions={{ exact: true }}
    >
      {children}
    </Link>
  );
}

/** Aviso discreto: valores provisórios. */
export function ProvisionalNotice() {
  const me = useQuery(api.staff.me);
  if (!me?.priorityConfig.provisional) return null;
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-tri-lavanda/60 px-4 py-2 text-sm text-tri-roxo">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        <strong>Valores provisórios.</strong> Escalas, perguntas e pontos de corte são exemplos e
        ainda vão ser definidos com as psicólogas do A.C.Camargo.
      </span>
    </p>
  );
}

/**
 * Casca do painel: cabeçalho, aviso, rodapé e checagem de papel na tela.
 * (A checagem que vale é a do servidor — esta só evita mostrar a tela vazia.)
 */
export function AppShell({ children }: { children: ReactNode }) {
  const me = useQuery(api.staff.me);
  const { signOut } = useAuthActions();
  const showSimulator = me?.isPsicologa && me.simulatorEnabled;

  return (
    <div className="flex min-h-screen flex-col bg-tri-creme text-tri-tinta">
      <header className="bg-tri-azul text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="mr-2 font-serif text-lg font-semibold tracking-tight sm:text-xl">
            {PRODUCT_NAME}
          </Link>
          {me?.isPsicologa ? (
            <nav className="flex items-center gap-1" aria-label="Navegação principal">
              <NavLink to="/">Fila</NavLink>
              {showSimulator ? <NavLink to="/simulador">Simulador do WhatsApp</NavLink> : null}
            </nav>
          ) : null}
          <div className="ml-auto flex items-center gap-3 text-sm">
            {me ? <span className="hidden text-white/90 sm:inline">{me.name}</span> : null}
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/40 px-3 py-1.5 font-semibold hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-tri-celeste"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {me === undefined ? (
          <div className="flex items-center gap-2 text-tri-azul">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Carregando…
          </div>
        ) : !me?.isPsicologa ? (
          <RestrictedNotice />
        ) : (
          <div className="space-y-6">
            <ProvisionalNotice />
            {children}
          </div>
        )}
      </main>

      <footer className="border-t border-tri-azul/10 px-4 py-4 text-center text-sm text-tri-tinta/80">
        Este painel organiza uma <strong>triagem</strong>: não é terapia nem diagnóstico. Quem cuida
        das pacientes é sempre a equipe de psicologia.
      </footer>
    </div>
  );
}

function RestrictedNotice() {
  return (
    <div className="mx-auto max-w-lg rounded-3xl bg-white p-8 text-center shadow-sm">
      <Lock className="mx-auto mb-4 h-10 w-10 text-tri-azul" aria-hidden="true" />
      <h1 className="font-serif text-2xl font-semibold">Acesso restrito</h1>
      <p className="mt-3 text-tri-tinta/80">
        Este painel é só para a equipe de psicologia. Se você faz parte da equipe, peça para a
        coordenação liberar o seu acesso.
      </p>
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-white p-5 shadow-sm sm:p-6 ${className}`}>{children}</section>;
}
