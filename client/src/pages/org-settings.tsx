import { useState, type FormEvent, type ReactNode } from 'react';
import { usePermission } from '@djpanda/convex-tenants/react';
import { useMutation, useQuery } from 'convex/react';
import { MailPlus, RotateCw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell, type Hospital } from '@/components/equipe/app-shell';
import { data, dataHora, mensagemDeErro } from '@/components/equipe/formato';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { FunctionReturnType } from 'convex/server';
import { api } from '../../../convex/_generated/api';

type Papel = 'admin' | 'member';

type PessoaDaEquipe = {
  _id: string;
  userId: string;
  role: string;
  joinedAt?: number;
  user?: { name?: string; email?: string } | null;
};

const ROTULO_PAPEL: Record<Papel, string> = {
  admin: 'Responsável pela equipe',
  member: 'Equipe',
};

function rotuloDoPapel(papel: string) {
  return papel === 'admin' || papel === 'member' ? ROTULO_PAPEL[papel] : papel;
}

function usePodeGerenciar(organizationId: string) {
  return usePermission({
    organizationId,
    permission: 'settings:manage',
    checkPermissionQuery: api.tenants.checkPermission,
  }).allowed;
}

async function executarComAviso(acao: () => Promise<unknown>, sucesso: string) {
  try {
    await acao();
    toast.success(sucesso);
  } catch (erro) {
    toast.error(mensagemDeErro(erro));
  }
}

// ---------------------------------------------------------------------------
// Equipe: people with access, invitations
// ---------------------------------------------------------------------------

