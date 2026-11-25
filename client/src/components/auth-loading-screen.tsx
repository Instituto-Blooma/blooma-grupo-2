import { OlharHumanoLogo } from '@/components/olhar-humano-marca';

export function AuthLoadingScreen() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 bg-background"
      data-testid="auth-loading"
      aria-busy="true"
    >
      <OlharHumanoLogo tamanho="grande" />
      <p className="text-sm text-muted-foreground">Carregando...</p>
    </div>
  );
}
