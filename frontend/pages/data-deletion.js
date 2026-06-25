import Head from 'next/head';
import Link from 'next/link';

export default function DataDeletionPage() {
  return (
    <>
      <Head>
        <title>User Data Deletion - SetMyMeet</title>
        <meta name="description" content="How to request deletion of SetMyMeet account and integration data." />
      </Head>

      <main className="min-h-screen bg-background px-4 py-8 text-text-primary sm:px-6">
        <section className="mx-auto max-w-3xl space-y-6">
          <header className="space-y-2">
            <p className="text-xs font-medium text-text-muted">SetMyMeet</p>
            <h1 className="text-2xl font-semibold text-text-primary">User Data Deletion</h1>
            <p className="text-sm text-text-secondary">
              Use this page to request removal of account, tenant, lead, and connected integration data associated with SetMyMeet.
            </p>
          </header>

          <section className="ops-panel p-4">
            <h2 className="text-sm font-semibold text-text-primary">Request Deletion</h2>
            <div className="mt-3 space-y-3 text-sm text-text-secondary">
              <p>
                Send a deletion request to the SetMyMeet support contact used for your account. Include your name,
                company name, login email, and the connected Facebook Page or business account you want removed.
              </p>
              <p>
                We will verify the requester before deleting or anonymizing tenant-owned records that are no longer
                needed for legal, billing, security, or abuse-prevention purposes.
              </p>
            </div>
          </section>

          <section className="ops-panel p-4">
            <h2 className="text-sm font-semibold text-text-primary">Facebook And Meta Data</h2>
            <div className="mt-3 space-y-3 text-sm text-text-secondary">
              <p>
                If you connected Facebook or Meta, disconnect it from Settings first when possible. You can also remove
                SetMyMeet from your Facebook account's business integration settings.
              </p>
              <p>
                After deletion is approved, SetMyMeet removes stored Meta connection records and encrypted access tokens
                for the tenant connection.
              </p>
            </div>
          </section>

          <section className="ops-panel p-4">
            <h2 className="text-sm font-semibold text-text-primary">Status Updates</h2>
            <p className="mt-3 text-sm text-text-secondary">
              We will confirm receipt and completion through the email address associated with your account.
            </p>
          </section>

          <Link href="/login" className="ops-button-secondary inline-flex">
            Return to login
          </Link>
        </section>
      </main>
    </>
  );
}
