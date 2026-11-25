import { AlertTriangle, CircleDashed } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PriorityLevel = 'alta' | 'media' | 'baixa';

export const PRIORITY_TEXT: Record<PriorityLevel, string> = {
  alta: 'Prioridade alta',
  media: 'Prioridade média',
  baixa: 'Prioridade baixa',
};

const PRIORITY_STYLE: Record<PriorityLevel, string> = {
  alta: 'bg-tri-ferrugem text-white',
  media: 'bg-tri-laranja text-tri-tinta',
  baixa: 'bg-tri-verde text-white',
};

/** Prioridade com cor E texto (nunca só cor). */
export function PriorityBadge({
  level,
  className,
}: {
  level: PriorityLevel | null;
  className?: string;
}) {
  if (!level) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full bg-tri-lavanda px-3 py-1 text-sm font-semibold text-tri-roxo',
          className
        )}
      >
        <CircleDashed className="h-4 w-4" aria-hidden="true" />
        Sem check-in
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold',
        PRIORITY_STYLE[level],
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-2.5 w-2.5 rounded-full border-2',
          level === 'media' ? 'border-tri-tinta' : 'border-white'
        )}
      />
      {PRIORITY_TEXT[level]}
    </span>
  );
}

export function RiskBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border-2 border-tri-ferrugem bg-white px-3 py-1 text-sm font-bold text-tri-ferrugem',
        className
      )}
    >
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      Sinal de risco
    </span>
  );
}
