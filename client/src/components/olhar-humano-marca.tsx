import { cn } from '@/lib/utils';

/** Points of a regular dodecagon (12 sides), the shape of the Grupo 2 identity. */
function dodecagono(cx: number, cy: number, raio: number) {
  return Array.from({ length: 12 }, (_, indice) => {
    const angulo = (Math.PI / 6) * indice + Math.PI / 12;
    return `${(cx + raio * Math.cos(angulo)).toFixed(2)},${(cy + raio * Math.sin(angulo)).toFixed(2)}`;
  }).join(' ');
}

/**
 * Symbol "Abraço" (two open arms as eyelids around an orange pupil, on a lavender square).
 * It is always the same file, client/public/logo.svg, with the same colors on light and dark
 * screens; the tab icons and the e-mail image are rendered from that file too.
 */
export function OlharHumanoSimbolo({ className }: { className?: string }) {
  return <img src="/logo.svg" alt="" aria-hidden="true" className={cn('shrink-0', className)} />;
}

/** Symbol + name. `subtitulo` adds "Triagem de psicologia" under the name. */
export function OlharHumanoLogo({
  className,
  tamanho = 'compacto',
  subtitulo = false,
  sobreEscuro = false,
}: {
  className?: string;
  tamanho?: 'compacto' | 'grande';
  subtitulo?: boolean;
  /** On the deep-blue side panel: white name, lavender subtitle. */
  sobreEscuro?: boolean;
}) {
  const grande = tamanho === 'grande';
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <OlharHumanoSimbolo className={grande ? 'h-12 w-12' : 'h-8 w-8'} />
      <div className="leading-none">
        <p
          className={cn(
            'font-serif',
            sobreEscuro ? 'text-white' : 'text-titulo',
            grande ? 'text-3xl' : 'text-xl'
          )}
        >
          Olhar Humano
        </p>
        {subtitulo ? (
          <p
            className={cn(
              'mt-1 font-subtitulo text-sm italic',
              sobreEscuro ? 'text-lavanda' : 'text-muted-foreground'
            )}
          >
            Triagem de psicologia
          </p>
        ) : null}
      </div>
    </div>
  );
}

const FORMAS = [
  { left: '6%', top: '10%', tamanho: 120, cor: 'fill-lavanda' },
  { left: '82%', top: '8%', tamanho: 90, cor: 'fill-azul-clarinho' },
  { left: '88%', top: '68%', tamanho: 140, cor: 'fill-lavanda-clara' },
  { left: '10%', top: '74%', tamanho: 80, cor: 'fill-pessego' },
  { left: '48%', top: '88%', tamanho: 56, cor: 'fill-lavanda' },
] as const;

/** Soft dodecagons in the base colors, behind the sign-in screens. */
export function FundoDodecagonos({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      {FORMAS.map((forma) => (
        <svg
          key={`${forma.left}-${forma.top}`}
          viewBox="0 0 100 100"
          className="absolute opacity-40 dark:opacity-15"
          style={{
            left: forma.left,
            top: forma.top,
            width: forma.tamanho,
            height: forma.tamanho,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <polygon points={dodecagono(50, 50, 50)} className={forma.cor} />
        </svg>
      ))}
    </div>
  );
}

/** Footer line with the credit to the Instituto Blooma. */
export function Creditos({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-1 text-center text-xs text-muted-foreground', className)}>
      <p>Esta triagem não é diagnóstico: quem cuida é sempre a equipe.</p>
      <p>
        <span className="font-subtitulo italic">Olhar Humano</span> foi feito por bloomers do
        Instituto Blooma.
      </p>
    </div>
  );
}
