import { useState, type FormEvent, type ReactNode } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { ConvexError } from 'convex/values';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { OlharHumanoLogo } from '@/components/olhar-humano-marca';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isDevToolsEnabled } from '@/lib/dev-tools';

/**
 * Team sign-in:
 * - "entrar": e-mail + password.
 * - "primeiro": first access, e-mail + new password; then a code sent by e-mail confirms it.
 * - "esqueci": e-mail; a code arrives and she creates a new password.
 */
type Etapa =
  | { tipo: 'entrar' }
  | { tipo: 'primeiro' }
  | { tipo: 'codigo'; email: string }
  | { tipo: 'esqueci' }
  | { tipo: 'nova-senha'; email: string };

const MIN_SENHA = 8;

function mensagemDoLogin(erro: unknown, etapa: Etapa['tipo']) {
  if (erro instanceof ConvexError && typeof erro.data === 'string') return erro.data;
  const texto = erro instanceof Error ? erro.message : '';
  if (/already exists/i.test(texto)) {
    return 'Este e-mail já tem senha. Use "Entrar" ou "Esqueci minha senha".';
  }
  if (/TooManyFailedAttempts|rate/i.test(texto)) {
    return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
  }
  if (etapa === 'codigo' || etapa === 'nova-senha') {
    return 'Código incorreto ou vencido. Confira o e-mail ou peça um código novo.';
  }
  if (etapa === 'entrar') return 'E-mail ou senha incorretos.';
  return 'Não foi possível continuar. Confira os dados e tente de novo.';
}

export function AuthForm() {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'entrar' });

  const titulo: Record<Etapa['tipo'], string> = {
    entrar: 'Entrar',
    primeiro: 'Primeiro acesso',
    codigo: 'Confira seu e-mail',
    esqueci: 'Esqueci minha senha',
    'nova-senha': 'Crie uma senha nova',
  };
  const descricao: Record<Etapa['tipo'], ReactNode> = {
    entrar: 'Área da equipe de psicologia do hospital. Entre com o e-mail que recebeu o convite.',
    primeiro:
      'Use o e-mail que recebeu o convite e crie uma senha. Depois, vamos mandar um código para esse e-mail.',
    codigo:
      etapa.tipo === 'codigo' ? (
        <>
          Mandamos um código de 6 números para <strong>{etapa.email}</strong>. Ele vale por 15
          minutos.
        </>
      ) : null,
    esqueci: 'Escreva seu e-mail. Vamos mandar um código para você criar uma senha nova.',
    'nova-senha':
      etapa.tipo === 'nova-senha' ? (
        <>
          Mandamos um código para <strong>{etapa.email}</strong>. Escreva o código e a senha nova.
        </>
      ) : null,
  };

  return (
    <Card className="mx-auto w-full max-w-md shadow-md">
      <CardHeader className="items-center space-y-5 pb-4 text-center">
        <OlharHumanoLogo tamanho="grande" subtitulo />
        <div className="space-y-2">
          <h1 className="font-serif text-3xl">{titulo[etapa.tipo]}</h1>
          <CardDescription className="text-base">{descricao[etapa.tipo]}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {etapa.tipo === 'entrar' ? <FormEntrar irPara={setEtapa} /> : null}
        {etapa.tipo === 'primeiro' ? <FormPrimeiroAcesso irPara={setEtapa} /> : null}
        {etapa.tipo === 'codigo' ? <FormCodigo email={etapa.email} irPara={setEtapa} /> : null}
        {etapa.tipo === 'esqueci' ? <FormEsqueci irPara={setEtapa} /> : null}
        {etapa.tipo === 'nova-senha' ? (
          <FormNovaSenha email={etapa.email} irPara={setEtapa} />
        ) : null}
        {isDevToolsEnabled() && etapa.tipo === 'entrar' ? <EntrarComGoogleDeTeste /> : null}
      </CardContent>
    </Card>
  );
}

type IrPara = (etapa: Etapa) => void;

function useEnvio(tipo: Etapa['tipo']) {
  const [enviando, setEnviando] = useState(false);
  const executar = async (acao: () => Promise<void>) => {
    setEnviando(true);
    try {
      await acao();
    } catch (erro) {
      toast.error(mensagemDoLogin(erro, tipo));
    } finally {
      setEnviando(false);
    }
  };
  return { enviando, executar };
}

function FormEntrar({ irPara }: { irPara: IrPara }) {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const { enviando, executar } = useEnvio('entrar');

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    void executar(async () => {
      const { signingIn } = await signIn('password', { email, password: senha, flow: 'signIn' });
      // E-mail not confirmed yet: a code was sent.
      if (!signingIn) irPara({ tipo: 'codigo', email });
    });
  };

  return (
    <form onSubmit={enviar} className="space-y-4">
      <CampoEmail valor={email} aoMudar={setEmail} />
      <CampoSenha
        id="senha"
        rotulo="Senha"
        valor={senha}
        aoMudar={setSenha}
        autoComplete="current-password"
      />
      <BotaoEnviar enviando={enviando}>Entrar</BotaoEnviar>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <BotaoLink onClick={() => irPara({ tipo: 'primeiro' })}>
          Primeiro acesso? Criar senha
        </BotaoLink>
        <BotaoLink onClick={() => irPara({ tipo: 'esqueci' })}>Esqueci minha senha</BotaoLink>
      </div>
    </form>
  );
}

