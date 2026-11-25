import { defineConfig } from 'vitest/config';

// Testes só das regras puras da triagem (prioridade e conversa).
export default defineConfig({
  test: {
    root: '.',
    include: ['convex/lib/**/*.test.ts'],
    environment: 'node',
  },
});
