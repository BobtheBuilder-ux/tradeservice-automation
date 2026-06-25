import Head from 'next/head';
import Link from 'next/link';

const sections = [
  {
    title: 'What This Policy Covers',
    body: [
      'This Privacy Policy applies to SetMyMeet websites, applications, dashboards, onboarding flows, integrations, AI outreach tools, and related support communications.',
      'The service is intended for business users and authorized representatives who manage leads, campaigns, booking, communication channels, and connected provider accounts.',
    ],
  },
  {
    title: 'Information We Collect',
    groups: [
      {
        label: 'Information you provide',
        items: [
          'Name, email address, phone number, company name, role, and login details.',
          'Tenant profile details such as industry, service area, business hours, booking preferences, sender identity, and AI agent settings.',
          'Lead information uploaded or entered by a tenant, including contact details, service interest, consent status, notes, conversation history, and booking details.',
          'Knowledge base content, files, URLs, prompts, meeting notes, transcripts, and support requests submitted through the platform.',
        ],
      },
      {
        label: 'Information collected automatically',
        items: [
          'Device, browser, IP address, log, diagnostic, performance, and usage information.',
          'Authentication/session events, dashboard activity, function execution metadata, and provider delivery status.',
          'Cookies or similar technologies used for security, session management, analytics, and product improvement.',
        ],
      },
      {
        label: 'Information from connected providers',
        items: [
          'Calendar, booking, email, phone, SMS, WhatsApp, Facebook/Meta, Messenger, Lead Ads, and other provider metadata that tenants choose to connect.',
          'Provider account identifiers, selected Pages, ad accounts, lead forms, message/channel identifiers, delivery events, and webhook metadata.',
        ],
      },
    ],
  },
  {
    title: 'How We Use Information',
    items: [
      'Provide, secure, and improve the SetMyMeet platform.',
      'Authenticate users and resolve tenant access.',
      'Manage tenant settings, AI agents, leads, campaigns, knowledge base content, and booking workflows.',
      'Place calls, send messages, process replies, create bookings, send confirmations and reminders, and maintain lead timelines when tenants enable those workflows.',
      'Connect tenant-owned providers such as Meta/Facebook, Twilio, Calendly, email services, and AI providers.',
      'Generate AI-assisted summaries, replies, lifecycle recommendations, and follow-up drafts under tenant configuration and consent rules.',
      'Detect abuse, enforce opt-outs and do-not-contact states, debug provider failures, and comply with legal obligations.',
    ],
  },
  {
    title: 'Facebook, Meta, And Messenger Data',
    body: [
      'When a tenant connects Meta/Facebook, SetMyMeet uses the tenant-authorized OAuth connection to access only the Pages, ad accounts, lead forms, Messenger channels, and related metadata that the tenant grants.',
      'SetMyMeet does not give tenants access to the platform owner\'s Facebook account. Each tenant connects and controls their own Facebook account and business assets.',
      'Meta access tokens are stored encrypted and are used only for the tenant integration, setup health, lead form intake, Messenger routing, and related tenant-authorized workflows.',
    ],
  },
  {
    title: 'Artificial Intelligence And Automation',
    items: [
      'SetMyMeet uses AI to assist with live voice conversations, text replies, email drafts, intent classification, lead summaries, lifecycle recommendations, and follow-up planning.',
      'AI output is used with platform rules that enforce tenant isolation, consent, opt-outs, do-not-contact status, channel setup, business hours, and booking stop conditions.',
      'Tenants remain responsible for the content they upload, the leads they contact, and the provider accounts they connect.',
    ],
  },
  {
    title: 'When We Share Information',
    body: [
      'We share information only as needed to provide the service, operate tenant-authorized integrations, comply with law, protect the platform, or support the tenant relationship.',
    ],
    items: [
      'Service providers that host, secure, monitor, or support the platform.',
      'Communications and booking providers used by tenant workflows.',
      'AI providers used to generate tenant-authorized voice, text, summary, and classification outputs.',
      'Connected providers such as Meta/Facebook when a tenant authorizes the integration.',
      'Legal, compliance, or safety parties when required by law or necessary to protect rights and security.',
    ],
  },
  {
    title: 'Cookies And Similar Technologies',
    body: [
      'We may use cookies and similar technologies for authentication, session management, security, analytics, and product improvement. Browser settings may allow you to block cookies, but some platform features may not work correctly without them.',
    ],
  },
  {
    title: 'Data Retention',
    body: [
      'We retain information for as long as needed to provide the service, maintain tenant records, satisfy legal or contractual obligations, resolve disputes, enforce agreements, and protect the platform.',
      'When data is no longer required, we delete, archive, or anonymize it according to operational and legal requirements.',
    ],
  },
  {
    title: 'Security',
    body: [
      'We use administrative, technical, and organizational safeguards designed to protect information from unauthorized access, loss, misuse, or alteration. No system is completely risk-free, and users are responsible for protecting their login credentials and provider accounts.',
    ],
  },
  {
    title: 'Your Choices And Rights',
    items: [
      'Request access to information associated with your account or tenant.',
      'Request correction or deletion where applicable.',
      'Disconnect provider integrations such as Meta/Facebook from tenant settings.',
      'Withdraw consent for marketing or certain processing where applicable.',
      'Use opt-out and do-not-contact controls for lead communications.',
    ],
  },
  {
    title: 'International Transfers',
    body: [
      'SetMyMeet may process information in countries where our providers, infrastructure, or support operations are located. We use reasonable safeguards designed to protect information consistent with this Privacy Policy.',
    ],
  },
  {
    title: 'Changes To This Policy',
    body: [
      'We may update this Privacy Policy from time to time. When we make changes, we will update the effective date and post the revised version on this page.',
    ],
  },
];

