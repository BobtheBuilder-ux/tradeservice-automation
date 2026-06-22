import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Activity,
  BarChart3,
  BookOpen,
  Building2,
  HeartPulse,
  Lock,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import { getCurrentPlatformAdminProfile } from '../lib/insforge-product';
import { signOut, useAuth } from '../lib/auth';

const NAV_ITEMS = [
  { href: '/overview', label: 'Overview', icon: BarChart3 },
  { href: '/tenants', label: 'Tenants', icon: Building2 },
  { href: '/tenant-setup', label: 'Tenant Setup', icon: UserCog },
  { href: '/knowledge-library', label: 'Knowledge Library', icon: BookOpen },
  { href: '/provider-health', label: 'Provider Health', icon: HeartPulse },
  { href: '/usage-billing', label: 'Usage & Billing', icon: Activity },
  { href: '/audit-logs', label: 'Audit Logs', icon: ShieldCheck },
  { href: '/security', label: 'Security', icon: Lock },
];

export default function SuperAdminShell({ title, description, children }) {
  const router = useRouter();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (authLoading) return;
      if (!isAuthenticated) {
        router.replace('/login');
        return;
      }

      try {
        const nextProfile = await getCurrentPlatformAdminProfile();
        if (cancelled) return;
        if (!nextProfile?.isPlatformAdmin) {
          router.replace('/admin-dashboard');
          return;
        }
        setProfile(nextProfile);
      } catch (error) {
        console.error('Platform admin profile check failed:', error);
        if (!cancelled) router.replace('/admin-dashboard');
        return;
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, router]);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  if (loading || authLoading || !profile?.isPlatformAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-text-muted">
        Loading platform dashboard...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-border bg-surface px-4 py-5 lg:flex lg:flex-col">
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">SetMyMeet</p>
              <p className="text-xs text-text-muted">Super Admin</p>
            </div>
          </div>

          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = router.pathname === item.href;
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => router.push(item.href)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto rounded-lg border border-border bg-surface-secondary p-3">
            <p className="text-sm font-semibold text-text-primary">{profile.role?.replace(/_/g, ' ') || 'super admin'}</p>
            <p className="mt-1 truncate text-xs text-text-muted">{user?.email || user?.name}</p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="border-b border-border bg-surface">
            <div className="flex min-h-20 flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
                <p className="mt-1 text-sm text-text-muted">{description}</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  <input
                    type="search"
                    className="ops-input pl-9 sm:w-80"
                    placeholder="Search tenants, providers, audits..."
                  />
                </div>
                <button type="button" onClick={handleSignOut} className="ops-button-secondary">
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto border-t border-border px-4 py-3 sm:px-6 lg:hidden">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = router.pathname === item.href;
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => router.push(item.href)}
                    className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium ${
                      active ? 'bg-accent text-accent-foreground' : 'bg-surface-secondary text-text-secondary'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </header>

          <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
