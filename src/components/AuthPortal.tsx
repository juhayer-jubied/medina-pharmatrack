import { useState, type FormEvent } from 'react';
import {
  Factory,
  Lock,
  ShieldCheck,
  Store,
  UserPlus,
} from 'lucide-react';
import { api, setStoredToken } from '../lib/api';
import {
  PHARMACY_AREAS,
  resolveCompanyBatchCodes,
  type PharmacyArea,
  type PublicUser,
  type UserRole,
} from '../lib/pharmaLogic';

interface AuthPortalProps {
  initialMode?: 'login' | 'register';
  initialRole?: UserRole;
  onAuthenticated: (user: PublicUser) => void;
}

const PORTAL_ROLES: Array<{
  role: UserRole;
  label: string;
  subtitle: string;
  icon: typeof Factory;
}> = [
  {
    role: 'Company',
    label: 'Company',
    subtitle: 'Production & Supply Dispatch',
    icon: Factory,
  },
  {
    role: 'Pharmacy',
    label: 'Pharmacy',
    subtitle: 'Inventory & POS Counter',
    icon: Store,
  },
  {
    role: 'DGDA Regulator',
    label: 'DGDA Regulator',
    subtitle: 'Recalls & Complaint Audit',
    icon: ShieldCheck,
  },
];

