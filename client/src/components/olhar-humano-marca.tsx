import { cn } from '@/lib/utils';

/** Points of a regular dodecagon (12 sides), the shape of the Grupo 2 identity. */
function dodecagono(cx: number, cy: number, raio: number) {
  return Array.from({ length: 12 }, (_, indice) => {
    const angulo = (Math.PI / 6) * indice + Math.PI / 12;
    return `${(cx + raio * Math.cos(angulo)).toFixed(2)},${(cy + raio * Math.sin(angulo)).toFixed(2)}`;
  }).join(' ');
}

/** Symbol: an eye whose iris is a dodecagon. */
export function OlharHumanoSimbolo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn('shrink-0', className)} aria-hidden="true">
      <path
        d="M3 24C9.5 13.5 16.5 9 24 9s14.5 4.5 21 15c-6.5 10.5-13.5 15-21 15S9.5 34.5 3 24Z"
        fill="#E8F4FC"
        stroke="#2C6A96"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <polygon points={dodecagono(24, 24, 10)} fill="#D9D9FF" stroke="#3F3FA6" strokeWidth="1.5" />
      <circle cx="24" cy="24" r="4.2" fill="#1B4765" />
      <circle cx="26" cy="21.8" r="1.4" fill="#FFF8E7" />
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