function FormPrimeiroAcesso({ irPara }: { irPara: IrPara }) {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const { enviando, executar } = useEnvio('primeiro');

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    if (senha !== repetir) {
      toast.error('As duas senhas estão diferentes.');
      return;
    }
    void executar(async () => {
      const { signingIn } = await signIn('password', { email, password: senha, flow: 'signUp' });
      if (!signingIn) irPara({ tipo: 'codigo', email });
    });
  };

  return (
    <form onSubmit={enviar} className="space-y-4">
      <CampoEmail valor={email} aoMudar={setEmail} />
      <CampoSenha
        id="nova-senha"
        rotulo="Crie uma senha"
        valor={senha}
        aoMudar={setSenha}
        autoComplete="new-password"
        dica={`Pelo menos ${MIN_SENHA} caracteres.`}
      />
      <CampoSenha
        id="repetir-senha"
        rotulo="Repita a senha"
        valor={repetir}
        aoMudar={setRepetir}
        autoComplete="new-password"
      />
      <BotaoEnviar enviando={enviando}>Criar senha e receber o código</BotaoEnviar>
      <BotaoLink onClick={() => irPara({ tipo: 'entrar' })}>Já tenho senha</BotaoLink>
    </form>
  );
}

function FormCodigo({ email, irPara }: { email: string; irPara: IrPara }) {
  const { signIn } = useAuthActions();
  const [codigo, setCodigo] = useState('');
  const { enviando, executar } = useEnvio('codigo');

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    void executar(async () => {
      await signIn('password', { email, code: codigo.trim(), flow: 'email-verification' });
    });
  };

  return (
    <form onSubmit={enviar} className="space-y-4">
      <CampoCodigo valor={codigo} aoMudar={setCodigo} />
      <BotaoEnviar enviando={enviando} desligado={codigo.trim().length < 6}>
        Confirmar e entrar
      </BotaoEnviar>
      <p className="text-center text-sm text-muted-foreground">
        Não chegou? Veja a caixa de spam ou{' '}
        <BotaoLink onClick={() => irPara({ tipo: 'entrar' })}>entre de novo</BotaoLink> para receber
        outro código.
      </p>
    </form>
  );
}

function FormEsqueci({ irPara }: { irPara: IrPara }) {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState('');
  const { enviando, executar } = useEnvio('esqueci');

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    void executar(async () => {
      await signIn('password', { email, flow: 'reset' });
      irPara({ tipo: 'nova-senha', email });
    });
  };

  return (
    <form onSubmit={enviar} className="space-y-4">
      <CampoEmail valor={email} aoMudar={setEmail} />
      <BotaoEnviar enviando={enviando}>Receber o código</BotaoEnviar>
      <BotaoLink onClick={() => irPara({ tipo: 'entrar' })}>Voltar para entrar</BotaoLink>
    </form>
  );
}

function FormNovaSenha({ email, irPara }: { email: string; irPara: IrPara }) {
  const { signIn } = useAuthActions();
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const { enviando, executar } = useEnvio('nova-senha');

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    void executar(async () => {
      await signIn('password', {
        email,
        code: codigo.trim(),
        newPassword: senha,
        flow: 'reset-verification',
      });
    });
  };

  return (
    <form onSubmit={enviar} className="space-y-4">
      <CampoCodigo valor={codigo} aoMudar={setCodigo} />
      <CampoSenha
        id="senha-nova"
        rotulo="Senha nova"
        valor={senha}
        aoMudar={setSenha}
        autoComplete="new-password"
        dica={`Pelo menos ${MIN_SENHA} caracteres.`}
      />
      <BotaoEnviar enviando={enviando}>Salvar a senha nova e entrar</BotaoEnviar>
      <BotaoLink onClick={() => irPara({ tipo: 'entrar' })}>Voltar para entrar</BotaoLink>
    </form>
  );
}

function BotaoEnviar({
  enviando,
  desligado = false,
  children,
}: {
  enviando: boolean;
  desligado?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      type="submit"
      variant="principal"
      size="lg"
      className="w-full"
      disabled={enviando || desligado}
    >
      {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  );
}

function CampoEmail({ valor, aoMudar }: { valor: string; aoMudar: (valor: string) => void }) {
  return (
    <div className="space-y-2 text-left">
      <Label htmlFor="email">E-mail</Label>
      <Input
        id="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="voce@hospital.org.br"
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        required
      />
    </div>
  );
}

function CampoSenha({
  id,
  rotulo,
  valor,
  aoMudar,
  autoComplete,
  dica,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  autoComplete: 'current-password' | 'new-password';
  dica?: string;
}) {
  return (
    <div className="space-y-2 text-left">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        type="password"
        autoComplete={autoComplete}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        minLength={autoComplete === 'new-password' ? MIN_SENHA : undefined}
        required
      />
      {dica ? <p className="text-xs text-muted-foreground">{dica}</p> : null}
    </div>
  );
}

function CampoCodigo({ valor, aoMudar }: { valor: string; aoMudar: (valor: string) => void }) {
  return (
    <div className="space-y-2 text-left">
      <Label htmlFor="codigo">Código de 6 números</Label>
      <Input
        id="codigo"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        className="text-center text-lg tracking-[0.4em]"
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value.replace(/\D/g, ''))}
        required
      />
    </div>
  );
}

function BotaoLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-medium text-link underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

/** Only in development and test previews: the emulated Google test accounts and the test inbox. */
function EntrarComGoogleDeTeste() {
  const { signIn } = useAuthActions();
  return (
    <div className="space-y-2 border-t pt-4 text-center">
      <p className="text-xs text-muted-foreground">
        Só no ambiente de teste: os códigos chegam em{' '}
        <a className="underline" href="/dev/inbox">
          /dev/inbox
        </a>
        .
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="button-google-signin"
        onClick={() => {
          void signIn('google', { redirectTo: '/' }).catch(() =>
            toast.error('Não foi possível entrar com a conta de teste.')
          );
        }}
      >
        Entrar com uma conta de teste (Google simulado)
      </Button>
    </div>
  );
}