export function AuthPortal({
  initialMode = 'login',
  initialRole = 'Company',
  onAuthenticated,
}: AuthPortalProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>(initialRole);
  const [mode, setMode] = useState<'login' | 'register'>(
    initialRole === 'DGDA Regulator' ? 'login' : initialMode
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationNotice, setRegistrationNotice] = useState<string | null>(null);

  // Login state (completely empty - zero prefilled credentials)
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Registration state
  const [organizationName, setOrganizationName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [entityId, setEntityId] = useState('');
  const [companyPrefix, setCompanyPrefix] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [area, setArea] = useState<PharmacyArea>('Daffodil');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');

  const isRegulator = selectedRole === 'DGDA Regulator';

  const batchCodePreview =
    selectedRole === 'Company' && entityId.trim()
      ? resolveCompanyBatchCodes(entityId, 1, companyPrefix || undefined)
      : null;

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user, token } = await api.login(loginUsername, loginPassword, selectedRole);
      if (token) {
        setStoredToken(token);
      }
      onAuthenticated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setRegistrationNotice(null);
    setLoading(true);
    try {
      const res = await api.register({
        organizationName,
        username,
        password,
        role: selectedRole,
        entityId,
        ...(selectedRole === 'Company' && companyPrefix.trim().length === 3
          ? { companyPrefix: companyPrefix.trim().toUpperCase() }
          : {}),
        ...(selectedRole === 'Pharmacy'
          ? {
              ownerName: ownerName.trim() || organizationName.trim(),
              area,
              address,
              contact,
              ...(googleMapsUrl.trim() ? { googleMapsUrl: googleMapsUrl.trim() } : {}),
            }
          : {}),
      });

      if (res.requiresApproval || !res.token) {
        setRegistrationNotice(
          res.message ||
            'Registration submitted successfully! Your pharmacy license is now awaiting DGDA regulatory verification before you can sign in.'
        );
        setMode('login');
        setLoginUsername(username);
        setLoginPassword('');
        return;
      }

      setStoredToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all';

  return (
    <div className="mx-auto max-w-xl py-4 sm:py-8 px-2 sm:px-4">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.06)]">
        <div className="mb-6">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-teal-200/80 bg-teal-50 text-[#0F766E] mb-3.5">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {mode === 'login' ? 'Admin & Partner Login' : 'Register Partner Account'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Select your portal role first, then{' '}
            {mode === 'login'
              ? 'sign in with your organization credentials.'
              : 'complete your verified registration.'}
          </p>
        </div>

        {/* Step 1: Portal Role Selector */}
        <div className="mb-6">
          <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Portal Role
          </span>
          <div
            role="radiogroup"
            aria-label="Select portal role"
            className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
          >
            {PORTAL_ROLES.map((item) => {
              const Icon = item.icon;
              const active = selectedRole === item.role;
              return (
                <button
                  key={item.role}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setSelectedRole(item.role);
                    if (item.role === 'DGDA Regulator') {
                      setMode('login');
                    }
                    setError(null);
                  }}
                  className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
                    active
                      ? 'border-[#0F766E] bg-teal-50/70 ring-2 ring-teal-500/20'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 mb-2 ${
                      active ? 'text-[#0F766E]' : 'text-slate-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span
                    className={`text-sm font-semibold ${
                      active ? 'text-[#0F766E]' : 'text-slate-900'
                    }`}
                  >
                    {item.label}
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-500 leading-snug">
                    {item.subtitle}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Sign In / Register Switch (Hidden for DGDA Regulator) */}
        {isRegulator ? (
          <div className="mb-6 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs text-slate-600 flex items-center gap-2.5">
            <Lock className="h-4 w-4 shrink-0 text-[#0F766E]" aria-hidden="true" />
            <span>
              Public registration is restricted for <strong>DGDA Regulator</strong>. Sign in using
              official DGDA regulatory credentials.
            </span>
          </div>
        ) : (
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-slate-200/80 bg-slate-100/80 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-all whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-all whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Register Account
            </button>
          </div>
        )}

        {registrationNotice && (
          <div
            role="status"
            className="mb-5 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-[#0F766E] flex items-start gap-2.5"
          >
            <ShieldCheck className="h-5 w-5 shrink-0 text-[#0F766E] mt-0.5" aria-hidden="true" />
            <div>
              <div className="font-semibold text-slate-900">Registration Notice</div>
              <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">{registrationNotice}</p>
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            {error}
          </div>
        )}

        {mode === 'login' || isRegulator ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-username"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Username
              </label>
              <input
                id="login-username"
                type="text"
                required
                autoComplete="username"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder={`Enter ${selectedRole.toLowerCase()} username`}
                className={inputClass}
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Enter your password"
                className={inputClass}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#115E59] focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:opacity-60 transition-all"
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="reg-org-name"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                {selectedRole === 'Pharmacy' ? 'Pharmacy Name' : 'Company Name'}
              </label>
              <input
                id="reg-org-name"
                type="text"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder={
                  selectedRole === 'Company'
                    ? 'e.g., Square Pharmaceuticals Ltd.'
                    : 'e.g., Daffodil Care Pharmacy'
                }
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="reg-entity-id"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  {selectedRole === 'Company' ? 'Company Entity ID' : 'Pharmacy License ID'}
                </label>
                <input
                  id="reg-entity-id"
                  type="text"
                  required
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value.toUpperCase())}
                  placeholder={selectedRole === 'Company' ? 'e.g., 1 or 2' : 'e.g., DSC_01'}
                  className={`${inputClass} font-mono placeholder:font-sans`}
                />
              </div>

              <div>
                <label
                  htmlFor="reg-username"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Username
                </label>
                <input
                  id="reg-username"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose a username"
                  className={inputClass}
                />
              </div>
            </div>

            {selectedRole === 'Company' && (
              <div>
                <label
                  htmlFor="reg-company-prefix"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  3-Letter Batch Code Prefix (optional)
                </label>
                <input
                  id="reg-company-prefix"
                  type="text"
                  maxLength={3}
                  value={companyPrefix}
                  onChange={(e) =>
                    setCompanyPrefix(e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase())
                  }
                  placeholder="Auto (Entity 1 → CPA, Entity 2 → CPB)"
                  className={`${inputClass} font-mono placeholder:font-sans`}
                />
                {batchCodePreview && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Generated batch format preview:{' '}
                    <span className="font-mono font-semibold text-[#0F766E]">
                      {batchCodePreview.compPrefix}-ATB-P001{batchCodePreview.companySuffix}-1028
                    </span>{' '}
                    · Supply ID:{' '}
                    <span className="font-mono font-semibold text-[#0F766E]">
                      S01{batchCodePreview.companySuffix}
                    </span>
                  </p>
                )}
              </div>
            )}

            <div>
              <label
                htmlFor="reg-password"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Password (min 6 characters)
              </label>
              <input
                id="reg-password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a secure password"
                className={inputClass}
              />
            </div>

            {selectedRole === 'Pharmacy' && (
              <div className="space-y-4 border-t border-slate-100 pt-4">
                <p className="text-xs font-medium text-slate-500">
                  Pharmacy Owner, Area &amp; Location Details
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="reg-owner-name"
                      className="block text-sm font-medium text-slate-700 mb-1.5"
                    >
                      Owner Name
                    </label>
                    <input
                      id="reg-owner-name"
                      type="text"
                      required
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="e.g., Md. Mahmudul Hasan"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="reg-area"
                      className="block text-sm font-medium text-slate-700 mb-1.5"
                    >
                      Area
                    </label>
                    <select
                      id="reg-area"
                      value={area}
                      onChange={(e) => setArea(e.target.value as PharmacyArea)}
                      className={inputClass}
                    >
                      {PHARMACY_AREAS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="reg-contact"
                      className="block text-sm font-medium text-slate-700 mb-1.5"
                    >
                      Contact Number
                    </label>
                    <input
                      id="reg-contact"
                      type="text"
                      required
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                      placeholder="e.g., 01711-000001"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="reg-maps-url"
                      className="block text-sm font-medium text-slate-700 mb-1.5"
                    >
                      Google Maps Link (optional)
                    </label>
                    <input
                      id="reg-maps-url"
                      type="url"
                      value={googleMapsUrl}
                      onChange={(e) => setGoogleMapsUrl(e.target.value)}
                      placeholder="Auto-generated if blank"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="reg-address"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Street Address
                  </label>
                  <input
                    id="reg-address"
                    type="text"
                    required
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g., DSC Main Gate, Birulia, Savar"
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#115E59] focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:opacity-60 transition-all"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              {loading ? 'Creating Account...' : `Register ${selectedRole} Account`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}