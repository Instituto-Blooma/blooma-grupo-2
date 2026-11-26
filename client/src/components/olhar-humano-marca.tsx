import { cn } from '@/lib/utils';

/** Points of a regular dodecagon (12 sides), the shape of the Grupo 2 identity. */
function dodecagono(cx: number, cy: number, raio: number) {
  return Array.from({ length: 12 }, (_, indice) => {
    const angulo = (Math.PI / 6) * indice + Math.PI / 12;
    return `${(cx + raio * Math.cos(angulo)).toFixed(2)},${(cy + raio * Math.sin(angulo)).toFixed(2)}`;
  }).join(' ');
}

/**
 * Symbol "Abraço": the two eyelids are two open arms that do not close, around an orange pupil.
 * The upper arm uses the text color (navy on light backgrounds, creme on dark ones).
 * Same drawing as design/logo-opcoes.html (option 1) and the tab icons in client/public.
 */
export function OlharHumanoSimbolo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('shrink-0 text-marca-titulo dark:text-marca-creme', className)}
      aria-hidden="true"
    >
      <path
        d="M7 33C15 17 49 17 57 33"
        fill="none"
        stroke="currentColor"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <path
        d="M13 39C21 52 43 52 51 39"
        fill="none"
        stroke="#32764C"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <circle cx="32" cy="34" r="7.5" fill="#FF9C62" />
    </svg>
  );
}

/** Symbol + name. `subtitulo` adds "Triagem de psicologia" under the name. */
export function OlharHumanoLogo({
  className,
  tamanho = 'compacto',
  subtitulo = false,
}: {
  className?: string;
  tamanho?: 'compacto' | 'grande';
  subtitulo?: boolean;
}) {
  const grande = tamanho === 'grande';
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <OlharHumanoSimbolo className={grande ? 'h-12 w-12' : 'h-8 w-8'} />
      <div className="leading-none">
        <p
          className={cn(
            'font-serif text-marca-titulo dark:text-foreground',
            grande ? 'text-3xl' : 'text-xl'
          )}
        >
          Olhar Humano
        </p>
        {subtitulo ? (
          <p className="mt-1 font-subtitulo text-sm italic text-muted-foreground">
            Triagem de psicologia
          </p>
        ) : null}
      </div>
    </div>
  );
}

const FORMAS = [
  { left: '6%', top: '10%', tamanho: 120, cor: '#D9D9FF' },
  { left: '82%', top: '8%', tamanho: 90, cor: '#C9F0D8' },
  { left: '88%', top: '68%', tamanho: 140, cor: '#64B4ED' },
  { left: '10%', top: '74%', tamanho: 80, cor: '#FF9C62' },
  { left: '48%', top: '88%', tamanho: 56, cor: '#D9D9FF' },
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
          className="absolute opacity-40"
          style={{
            left: forma.left,
            top: forma.top,
            width: forma.tamanho,
            height: forma.tamanho,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <polygon points={dodecagono(50, 50, 50)} fill={forma.cor} />
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
