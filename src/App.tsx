import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LogIn,
  LogOut,
  MapPin,
  Search,
  ShieldCheck,
  Store,
} from 'lucide-react';
import { api, getStoredToken, setStoredToken } from './lib/api';
import type { PublicUser, UserRole } from './lib/pharmaLogic';
import { AuthPortal } from './components/AuthPortal';
import { ManufacturerDashboard } from './components/ManufacturerDashboard';
import { PharmaAiWidget } from './components/PharmaAiWidget';
import { PharmacyDashboard } from './components/PharmacyDashboard';
import { PublicPortal, type PublicTab } from './components/PublicPortal';
import { RegulatorDashboard } from './components/RegulatorDashboard';

type ActiveView =
  | { kind: 'landing' }
  | { kind: 'public' }
  | { kind: 'auth'; mode: 'login' | 'register'; role?: UserRole }
  | { kind: 'dashboard' };

function MediNaPillLogo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const boxClass = size === 'sm' ? 'h-8 w-8 rounded-lg' : 'h-9 w-9 rounded-xl';
  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <span
      className={`inline-flex ${boxClass} items-center justify-center bg-gradient-to-br from-[#2DD4BF] to-[#0891B2] text-white shadow-sm shrink-0`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={iconSize}
      >
        <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
        <path d="m8.5 8.5 7 7" />
      </svg>
    </span>
  );
}

