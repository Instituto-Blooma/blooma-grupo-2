import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// Weekly check-in: Mondays at 12:00 UTC = 9h in Brasília.
crons.cron('check-in semanal', '0 12 * * 1', internal.triagem.iniciarCheckinsDaSemana, {
  cursor: null,
});

export default crons;
