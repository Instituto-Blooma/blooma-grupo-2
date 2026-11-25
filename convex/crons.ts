import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// Lembrete semanal do check-in.
// TODO(equipe): confirmar dia e horário. Hoje: segunda-feira 12:00 UTC (9h em Brasília).
crons.cron('lembrete semanal de check-in', '0 12 * * 1', internal.reminders.markDue, {});

export default crons;
