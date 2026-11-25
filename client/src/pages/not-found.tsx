import { Link } from '@tanstack/react-router';
import { Creditos, FundoDodecagonos, OlharHumanoLogo } from '@/components/olhar-humano-marca';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-background p-4">
      <FundoDodecagonos />
      <div className="relative z-10 w-full max-w-md space-y-6">
        <Card>
          <CardContent className="space-y-4 pt-6 text-center">
            <OlharHumanoLogo className="justify-center" />
            <h1 className="font-serif text-3xl">Página não encontrada</h1>
            <p className="text-muted-foreground">Este endereço não existe ou foi mudado.</p>
            <Link to="/">
              <Button>Ir para a fila</Button>
            </Link>
          </CardContent>
        </Card>
        <Creditos />
      </div>
    </div>
  );
}