function BulletList({ items = [] }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm leading-6 text-text-secondary">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <Head>
        <title>Privacy Policy - SetMyMeet</title>
        <meta name="description" content="SetMyMeet Privacy Policy." />
      </Head>

      <main className="min-h-screen bg-background text-text-primary">
        <nav className="border-b border-border bg-surface">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
            <Link href="/login" className="text-sm font-semibold text-text-primary">
              SetMyMeet
            </Link>
            <Link href="/login" className="text-sm text-text-secondary hover:text-text-primary">
              Login
            </Link>
          </div>
        </nav>

        <section className="border-b border-border bg-surface">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
            <p className="text-xs font-medium text-text-muted">Legal</p>
            <h1 className="mt-2 text-2xl font-semibold text-text-primary">Privacy Policy</h1>
            <p className="mt-2 text-sm text-text-secondary">Effective Date: June 25, 2026</p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
          <div className="ops-panel p-4">
            <p className="text-sm leading-6 text-text-secondary">
              This Privacy Policy explains how SetMyMeet collects, uses, protects, and shares information when businesses use our platform for AI-assisted outreach, booking, messaging, lead management, and provider integrations.
            </p>
          </div>

          <div className="space-y-4">
            {sections.map((section, index) => (
              <section key={section.title} className="ops-panel p-4">
                <h2 className="text-sm font-semibold text-text-primary">
                  <span className="mr-2 text-accent">{index + 1}.</span>
                  {section.title}
                </h2>
                {section.body?.map((paragraph) => (
                  <p key={paragraph} className="mt-3 text-sm leading-6 text-text-secondary">
                    {paragraph}
                  </p>
                ))}
                {section.items ? <BulletList items={section.items} /> : null}
                {section.groups?.map((group) => (
                  <div key={group.label} className="mt-4">
                    <p className="text-sm font-semibold text-text-primary">{group.label}</p>
                    <BulletList items={group.items} />
                  </div>
                ))}
              </section>
            ))}
          </div>

          <section className="ops-panel p-4">
            <h2 className="text-sm font-semibold text-text-primary">Contact</h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              To request access, correction, deletion, or privacy support, contact 9QC INC. Privacy Officer at info@9qcinc.com.
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              You may also use the user data deletion page at{' '}
              <Link href="/data-deletion" className="text-accent hover:text-accent-hover">
                /data-deletion
              </Link>
              .
            </p>
          </section>
        </section>
      </main>
    </>
  );
}
