import Head from 'next/head';
import Link from 'next/link';

const sections = [
  {
    title: 'Acceptance Of These Terms',
    body: [
      'These Terms of Service govern access to and use of SetMyMeet websites, applications, dashboards, AI outreach tools, integrations, support, and related services.',
      'By creating an account, connecting a provider, inviting a user, or using SetMyMeet, you confirm that you are authorized to accept these Terms for yourself or the business you represent.',
    ],
  },
  {
    title: 'Business Accounts And Tenant Access',
    items: [
      'SetMyMeet is intended for business use by authorized tenant owners, admins, agents, and invited team members.',
      'You are responsible for keeping account credentials secure and for all activity performed through your tenant account.',
      'You must provide accurate account, company, billing, contact, sender, booking, and provider setup information.',
      'Tenant admins are responsible for assigning user permissions and removing access when a team member no longer needs it.',
    ],
  },
  {
    title: 'Your Leads, Content, And Instructions',
    body: [
      'You retain responsibility for lead lists, messages, scripts, prompts, files, knowledge base content, booking rules, business details, and other content you upload or configure in SetMyMeet.',
    ],
    items: [
      'You must have the rights and permissions needed to upload, process, contact, and use the leads and content you provide.',
      'You must keep lead consent, opt-out, do-not-contact, and suppression information accurate.',
      'You must review automation settings, AI agent instructions, connected channels, and booking rules before using them with live leads.',
    ],
  },
  {
    title: 'Communications And Compliance',
    body: [
      'SetMyMeet helps tenants place calls, send messages, send emails, route replies, qualify leads, and book meetings when those workflows are enabled.',
    ],
    items: [
      'You are responsible for complying with calling, SMS, WhatsApp, Messenger, email, advertising, privacy, consent, and anti-spam laws that apply to your business and your leads.',
      'You may not use SetMyMeet to contact people without a lawful basis, ignore opt-outs, misrepresent your identity, send deceptive content, or bypass provider rules.',
      'SetMyMeet may pause, block, throttle, or refuse communications that appear unsafe, unlawful, abusive, misconfigured, or likely to harm platform deliverability.',
    ],
  },
  {
    title: 'Facebook, Meta, And Provider Integrations',
    items: [
      'You may connect third-party providers such as Meta/Facebook, Messenger, Twilio, Calendly, email services, AI providers, and other tools supported by SetMyMeet.',
      'You are responsible for the provider accounts and business assets you connect, including Pages, ad accounts, lead forms, phone numbers, calendars, sender identities, and API permissions.',
      'SetMyMeet uses provider access only to operate tenant-authorized workflows and does not give one tenant access to another tenant account or to the platform owner\'s Facebook account.',
      'Third-party providers may change features, permissions, review requirements, prices, rate limits, or policies, and those changes may affect SetMyMeet functionality.',
    ],
  },
  {
    title: 'Artificial Intelligence And Automation',
    body: [
      'SetMyMeet uses AI and automation to assist with outreach, lead qualification, conversation handling, summaries, suggested replies, lifecycle recommendations, and booking workflows.',
    ],
    items: [
      'AI output may be incomplete, incorrect, delayed, or unsuitable for a particular lead or situation.',
      'You are responsible for configuring AI instructions, reviewing important outputs, and deciding when human review is required.',
      'You may not use AI features to generate unlawful, deceptive, discriminatory, harassing, or harmful content.',
      'SetMyMeet may apply safety rules, consent checks, provider setup checks, opt-out handling, and human-review stops before automation continues.',
    ],
  },
  {
    title: 'Acceptable Use',
    items: [
      'Do not access SetMyMeet in a way that disrupts, damages, overloads, scans, reverse engineers, or interferes with the platform.',
      'Do not upload malware, unlawful content, sensitive data you are not authorized to process, or content that infringes another party\'s rights.',
      'Do not resell, sublicense, or provide unauthorized access to SetMyMeet unless agreed in writing.',
      'Do not use SetMyMeet to build competing services by copying private platform behavior, workflows, or non-public materials.',
    ],
  },
  {
    title: 'Service Changes, Availability, And Support',
    body: [
      'We may update, improve, suspend, or discontinue parts of SetMyMeet from time to time. We work to keep the platform reliable, but we do not guarantee uninterrupted or error-free operation.',
      'Support availability, response times, onboarding help, provider setup help, and custom configuration may depend on your plan or written agreement.',
    ],
  },
  {
    title: 'Fees And Billing',
    body: [
      'If your tenant uses a paid plan, you agree to pay the fees, usage charges, taxes, and other amounts described in the applicable order, invoice, checkout, subscription, or written agreement.',
      'Unless stated otherwise, fees are non-refundable except where required by law or agreed in writing. Provider charges, carrier charges, AI usage, messaging, calling, and email costs may be billed separately or passed through depending on your setup.',
    ],
  },
  {
    title: 'Privacy And Data Deletion',
    body: [
      'Our Privacy Policy explains how SetMyMeet collects, uses, protects, and shares information. User data deletion instructions are available separately for account, tenant, lead, and connected integration data.',
    ],
    links: [
      { href: '/privacy', label: 'Privacy Policy' },
      { href: '/data-deletion', label: 'User Data Deletion' },
    ],
  },
  {
    title: 'Intellectual Property',
    body: [
      'SetMyMeet, including the platform, software, workflows, interfaces, documentation, designs, and non-public service materials, is owned by 9QC INC. or its licensors.',
      'You keep ownership of your tenant content, subject to the rights needed for SetMyMeet to host, process, secure, transmit, and operate that content for the service.',
    ],
  },
  {
    title: 'Suspension And Termination',
    items: [
      'You may stop using SetMyMeet at any time, subject to any active subscription or written agreement.',
      'We may suspend or terminate access if you violate these Terms, create security or compliance risk, fail to pay required fees, misuse providers, or use the platform in a harmful way.',
      'After termination, we may retain or delete information according to the Privacy Policy, legal obligations, security needs, and operational requirements.',
    ],
  },
  {
    title: 'Disclaimers And Liability',
    body: [
      'SetMyMeet is provided on an as-is and as-available basis to the fullest extent permitted by law. We disclaim warranties that the service will be uninterrupted, error-free, or meet every business outcome.',
      'To the fullest extent permitted by law, 9QC INC. will not be liable for indirect, incidental, special, consequential, exemplary, punitive, or lost-profit damages arising from use of SetMyMeet.',
    ],
  },
  {
    title: 'Governing Law And Changes',
    body: [
      'These Terms are governed by the laws applicable in Quebec, Canada, unless a written agreement states otherwise.',
      'We may update these Terms from time to time. When we make changes, we will update the effective date and post the revised version on this page.',
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

export default function TermsPage() {
  return (
    <>
      <Head>
        <title>Terms of Service - SetMyMeet</title>
        <meta name="description" content="SetMyMeet Terms of Service." />
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
            <h1 className="mt-2 text-2xl font-semibold text-text-primary">Terms of Service</h1>
            <p className="mt-2 text-sm text-text-secondary">Effective Date: June 25, 2026</p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
          <div className="ops-panel p-4">
            <p className="text-sm leading-6 text-text-secondary">
              These Terms describe the rules for using SetMyMeet, a business platform for AI-assisted outreach, booking, lead management, messaging, and provider integrations.
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
                {section.links ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {section.links.map((link) => (
                      <Link key={link.href} href={link.href} className="ops-button-secondary inline-flex">
                        {link.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>

          <section className="ops-panel p-4">
            <h2 className="text-sm font-semibold text-text-primary">Contact</h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              Questions about these Terms can be sent to 9QC INC. at info@9qcinc.com.
            </p>
          </section>
        </section>
      </main>
    </>
  );
}
