import { Card, CardContent } from '@/components/ui/card';
import { BloomaWordmark } from '@/components/blooma-brand';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <BloomaWordmark compact className="mb-6" />
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <h1 className="font-serif text-2xl font-semibold">Página não encontrada</h1>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            Este endereço não existe. Volte para a fila pelo menu.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