export default function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState<ActiveView>({ kind: 'landing' });
  const [publicTab, setPublicTab] = useState<PublicTab>('verify');

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthChecked(true);
      return;
    }
    api
      .me()
      .then((res) => {
        setUser(res.user);
        setView({ kind: 'dashboard' });
      })
      .catch(() => {
        setStoredToken(null);
        setUser(null);
      })
      .finally(() => {
        setAuthChecked(true);
      });
  }, []);

  function handleAuthenticated(loggedInUser: PublicUser) {
    setUser(loggedInUser);
    setView({ kind: 'dashboard' });
  }

  function handleLogout() {
    setStoredToken(null);
    setUser(null);
    setView({ kind: 'landing' });
  }

  function openPublicPortal(tab: PublicTab = 'verify') {
    setPublicTab(tab);
    setView({ kind: 'public' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openAuth(mode: 'login' | 'register' = 'login', role?: UserRole) {
    setView({ kind: 'auth', mode, role });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#062C30] text-teal-100 text-sm">
        Initializing MediNa - PharmaTrack...
      </div>
    );
  }

  if (view.kind === 'landing') {
    const features: Array<{
      id: PublicTab;
      title: string;
      description: string;
      icon: typeof Search;
    }> = [
      {
        id: 'stock',
        title: 'Search Medicine',
        description:
          'Find available medicine stock across all registered pharmacies by drug group.',
        icon: Search,
      },
      {
        id: 'verify',
        title: 'Verify Authenticity',
        description:
          'Check if a medicine is authentic by entering its batch number and see live stock.',
        icon: ShieldCheck,
      },
      {
        id: 'near-me',
        title: 'Pharmacy Near Me',
        description:
          'Browse nearby pharmacies by area with full details, contacts, and Google Maps links.',
        icon: MapPin,
      },
      {
        id: 'profiles',
        title: 'Pharmacy Profiles',
        description:
          'View owner details, addresses, and contact info for every registered pharmacy.',
        icon: Store,
      },
    ];

    return (
      <div className="min-h-screen flex flex-col bg-white text-slate-900">
        {/* Top Dark Teal Gradient Navbar + Hero Section */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#062C30] via-[#0B464C] to-[#0A3A3E] text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(45,212,191,0.14),transparent_60%)]"
          />

          {/* Minimalist Navbar */}
          <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-8 py-5">
            <button
              type="button"
              onClick={() => setView({ kind: 'landing' })}
              className="inline-flex items-center gap-2.5 text-lg font-bold tracking-tight text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 rounded-lg"
            >
              <MediNaPillLogo size="md" />
              <span className="font-display">MediNa</span>
            </button>

            {user && (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setView({ kind: 'dashboard' })}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 transition-all whitespace-nowrap"
                >
                  Dashboard ({user.role})
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/5 px-3.5 py-2 text-sm font-medium text-white hover:bg-white/15 transition-all whitespace-nowrap"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign Out
                </button>
              </div>
            )}
          </header>

          {/* Hero Section */}
          <section className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 pt-7 pb-14 sm:pt-9 sm:pb-16 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/35 bg-teal-500/15 px-4 py-1.5 text-xs font-medium text-teal-200">
              <CheckCircle2 className="h-3.5 w-3.5 text-teal-300" aria-hidden="true" />
              <span>Trusted Medicine Management &amp; Tracking</span>
            </div>

            <h1 className="mt-6 font-display text-4xl sm:text-5xl lg:text-[54px] font-bold tracking-tight text-white leading-[1.1]">
              MediNa Web App
            </h1>

            <p className="mt-3 text-lg sm:text-xl font-semibold text-[#2DD4BF]">
              Powered by PharmaTrack
            </p>

            <p className="mx-auto mt-4 max-w-2xl text-sm sm:text-base text-slate-200/90 leading-relaxed">
              Search medicine availability, verify drug authenticity by batch number, find nearby
              pharmacies, and manage production and sales — all in one platform.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
              <button
                type="button"
                onClick={() => openPublicPortal('verify')}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#0891B2] to-[#0D9488] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-950/30 hover:from-[#0E7490] hover:to-[#0F766E] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 transition-all whitespace-nowrap"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                <span>Enter Public Portal</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => (user ? setView({ kind: 'dashboard' }) : openAuth('login'))}
                className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 transition-all whitespace-nowrap"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                <span>{user ? 'Go to Dashboard' : 'Login'}</span>
              </button>
            </div>
          </section>
        </div>

        {/* Lower White Feature Section */}
        <section className="flex-1 bg-white py-11 sm:py-12 px-4 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                Everything You Need in One Portal
              </h2>
              <p className="mt-2.5 text-sm sm:text-base text-slate-500">
                The public customer portal gives you instant access to medicine information and
                pharmacy details.
              </p>
            </div>

            <div className="mt-9 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <button
                    key={feature.id}
                    type="button"
                    onClick={() => openPublicPortal(feature.id)}
                    className="group rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm hover:border-teal-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30 transition-all flex flex-col items-start"
                  >
                    <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-[#0D9488] group-hover:bg-teal-100/80 transition-colors">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <h3 className="text-base font-semibold tracking-tight text-slate-900">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-slate-500 leading-relaxed">
                      {feature.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <footer className="border-t border-slate-200/80 bg-white no-print">
          <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-2 px-4 sm:px-6 pt-4 pb-20 sm:py-5 sm:pr-44 text-xs text-slate-500">
            <span>MediNa - PharmaTrack · Supply Chain Traceability &amp; DGDA Compliance</span>
            <div className="flex items-center gap-5">
              <button
                type="button"
                onClick={() => openPublicPortal('report')}
                className="hover:text-slate-900 transition-colors"
              >
                File or Track Complaint
              </button>
              <button
                type="button"
                onClick={() => openAuth('register')}
                className="hover:text-slate-900 transition-colors"
              >
                Register Partner Account
              </button>
            </div>
          </div>
        </footer>

        <PharmaAiWidget />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-50/60 via-slate-50 to-slate-50 text-slate-900">
      {/* Sticky Top Header for Public Portal, Auth & Dashboards */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-md no-print">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 py-3">
          <button
            type="button"
            onClick={() => setView({ kind: 'landing' })}
            className="inline-flex items-center gap-2.5 text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/20 rounded-lg"
          >
            <MediNaPillLogo size="sm" />
            <span className="font-display">MediNa</span>
            <span className="hidden sm:inline text-xs font-medium text-[#0F766E]">
              PharmaTrack
            </span>
          </button>

          {view.kind !== 'auth' && (
            <nav
              aria-label="Primary navigation"
              className="hidden lg:flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 text-xs font-medium"
            >
            <button
              type="button"
              onClick={() => openPublicPortal('verify')}
              className={`rounded-lg px-3 py-1.5 transition-all whitespace-nowrap shrink-0 ${
                view.kind === 'public' && publicTab === 'verify'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Verify Authenticity
            </button>
            <button
              type="button"
              onClick={() => openPublicPortal('stock')}
              className={`rounded-lg px-3 py-1.5 transition-all whitespace-nowrap shrink-0 ${
                view.kind === 'public' && publicTab === 'stock'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Search Medicine
            </button>
            <button
              type="button"
              onClick={() => openPublicPortal('near-me')}
              className={`rounded-lg px-3 py-1.5 transition-all whitespace-nowrap shrink-0 ${
                view.kind === 'public' && publicTab === 'near-me'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pharmacy Near Me
            </button>
            <button
              type="button"
              onClick={() => openPublicPortal('profiles')}
              className={`rounded-lg px-3 py-1.5 transition-all whitespace-nowrap shrink-0 ${
                view.kind === 'public' && publicTab === 'profiles'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pharmacy Profiles
            </button>
            <button
              type="button"
              onClick={() => openPublicPortal('report')}
              className={`rounded-lg px-3 py-1.5 transition-all whitespace-nowrap shrink-0 ${
                view.kind === 'public' && publicTab === 'report'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Report &amp; Track
            </button>
            {user && (
              <button
                type="button"
                onClick={() => setView({ kind: 'dashboard' })}
                className={`rounded-lg px-3 py-1.5 transition-all whitespace-nowrap shrink-0 ${
                  view.kind === 'dashboard'
                    ? 'bg-white text-[#0F766E] shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Dashboard
              </button>
            )}
          </nav>
          )}

          <div className="flex items-center gap-2.5 shrink-0">
            {user ? (
              <>
                {view.kind !== 'dashboard' && (
                  <button
                    type="button"
                    onClick={() => setView({ kind: 'dashboard' })}
                    className="hidden sm:inline-flex items-center rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-[#0F766E] hover:bg-teal-100 transition-all whitespace-nowrap"
                  >
                    Dashboard
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all whitespace-nowrap shrink-0"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : view.kind === 'auth' ? (
              <button
                type="button"
                onClick={() => setView({ kind: 'landing' })}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 shadow-2xs hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>Back</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuth('login')}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-[#115E59] focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all whitespace-nowrap shrink-0"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                <span>Login</span>
              </button>
            )}
          </div>
        </div>

        {user && (
          <div className="flex lg:hidden items-center justify-center gap-2 border-t border-slate-200/70 bg-slate-50/90 px-4 py-1.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setView({ kind: 'dashboard' })}
              className={`rounded-lg px-3 py-1 transition-colors ${
                view.kind === 'dashboard'
                  ? 'bg-white text-[#0F766E] font-semibold shadow-2xs'
                  : 'text-slate-600'
              }`}
            >
              Dashboard ({user.role})
            </button>
            <button
              type="button"
              onClick={() => openPublicPortal('verify')}
              className={`rounded-lg px-3 py-1 transition-colors ${
                view.kind === 'public'
                  ? 'bg-white text-[#0F766E] font-semibold shadow-2xs'
                  : 'text-slate-600'
              }`}
            >
              Public Portal
            </button>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-8 sm:py-10">
        {view.kind === 'auth' ? (
          <AuthPortal
            initialMode={view.mode}
            initialRole={view.role}
            onAuthenticated={handleAuthenticated}
          />
        ) : view.kind === 'dashboard' && user ? (
          user.role === 'Company' ? (
            <ManufacturerDashboard user={user} />
          ) : user.role === 'Pharmacy' ? (
            <PharmacyDashboard user={user} />
          ) : (
            <RegulatorDashboard user={user} />
          )
        ) : (
          <PublicPortal
            activeTab={publicTab}
            onTabChange={setPublicTab}
            onOpenAuth={(mode) => openAuth(mode)}
            onBackHome={() => setView({ kind: 'landing' })}
          />
        )}
      </main>

      <footer className="border-t border-slate-200/80 bg-white/80 backdrop-blur-xs no-print">
        <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-2 px-4 sm:px-6 pt-4 pb-20 sm:py-5 sm:pr-44 text-xs text-slate-500">
          <span>MediNa - PharmaTrack · Pharmaceutical Supply Chain &amp; DGDA Compliance</span>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => openAuth('register')}
              className="hover:text-slate-900 transition-colors"
            >
              Organization Registration
            </button>
            <button
              type="button"
              onClick={() => openPublicPortal('report')}
              className="hover:text-slate-900 transition-colors"
            >
              Report Counterfeit
            </button>
          </div>
        </div>
      </footer>

      <PharmaAiWidget />
    </div>
  );
}
