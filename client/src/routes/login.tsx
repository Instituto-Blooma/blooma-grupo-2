import { createFileRoute, redirect } from '@tanstack/react-router';
import { AuthForm } from '@/components/auth-form';
import { Creditos, FundoDodecagonos } from '@/components/olhar-humano-marca';
import { validateLoginSearch } from '@/lib/route-guards';

export const Route = createFileRoute('/login')({
  validateSearch: validateLoginSearch,
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated) {
      throw redirect({ href: search.redirect ?? '/' });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background p-4">
      <FundoDodecagonos />
      <div className="relative z-10 w-full max-w-md space-y-8">
        <AuthForm />
        <Creditos />
      </div>
    </div>
  );
}
