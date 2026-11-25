import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OlharHumanoLogo } from '@/components/olhar-humano-marca';
import { OrganizationContextControl } from '@/components/organization-context-control';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { applyServerErrors, getSubmitErrorMessage, useAppForm } from '@/components/form';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import {
  createOrganizationSchema,
  impersonationSchema,
  provisionUserSchema,
  slugifyOrganizationName,
  type CreateOrganizationValues,
  type ImpersonationValues,
  type ProvisionUserValues,
} from '../../../convex/lib/forms';

function CreateOrganizationForm() {
  const createOrganization = useMutation(api.platform.createOrganization);

  const form = useAppForm<CreateOrganizationValues>({
    defaultValues: {
      name: '',
      slug: '',
    },
    onSubmit: async ({ value }) => {
      try {
        await createOrganization({
          name: value.name,
          slug: value.slug || slugifyOrganizationName(value.name),
        });
        toast.success('Hospital criado');
        form.reset();
      } catch (error) {
        if (!applyServerErrors(form, error)) {
          toast.error(getSubmitErrorMessage(error, 'Não foi possível criar o hospital'));
        }
      }
    },
  });

  const { fields } = form;

  return (
    <form.FormShell className="gap-3">
      <fields.Text
        name="name"
        placeholder="Nome do hospital"
        validation={createOrganizationSchema.shape.name}
        data-testid="input-org-name"
      />
      <fields.Text
        name="slug"
        placeholder="endereço-curto (ex.: ac-camargo)"
        validation={createOrganizationSchema.shape.slug}
        data-testid="input-org-slug"
      />
      <form.SubmitButton data-testid="button-create-org">Criar hospital</form.SubmitButton>
    </form.FormShell>
  );
}

type ProvisionUserFormProps = {
  organizations: Array<{ _id: string; name: string }>;
  defaultOrganizationId: string;
};

function ProvisionUserForm({ organizations, defaultOrganizationId }: ProvisionUserFormProps) {
  const provisionUser = useMutation(api.onboarding.provisionUser);

  const form = useAppForm<ProvisionUserValues>({
    defaultValues: {
      organizationId: defaultOrganizationId,
      email: '',
      role: 'member' as 'admin' | 'member',
      sendInvite: false,
    },
    onSubmit: async ({ value }) => {
      try {
        await provisionUser(value);
        toast.success('Pessoa cadastrada');
        form.setFieldValue('email', '');
      } catch (error) {
        if (!applyServerErrors(form, error)) {
          toast.error(getSubmitErrorMessage(error, 'Não foi possível cadastrar a pessoa'));
        }
      }
    },
  });

  useEffect(() => {
    if (defaultOrganizationId) {
      form.setFieldValue('organizationId', defaultOrganizationId);
    }
  }, [defaultOrganizationId, form]);

  const { fields } = form;

  return (
    <form.FormShell className="gap-3">
      <fields.Select
        name="organizationId"
        validation={provisionUserSchema.shape.organizationId}
        disabled={!organizations.length}
        options={organizations.map((org) => ({ value: org._id, label: org.name }))}
        data-testid="select-provision-org"
      />
      <fields.Text
        name="email"
        placeholder="pessoa@hospital.org.br"
        type="email"
        validation={provisionUserSchema.shape.email}
        data-testid="input-provision-email"
      />
      <fields.Select
        name="role"
        validation={provisionUserSchema.shape.role}
        options={[
          { value: 'admin', label: 'Responsável pela equipe' },
          { value: 'member', label: 'Equipe' },
        ]}
        data-testid="select-provision-role"
      />
      <fields.Checkbox
        name="sendInvite"
        label="Mandar o convite agora"
        validation={provisionUserSchema.shape.sendInvite}
        data-testid="checkbox-send-invite"
      />
      <form.SubmitButton data-testid="button-provision-user">Cadastrar pessoa</form.SubmitButton>
    </form.FormShell>
  );
}

function ImpersonationForm() {
  const startImpersonation = useMutation(api.platform.startImpersonation);

  const form = useAppForm<ImpersonationValues>({
    defaultValues: {
      targetUserId: '',
    },
    onSubmit: async ({ value }) => {
      try {
        await startImpersonation({
          targetUserId: value.targetUserId as Id<'users'>,
        });
        toast.success('Agora você está vendo o site como esta pessoa');
      } catch (error) {
        if (!applyServerErrors(form, error)) {
          toast.error(getSubmitErrorMessage(error, 'Não foi possível entrar como esta pessoa'));
        }
      }
    },
  });

  const { fields } = form;

  return (
    <form.FormShell className="flex-row items-center gap-2">
      <fields.Text
        name="targetUserId"
        placeholder="ID da pessoa"
        className="flex-1"
        validation={impersonationSchema.shape.targetUserId}
        data-testid="input-impersonate-user-id"
      />
      <form.SubmitButton data-testid="button-start-impersonation">
        Ver como esta pessoa
      </form.SubmitButton>
    </form.FormShell>
  );
}

export function PlatformAdminPage() {
  const isPlatformAdmin = useQuery(api.platform.isCurrentUserPlatformAdmin, {});
  const organizations = useQuery(api.tenants.listOrganizations, {});
  const activeOrgId = organizations?.[0]?._id || '';
  const provisioned = useQuery(
    api.onboarding.listOnboardingForOrg,
    activeOrgId ? { organizationId: activeOrgId } : 'skip'
  );
  const users = useQuery(api.users.current, {});
  const sendInvite = useMutation(api.onboarding.sendInvite);

  if (isPlatformAdmin === undefined) {
    return <div className="container p-8">Carregando a administração...</div>;
  }

  if (!isPlatformAdmin) {
    return (
      <div className="container p-8">
        <p>Esta área é só para a administração da plataforma.</p>
        <Link to="/">
          <Button variant="ghost">Voltar para a fila</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <ImpersonationBanner />
      <header className="border-b">
        <div className="container flex items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div className="space-y-2">
            <OlharHumanoLogo />
            <h1 className="font-serif text-xl font-semibold" data-testid="platform-admin-title">
              Administração da plataforma
            </h1>
            <p className="text-sm text-muted-foreground">{users?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <div data-testid="platform-org-switcher">
              <OrganizationContextControl isPlatformAdmin />
            </div>
            <Link to="/">
              <Button variant="outline">Fila</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container grid gap-6 px-4 py-6 md:grid-cols-2 md:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Criar hospital</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateOrganizationForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cadastrar pessoa</CardTitle>
          </CardHeader>
          <CardContent>
            <ProvisionUserForm
              organizations={organizations ?? []}
              defaultOrganizationId={activeOrgId}
            />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Hospitais</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2" data-testid="platform-org-list">
              {(organizations ?? []).map((org) => (
                <li key={org._id} className="rounded-md border px-3 py-2 text-sm">
                  {org.name} <span className="text-muted-foreground">({org.slug})</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Pessoas cadastradas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(provisioned ?? []).map((record) => (
              <div
                key={record.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                data-testid="provisioned-user-row"
              >
                <div>
                  <div>{record.email}</div>
                  <div className="text-muted-foreground">
                    {record.role} · {record.status}
                  </div>
                </div>
                {record.status === 'pending' ? (
                  <Button
                    size="sm"
                    data-testid={`button-send-invite-${record.email}`}
                    onClick={() =>
                      void sendInvite({
                        organizationId: record.organizationId,
                        email: record.email,
                      })
                    }
                  >
                    Mandar convite
                  </Button>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Ver o site como outra pessoa</CardTitle>
          </CardHeader>
          <CardContent>
            <ImpersonationForm />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
