import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth, type AuthProviderConfig } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import type { MutationCtx } from './_generated/server';
import { createOrUpdateOAuthUser } from './lib/auth';
import { codigoPorEmail } from './lib/codigoPorEmail';
import { createGoogleProvider } from './lib/googleProvider';
import { createTestLoginProvider } from './lib/testLoginProvider';
import { normalizeEmail } from './lib/users';

const MIN_SENHA = 8;

/**
 * Team sign-in with e-mail and password. The first access ("signUp") creates the password and
 * confirms the e-mail with a 6-digit code; a forgotten password is reset with a code too.
 * Only invited e-mails get an account (checked in createOrUpdateOAuthUser).
 */
const senha = Password({
  id: 'password',
  profile(params) {
    const email = typeof params.email === 'string' ? normalizeEmail(params.email) : '';
    if (!email || !email.includes('@')) {
      throw new ConvexError('Escreva um e-mail válido.');
    }
    return { email };
  },
  validatePasswordRequirements(password) {
    if (password.length < MIN_SENHA) {
      throw new ConvexError(`A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`);
    }
  },
  verify: codigoPorEmail('codigo-confirmacao', 'confirmar'),
  reset: codigoPorEmail('codigo-nova-senha', 'senha'),
});

function createAuthProviders(): AuthProviderConfig[] {
  // Google stays available for the development test accounts; the site shows e-mail and password.
  const providers: AuthProviderConfig[] = [senha, createGoogleProvider()];
  if (process.env.E2E_AUTH_SECRET?.trim()) {
    providers.push(createTestLoginProvider());
  }
  return providers;
}

export const { auth, signIn, signOut, store } = convexAuth({
  providers: createAuthProviders(),
  callbacks: {
    async createOrUpdateUser(ctx, args) {
      return await createOrUpdateOAuthUser(ctx as MutationCtx, args);
    },
  },
});