export function EquipePage() {
  return (
    <AppShell secao="equipe">
      {(hospital) => (
        <div className="space-y-6">
          <div>
            <h1 className="font-serif text-3xl sm:text-4xl">Equipe</h1>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Quem tem acesso às pacientes do {hospital.nome}. Convide as pessoas pelo e-mail: no
              primeiro acesso, elas criam uma senha.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
            <Pessoas hospital={hospital} />
            <div className="space-y-6">
              <Convidar hospital={hospital} />
              <ConvitesPendentes hospital={hospital} />
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Pessoas({ hospital }: { hospital: Hospital }) {
  const { organizationId } = hospital;
  const resultado = useQuery(api.tenants.listMembers, { organizationId });
  const eu = useQuery(api.tenants.getCurrentMember, { organizationId });
  const podeGerenciar = usePodeGerenciar(organizationId);
  const mudarPapel = useMutation(api.tenants.updateMemberRole);
  const remover = useMutation(api.tenants.removeMember);
  // tenants.listMembers adds { user: { name, email } } to each member (convex/tenants.ts).
  const pessoas = (
    resultado === undefined ? undefined : Array.isArray(resultado) ? resultado : resultado.page
  ) as PessoaDaEquipe[] | undefined;

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Pessoas com acesso</CardTitle>
        <CardDescription>
          &quot;Responsável pela equipe&quot; também convida e remove pessoas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {pessoas === undefined ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : pessoas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém ainda.</p>
        ) : (
          <ul className="divide-y">
            {pessoas.map((pessoa) => {
              const souEu = eu?.userId === pessoa.userId;
              const nome = pessoa.user?.name ?? pessoa.user?.email ?? 'Sem nome';
              return (
                <li key={pessoa._id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {nome}
                      {souEu ? (
                        <span className="ml-2 text-xs text-muted-foreground">(você)</span>
                      ) : null}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {pessoa.user?.email ?? ''}
                      {pessoa.joinedAt ? ` · desde ${data(pessoa.joinedAt)}` : ''}
                    </p>
                  </div>
                  {podeGerenciar && !souEu ? (
                    <>
                      <select
                        aria-label={`Papel de ${nome}`}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                        value={pessoa.role}
                        onChange={(evento) =>
                          void executarComAviso(
                            () =>
                              mudarPapel({
                                organizationId,
                                memberUserId: pessoa.userId,
                                role: evento.target.value,
                              }),
                            'Papel alterado.'
                          )
                        }
                      >
                        <option value="member">{ROTULO_PAPEL.member}</option>
                        <option value="admin">{ROTULO_PAPEL.admin}</option>
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remover ${nome}`}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remover ${nome} da equipe? Ela perde o acesso às pacientes.`
                            )
                          ) {
                            void executarComAviso(
                              () => remover({ organizationId, memberUserId: pessoa.userId }),
                              'Pessoa removida da equipe.'
                            );
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </>
                  ) : (
                    <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium">
                      {rotuloDoPapel(pessoa.role)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Convidar({ hospital }: { hospital: Hospital }) {
  const podeGerenciar = usePodeGerenciar(hospital.organizationId);
  const convidar = useMutation(api.tenants.inviteMember);
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState<Papel>('member');
  const [enviando, setEnviando] = useState(false);
  if (!podeGerenciar) return null;

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setEnviando(true);
    const destino = email.trim().toLowerCase();
    await executarComAviso(
      () =>
        convidar({
          organizationId: hospital.organizationId,
          inviteeIdentifier: destino,
          identifierType: 'email',
          role: papel,
        }),
      `Convite enviado para ${destino}.`
    );
    setEmail('');
    setEnviando(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailPlus className="h-5 w-5" aria-hidden />
          Convidar pessoa
        </CardTitle>
        <CardDescription>Ela recebe um e-mail com o link do convite.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={enviar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="convite-email">E-mail</Label>
            <Input
              id="convite-email"
              type="email"
              placeholder="pessoa@hospital.org.br"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="convite-papel">Papel</Label>
            <select
              id="convite-papel"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={papel}
              onChange={(evento) => setPapel(evento.target.value === 'admin' ? 'admin' : 'member')}
            >
              <option value="member">{ROTULO_PAPEL.member}</option>
              <option value="admin">{ROTULO_PAPEL.admin}</option>
            </select>
          </div>
          <Button type="submit" variant="principal" className="w-full" disabled={enviando}>
            {enviando ? 'Enviando...' : 'Enviar convite'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ConvitesPendentes({ hospital }: { hospital: Hospital }) {
  const { organizationId } = hospital;
  const podeGerenciar = usePodeGerenciar(organizationId);
  const resultado = useQuery(
    api.tenants.listInvitations,
    podeGerenciar ? { organizationId, status: 'pending' } : 'skip'
  );
  const reenviar = useMutation(api.tenants.resendInvitation);
  const cancelar = useMutation(api.tenants.cancelInvitation);
  if (!podeGerenciar) return null;
  const convites =
    resultado === undefined ? undefined : Array.isArray(resultado) ? resultado : resultado.page;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Convites pendentes</CardTitle>
        <CardDescription>Ainda não aceitos.</CardDescription>
      </CardHeader>
      <CardContent>
        {convites === undefined ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : convites.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum convite pendente.</p>
        ) : (
          <ul className="divide-y">
            {convites.map((convite) => (
              <li key={convite._id} className="space-y-2 py-3">
                <div>
                  <p className="truncate text-sm font-medium">{convite.inviteeIdentifier}</p>
                  <p className="text-xs text-muted-foreground">
                    {rotuloDoPapel(convite.role)} ·{' '}
                    {convite.isExpired ? 'vencido' : `vale até ${dataHora(convite.expiresAt)}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void executarComAviso(
                        () => reenviar({ invitationId: convite._id }),
                        'Convite enviado de novo.'
                      )
                    }
                  >
                    <RotateCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Reenviar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void executarComAviso(
                        () => cancelar({ invitationId: convite._id }),
                        'Convite cancelado.'
                      )
                    }
                  >
                    <X className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    Cancelar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Configurações: hospital name and how the WhatsApp triage is set up
// ---------------------------------------------------------------------------

export function ConfiguracoesPage() {
  return (
    <AppShell secao="configuracoes">{(hospital) => <Configuracoes hospital={hospital} />}</AppShell>
  );
}

function Configuracoes({ hospital }: { hospital: Hospital }) {
  const dados = useQuery(api.equipe.configuracoes, { organizationId: hospital.organizationId });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl sm:text-4xl">Configurações</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Como a triagem pelo WhatsApp está montada para o {hospital.nome}.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <NomeDoHospital key={hospital.nome} hospital={hospital} />
        <Bloco titulo="WhatsApp">
          {dados === undefined ? (
            'Carregando...'
          ) : dados.codigoWhatsApp ? (
            <>
              <Linha nome="Código do hospital">{dados.codigoWhatsApp}</Linha>
              <Linha nome="Mensagem do link ou QR code">{dados.mensagemDoLink}</Linha>
              <p className="text-muted-foreground">
                Quem manda essa mensagem fica ligada a este hospital.
              </p>
            </>
          ) : (
            'O hospital ainda não tem código no WhatsApp.'
          )}
        </Bloco>
        <Bloco titulo="Escalas da triagem de entrada">
          {dados === undefined ? (
            'Carregando...'
          ) : dados.protocolo ? (
            <>
              <Linha nome="Protocolo">{dados.protocolo.nome}</Linha>
              <Linha nome="Termômetro de Distresse">{dados.protocolo.etapasDt} etapas</Linha>
              <Linha nome="GAD-7">{dados.protocolo.perguntasGad7} perguntas</Linha>
              <Linha nome="PHQ-9">{dados.protocolo.perguntasPhq9} perguntas</Linha>
              {dados.protocolo.textoOficialPendente ? (
                <p className="rounded-md bg-pessego px-3 py-2 text-laranja-escuro">
                  Os textos oficiais das escalas ainda não foram colados: as perguntas aparecem como
                  &quot;TEXTO OFICIAL PENDENTE&quot;.
                </p>
              ) : null}
            </>
          ) : (
            'Nenhum protocolo publicado: a primeira triagem vai usar o rascunho, com os textos oficiais pendentes.'
          )}
        </Bloco>
        <ExplicacaoListaProblemas
          key={dados?.configuracao.explicacaoListaProblemas ?? ''}
          hospital={hospital}
          texto={dados?.configuracao.explicacaoListaProblemas ?? ''}
          podeEditar={dados?.podeEditar ?? false}
        />
        {dados ? (
          <NotasDeCorte
            key={JSON.stringify(dados.configuracao)}
            hospital={hospital}
            configuracao={dados.configuracao}
            podeEditar={dados.podeEditar}
          />
        ) : null}
        <Bloco titulo="Termo e palavras de risco">
          {dados === undefined ? (
            'Carregando...'
          ) : (
            <>
              <Linha nome="Termo de consentimento">
                {dados.termo
                  ? `versão ${dados.termo.versao}, de ${data(dados.termo.publicadoEm)}`
                  : 'nenhum publicado'}
              </Linha>
              <Linha nome="Palavras de risco">
                {dados.palavrasDeRisco.total}
                {dados.palavrasDeRisco.mais ? '+' : ''} cadastradas
              </Linha>
              <Linha nome="Check-in semanal">segunda-feira, 9h (Brasília)</Linha>
            </>
          )}
        </Bloco>
      </div>
      <p className="text-sm text-muted-foreground">
        Para trocar a escala, o termo ou as palavras de risco, fale com a pessoa técnica do projeto
        (instruções em docs/whatsapp/README.md).
      </p>
    </div>
  );
}

function NomeDoHospital({ hospital }: { hospital: Hospital }) {
  const podeGerenciar = usePodeGerenciar(hospital.organizationId);
  const atualizar = useMutation(api.tenants.updateOrganization);
  const [nome, setNome] = useState(hospital.nome);
  const [salvando, setSalvando] = useState(false);

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    await executarComAviso(
      () => atualizar({ organizationId: hospital.organizationId, name: nome.trim() }),
      'Nome do hospital salvo.'
    );
    setSalvando(false);
  };

  return (
    <Bloco titulo="Hospital">
      {podeGerenciar ? (
        <form onSubmit={enviar} className="space-y-3">
          <Label htmlFor="nome-hospital">Nome do hospital</Label>
          <div className="flex gap-2">
            <Input
              id="nome-hospital"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
              required
            />
            <Button
              type="submit"
              variant="principal"
              disabled={salvando || !nome.trim() || nome.trim() === hospital.nome}
            >
              Salvar
            </Button>
          </div>
        </form>
      ) : (
        <Linha nome="Nome do hospital">{hospital.nome}</Linha>
      )}
    </Bloco>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">{children}</CardContent>
    </Card>
  );
}

function Linha({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <p className="flex flex-wrap justify-between gap-x-4 gap-y-1">
      <span className="text-muted-foreground">{nome}</span>
      <span className="text-right font-medium">{children}</span>
    </p>
  );
}

/** Text the bot sends before the first DT problem category (editable by the team manager). */
function ExplicacaoListaProblemas({
  hospital,
  texto,
  podeEditar,
}: {
  hospital: Hospital;
  texto: string;
  podeEditar: boolean;
}) {
  const salvar = useMutation(api.equipe.salvarConfiguracoes);
  const [valor, setValor] = useState(texto);
  const [salvando, setSalvando] = useState(false);
  return (
    <Bloco titulo="Explicação da lista de problemas (DT)">
      <p className="text-muted-foreground">
        O robô manda este texto antes do primeiro grupo de problemas. Proposta inicial, para as
        psicólogas revisarem.
      </p>
      {podeEditar ? (
        <form
          className="space-y-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            setSalvando(true);
            void executarComAviso(
              () =>
                salvar({
                  organizationId: hospital.organizationId,
                  explicacaoListaProblemas: valor,
                }),
              'Texto salvo.'
            ).finally(() => setSalvando(false));
          }}
        >
          <Textarea
            aria-label="Explicação da lista de problemas"
            rows={9}
            value={valor}
            onChange={(evento) => setValor(evento.target.value)}
          />
          <Button type="submit" disabled={salvando || !valor.trim() || valor === texto}>
            Salvar texto
          </Button>
        </form>
      ) : (
        <p className="whitespace-pre-wrap rounded-md border p-3">{texto}</p>
      )}
    </Bloco>
  );
}

type ConfiguracaoTela = FunctionReturnType<typeof api.equipe.configuracoes>['configuracao'];

/** Cut-off scores, the (provisional) priority rule and the sequence of the scales. */
function NotasDeCorte({
  hospital,
  configuracao,
  podeEditar,
}: {
  hospital: Hospital;
  configuracao: ConfiguracaoTela;
  podeEditar: boolean;
}) {
  const salvar = useMutation(api.equipe.salvarConfiguracoes);
  const [cortes, setCortes] = useState(configuracao.cortes);
  const [regra, setRegra] = useState(configuracao.regra);
  const [somenteAcima, setSomenteAcima] = useState(configuracao.gadPhqSomenteAcimaDoCorteDT);
  const [salvando, setSalvando] = useState(false);

  const numero = (
    valor: number,
    aoMudar: (novo: number) => void,
    maximo: number,
    rotulo: string
  ) => (
    <Input
      type="number"
      min={0}
      max={maximo}
      step={1}
      aria-label={rotulo}
      className="h-8 w-20"
      disabled={!podeEditar}
      value={valor}
      onChange={(evento) => aoMudar(Number(evento.target.value))}
    />
  );
  const caixa = (marcada: boolean, aoMudar: (nova: boolean) => void, rotulo: string) => (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        className="h-4 w-4 accent-[hsl(var(--roxo))]"
        disabled={!podeEditar}
        checked={marcada}
        onChange={(evento) => aoMudar(evento.target.checked)}
      />
      {rotulo}
    </label>
  );

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    void executarComAviso(
      () =>
        salvar({
          organizationId: hospital.organizationId,
          cortes,
          regra,
          gadPhqSomenteAcimaDoCorteDT: somenteAcima,
        }),
      'Notas de corte e regra salvas.'
    ).finally(() => setSalvando(false));
  };

  return (
    <Bloco titulo="Notas de corte e prioridade">
      <form onSubmit={enviar} className="space-y-4">
        <div className="space-y-2">
          <p className="font-semibold">Notas de corte</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Termômetro de Distresse (manual)</span>
            {numero(cortes.dt, (dt) => setCortes({ ...cortes, dt }), 10, 'Corte da DT')}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>GAD-7 {cortes.gad7Confirmado ? '' : '(a confirmar com as psicólogas)'}</span>
            {numero(cortes.gad7, (gad7) => setCortes({ ...cortes, gad7 }), 21, 'Corte do GAD-7')}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>PHQ-9 {cortes.phq9Confirmado ? '' : '(a confirmar com as psicólogas)'}</span>
            {numero(cortes.phq9, (phq9) => setCortes({ ...cortes, phq9 }), 27, 'Corte do PHQ-9')}
          </div>
          {podeEditar ? (
            <div className="flex flex-wrap gap-4 text-muted-foreground">
              {caixa(
                cortes.gad7Confirmado,
                (v) => setCortes({ ...cortes, gad7Confirmado: v }),
                'Corte do GAD-7 confirmado'
              )}
              {caixa(
                cortes.phq9Confirmado,
                (v) => setCortes({ ...cortes, phq9Confirmado: v }),
                'Corte do PHQ-9 confirmado'
              )}
            </div>
          ) : null}
        </div>

        <div className="space-y-2 border-t pt-3">
          <p className="font-semibold">
            Regra de prioridade {regra.provisoria ? '(PROVISÓRIA)' : ''}
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              Urgente: pergunta 9 do PHQ-9 diferente de &quot;Nenhuma vez&quot;, ou palavra de
              risco.
            </li>
            <li className="flex flex-wrap items-center gap-2">
              Alta: GAD-7 a partir de
              {numero(
                regra.altaGad7AoMenos,
                (n) => setRegra({ ...regra, altaGad7AoMenos: n }),
                21,
                'GAD-7 para alta'
              )}
              ou PHQ-9 a partir de
              {numero(
                regra.altaPhq9AoMenos,
                (n) => setRegra({ ...regra, altaPhq9AoMenos: n }),
                27,
                'PHQ-9 para alta'
              )}
            </li>
            <li>
              {caixa(
                regra.altaSeTresAcimaDoCorte,
                (v) => setRegra({ ...regra, altaSeTresAcimaDoCorte: v }),
                'Também alta: as 3 escalas acima do corte'
              )}
            </li>
            <li>Moderada: qualquer escala acima do corte.</li>
            <li>Baixa: tudo abaixo dos cortes (só aviso, sem caso).</li>
          </ul>
          {podeEditar
            ? caixa(
                regra.provisoria,
                (v) => setRegra({ ...regra, provisoria: v }),
                'Regra ainda provisória'
              )
            : null}
        </div>

        <div className="space-y-2 border-t pt-3">
          <p className="font-semibold">Ordem das escalas</p>
          {caixa(
            somenteAcima,
            setSomenteAcima,
            'GAD-7 e PHQ-9 só para quem tiver a DT acima do corte'
          )}
          {somenteAcima ? (
            <p className="rounded-md bg-pessego px-3 py-2 text-laranja-escuro">
              Atenção: quem tiver a DT abaixo de {cortes.dt} não responde a pergunta 9 do PHQ-9 (a
              do risco).
            </p>
          ) : null}
        </div>

        {podeEditar ? (
          <Button type="submit" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar notas e regra'}
          </Button>
        ) : (
          <p className="text-muted-foreground">Só a pessoa responsável pela equipe pode mudar.</p>
        )}
      </form>
    </Bloco>
  );
}

// Route components (the addresses stay the same).
export const OrgSettingsMembersPage = EquipePage;
export const OrgSettingsTeamsPage = EquipePage;
export const OrgSettingsOrgPage = ConfiguracoesPage;
