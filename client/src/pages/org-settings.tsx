import { Link } from '@tanstack/react-router';
import { MembersSection, OrgSettingsPanel, TeamsSection } from '@djpanda/convex-tenants/react';
import { AppShell } from '@/components/equipe/app-shell';
import { Button } from '@/components/ui/button';

type SettingsSection = 'members' | 'teams' | 'org';

function SettingsNav({ section }: { section: SettingsSection }) {
  const links: Array<{ to: string; label: string; id: SettingsSection }> = [
    { to: '/settings/members', label: 'Pessoas', id: 'members' },
    { to: '/settings/teams', label: 'Grupos', id: 'teams' },
    { to: '/settings/org', label: 'Hospital', id: 'org' },
  ];

  return (
    <nav className="flex flex-wrap gap-1 border-b pb-3" aria-label="Seções da equipe">
      {links.map((link) => (
        <Link key={link.id} to={link.to}>
          <Button variant={section === link.id ? 'secondary' : 'ghost'} size="sm">
            {link.label}
          </Button>
        </Link>
      ))}
    </nav>
  );
}

export function OrgSettingsPage({ section }: { section: SettingsSection }) {
  return (
    <AppShell secao="equipe">
      {(hospital) => (
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl sm:text-4xl">Equipe</h1>
            <p className="mt-1 text-muted-foreground">
              Quem tem acesso às pacientes de {hospital.nome}. Convide as pessoas da equipe por
              aqui.
            </p>
          </div>
          <SettingsNav section={section} />
          {section === 'members' ? <MembersSection /> : null}
          {section === 'teams' ? <TeamsSection /> : null}
          {section === 'org' ? <OrgSettingsPanel /> : null}
        </div>
      )}
    </AppShell>
  );
}

export function OrgSettingsMembersPage() {
  return <OrgSettingsPage section="members" />;
}

export function OrgSettingsTeamsPage() {
  return <OrgSettingsPage section="teams" />;
}

export function OrgSettingsOrgPage() {
  return <OrgSettingsPage section="org" />;
}
