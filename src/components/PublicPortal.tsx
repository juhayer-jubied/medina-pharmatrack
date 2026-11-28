import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ExternalLink,
  Factory,
  FileWarning,
  Layers,
  MapPin,
  PackageSearch,
  Phone,
  Pill,
  Search,
  ShieldAlert,
  ShieldCheck,
  Store,
  Tag,
  User,
} from 'lucide-react';
import {
  api,
  type BatchVerificationResult,
  type PublicPharmacy,
  type PublicStockItem,
} from '../lib/api';
import {
  COMPLAINT_ISSUE_TYPES,
  DRUG_GROUPS,
  PHARMACY_AREAS,
  type ComplaintIssueType,
  type ComplaintRecord,
} from '../lib/pharmaLogic';
import {
  BatchApprovalStatusBadge,
  BatchStatusBadge,
  ComplaintStatusBadge,
  MonoIdBadge,
} from './StatusBadge';

export type PublicTab = 'verify' | 'stock' | 'near-me' | 'profiles' | 'report';

interface PublicPortalProps {
  activeTab: PublicTab;
  onTabChange: (tab: PublicTab) => void;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onBackHome?: () => void;
}

export function PublicPortal({
  activeTab,
  onTabChange,
  onOpenAuth,
  onBackHome,
}: PublicPortalProps) {
  // Batch Verification state
  const [batchIdInput, setBatchIdInput] = useState('');
  const [pharmacyIdInput, setPharmacyIdInput] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verification, setVerification] = useState<BatchVerificationResult | null>(null);

  // Stock finder state
  const [selectedGroup, setSelectedGroup] = useState<string>('All');
  const [medicineSearchInput, setMedicineSearchInput] = useState('');
  const [stockViewMode, setStockViewMode] = useState<'grouped' | 'table'>('grouped');
  const [stockItems, setStockItems] = useState<PublicStockItem[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);

  // Pharmacies directory & profiles state
  const [selectedArea, setSelectedArea] = useState<string>('All');
  const [pharmacies, setPharmacies] = useState<PublicPharmacy[]>([]);
  const [allPharmacies, setAllPharmacies] = useState<PublicPharmacy[]>([]);
  const [pharmaciesLoading, setPharmaciesLoading] = useState(false);
  const [pharmaciesError, setPharmaciesError] = useState<string | null>(null);

  // Report & Track state
  const [reportPharmacyId, setReportPharmacyId] = useState('');
  const [reportBatchId, setReportBatchId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [issueType, setIssueType] = useState<ComplaintIssueType>('Counterfeit Medicine');
  const [description, setDescription] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedComplaint, setSubmittedComplaint] = useState<ComplaintRecord | null>(null);

  const [trackIdInput, setTrackIdInput] = useState('');
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackedComplaint, setTrackedComplaint] = useState<ComplaintRecord | null>(null);

  useEffect(() => {
    if (activeTab === 'stock') {
      void loadStock(selectedGroup, medicineSearchInput);
    } else if (activeTab === 'near-me') {
      void loadPharmacies(selectedArea);
    } else if (activeTab === 'profiles') {
      void loadPharmacies('All');
    } else if (activeTab === 'report') {
      void loadAllPharmaciesForReport();
    }
  }, [activeTab, selectedGroup, medicineSearchInput, selectedArea]);

  async function loadStock(group: string, medQuery: string = '') {
    setStockLoading(true);
    setStockError(null);
    try {
      const data = await api.getPublicStock(group, medQuery);
      setStockItems(data.items);
    } catch (err) {
      setStockError(err instanceof Error ? err.message : 'Unable to load medicine stock.');
    } finally {
      setStockLoading(false);
    }
  }

  async function loadPharmacies(area: string) {
    setPharmaciesLoading(true);
    setPharmaciesError(null);
    try {
      const data = await api.getPublicPharmacies(area);
      setPharmacies(data.pharmacies);
    } catch (err) {
      setPharmaciesError(err instanceof Error ? err.message : 'Unable to load pharmacy directory.');
    } finally {
      setPharmaciesLoading(false);
    }
  }

  async function loadAllPharmaciesForReport() {
    try {
      const data = await api.getPublicPharmacies('All');
      setAllPharmacies(data.pharmacies);
      if (data.pharmacies.length > 0 && !reportPharmacyId) {
        setReportPharmacyId(data.pharmacies[0].entityId);
      }
    } catch {
      // Non-blocking for complaint form
    }
  }

  async function handleVerifySubmit(e: FormEvent) {
    e.preventDefault();
    const cleanedBatch = batchIdInput.trim().toUpperCase();
    if (!cleanedBatch) return;
    setVerifyLoading(true);
    setVerifyError(null);
    try {
      const result = await api.verifyBatch(
        cleanedBatch,
        pharmacyIdInput.trim().toUpperCase() || undefined
      );
      setVerification(result);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Batch verification failed.');
    } finally {
      setVerifyLoading(false);
    }
  }

  async function handleComplaintSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmittedComplaint(null);
    setSubmitLoading(true);
    try {
      const res = await api.submitComplaint({
        pharmacyId: reportPharmacyId.trim().toUpperCase(),
        batchId: reportBatchId.trim().toUpperCase() || undefined,
        customerName,
        customerContact,
        issueType,
        description,
      });
      setSubmittedComplaint(res.complaint);
      setTrackIdInput(res.complaint.complaintId);
      setTrackedComplaint(res.complaint);
      setReportBatchId('');
      setDescription('');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to submit complaint.');
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handleTrackSubmit(e: FormEvent) {
    e.preventDefault();
    const id = trackIdInput.trim().toUpperCase();
    if (!id) return;
    setTrackLoading(true);
    setTrackError(null);
    try {
      const res = await api.trackComplaint(id);
      setTrackedComplaint(res.complaint);
    } catch (err) {
      setTrackedComplaint(null);
      setTrackError(err instanceof Error ? err.message : 'Complaint not found.');
    } finally {
      setTrackLoading(false);
    }
  }

  const cardSurface =
    'rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_10px_-3px_rgba(15,23,42,0.06)] transition-all';
  const inputFieldClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all';

  const tabs: Array<{ id: PublicTab; label: string; icon: typeof Search }> = [
    { id: 'verify', label: 'Verify Authenticity', icon: ShieldCheck },
    { id: 'stock', label: 'Search Medicine', icon: PackageSearch },
    { id: 'near-me', label: 'Pharmacy Near Me', icon: MapPin },
    { id: 'profiles', label: 'Pharmacy Profiles', icon: Store },
    { id: 'report', label: 'Report & Track', icon: FileWarning },
  ];

  return (
    <div className="space-y-8">
      {/* Portal Top Bar & Sub-Module Tabs */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              {onBackHome && (
                <button
                  type="button"
                  onClick={onBackHome}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-all"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  Home
                </button>
              )}
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
                Public Customer Portal
              </h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Verify batch authenticity, search live medicine stock, find nearby pharmacies, or file DGDA reports.
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Public portal sections"
          className="inline-flex flex-wrap gap-1.5 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.06)] self-start"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(tab.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                  active
                    ? 'bg-[#0F766E] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 1: Verify Authenticity */}
      {activeTab === 'verify' && (
        <section
          id="verify-batch"
          aria-labelledby="verify-heading"
          className={`${cardSurface} hover:border-teal-300/80 px-6 py-8 sm:px-10 sm:py-10`}
        >
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-3 inline-flex items-center gap-2 text-xs font-semibold text-[#0F766E]">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>DGDA Supply-Chain Traceability</span>
            </div>
            <h2
              id="verify-heading"
              className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 [text-wrap:balance]"
            >
              Verify Medicine Batch Authenticity
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed">
              Enter a standardized Batch Number (e.g.,{' '}
              <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-800">
                CPA-ATB-P001-1028
              </span>
              ) to confirm manufacturer provenance, expiry validity, DGDA recall status, and live pharmacy stock.
            </p>

            <form
              onSubmit={handleVerifySubmit}
              className="mt-7 grid grid-cols-1 sm:grid-cols-12 gap-3 text-left"
            >
              <div className="sm:col-span-5">
                <label htmlFor="verify-batch-id" className="sr-only">
                  Batch Number
                </label>
                <input
                  id="verify-batch-id"
                  type="text"
                  required
                  value={batchIdInput}
                  onChange={(e) => setBatchIdInput(e.target.value.toUpperCase())}
                  placeholder="Batch Number (e.g., CPA-ATB-P001-1028)"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3.5 font-mono text-sm sm:text-base text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:bg-white focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
                />
              </div>

              <div className="sm:col-span-4">
                <label htmlFor="verify-pharmacy-id" className="sr-only">
                  Optional Pharmacy ID
                </label>
                <input
                  id="verify-pharmacy-id"
                  type="text"
                  value={pharmacyIdInput}
                  onChange={(e) => setPharmacyIdInput(e.target.value.toUpperCase())}
                  placeholder="Pharmacy ID (optional)"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3.5 font-mono text-sm sm:text-base text-slate-900 placeholder:font-sans placeholder:text-slate-400 focus:bg-white focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
                />
              </div>

              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={verifyLoading}
                  className="inline-flex w-full h-full min-h-[52px] items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-5 py-3.5 text-sm font-semibold text-white shadow-xs hover:bg-[#115E59] focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:opacity-60 transition-all whitespace-nowrap"
                >
                  <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {verifyLoading ? 'Checking...' : 'Verify Batch'}
                </button>
              </div>
            </form>

            {verifyError && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-sm text-rose-800"
              >
                {verifyError}
              </div>
            )}
          </div>

          {verification && (
            <div className="mx-auto mt-9 max-w-4xl border-t border-slate-200/80 pt-7">
              {!verification.found || !verification.batch ? (
                <div
                  role="alert"
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50/90 p-5 text-rose-900"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                      <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <MonoIdBadge>{verification.batchId}</MonoIdBadge>
                        <BatchStatusBadge status={verification.status} />
                      </div>
                      <p className="mt-2 text-sm text-rose-800 leading-relaxed">
                        No matching batch record exists in MediNa - PharmaTrack. Do not purchase unverified medicine—you may report suspicious stock under Report &amp; Track.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {verification.batch.approvalStatus === 'PENDING_APPROVAL' ? (
                    <div
                      role="alert"
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50/90 p-5 text-amber-950"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                          <Clock className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="text-base font-semibold tracking-tight text-amber-950">
                              এই ওষুধ এখনো ডিজিডিএ থেকে এপ্রুভাল পেন্ডিং (DGDA Approval Pending)
                            </span>
                            <BatchApprovalStatusBadge status="PENDING_APPROVAL" />
                          </div>
                          <p className="mt-1 text-sm text-amber-900 leading-relaxed">
                            এই ওষুধ ব্যাচটি এখনও ডিজিডিএ (DGDA) রেগুলেটরি বডি কর্তৃক অনুমোদিত হয়নি। অনুমোদন পাওয়ার পূর্ব পর্যন্ত এই ওষুধ বাজারজাত, ফার্মেসি থেকে বিক্রয় বা সেবন সম্পূর্ণ নিষিদ্ধ।
                          </p>
                          {verification.batch.approvalRemarks && (
                            <div className="mt-2 text-xs text-amber-800 font-mono bg-amber-100/70 border border-amber-200/60 rounded-lg px-2.5 py-1">
                              DGDA Status: {verification.batch.approvalRemarks}
                            </div>
                          )}
                        </div>
                      </div>
                      <MonoIdBadge>{verification.batch.batchId}</MonoIdBadge>
                    </div>
                  ) : verification.batch.approvalStatus === 'REJECTED' ? (
                    <div
                      role="alert"
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50/90 p-5 text-rose-950"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="text-base font-semibold tracking-tight text-rose-950">
                              ডিজিডিএ এপ্রুভাল রিজেক্টেড (DGDA Approval Rejected)
                            </span>
                            <BatchApprovalStatusBadge status="REJECTED" />
                          </div>
                          <p className="mt-1 text-sm text-rose-900 leading-relaxed">
                            ডিজিডিএ (DGDA) কর্তৃপক্ষ এই ওষুধ ব্যাচটির অনুমোদন বাতিল/রিজেক্ট করেছে। এই ওষুধ বিক্রয়, সরবরাহ বা সেবন আইনত নিষিদ্ধ।
                          </p>
                          {verification.batch.approvalRemarks && (
                            <div className="mt-2 text-xs text-rose-800 font-mono bg-rose-100/70 border border-rose-200/60 rounded-lg px-2.5 py-1">
                              DGDA Rejection Reason: {verification.batch.approvalRemarks}
                            </div>
                          )}
                        </div>
                      </div>
                      <MonoIdBadge>{verification.batch.batchId}</MonoIdBadge>
                    </div>
                  ) : verification.status === 'AUTHENTIC' ? (
                    <div
                      role="status"
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/85 p-5 text-emerald-950"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="text-base font-semibold tracking-tight text-emerald-950">
                              Verified Authentic Medicine Batch
                            </span>
                            <BatchStatusBadge status={verification.status} />
                            <BatchApprovalStatusBadge status={verification.batch.approvalStatus || 'APPROVED'} />
                          </div>
                          <p className="mt-1 text-sm text-emerald-800">
                            Registered production provenance and DGDA market approval confirmed. Valid through{' '}
                            <span className="font-mono font-semibold tabular-nums">
                              {verification.batch.expiryDate}
                            </span>{' '}
                            with zero active DGDA recalls.
                          </p>
                        </div>
                      </div>
                      <MonoIdBadge>{verification.batch.batchId}</MonoIdBadge>
                    </div>
                  ) : (
                    <div
                      role="alert"
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50/90 p-5 text-rose-950"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                          <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="text-base font-semibold tracking-tight text-rose-950">
                              {verification.status === 'RECALLED'
                                ? 'DGDA Emergency Recall Active'
                                : 'Expired Medicine Batch Warning'}
                            </span>
                            <BatchStatusBadge status={verification.status} />
                          </div>
                          <p className="mt-1 text-sm text-rose-800">
                            {verification.status === 'RECALLED'
                              ? verification.batch.recallReason ||
                                'This batch has been recalled by regulatory authorities. Dispensing is blocked nationwide.'
                              : `This batch expired on ${verification.batch.expiryDate} and is automatically blocked from pharmacy sale.`}
                          </p>
                        </div>
                      </div>
                      <MonoIdBadge>{verification.batch.batchId}</MonoIdBadge>
                    </div>
                  )}

                  {/* Structured Provenance Grid */}
                  <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                      <dt className="flex items-center gap-2 text-xs font-medium text-slate-500">
                        <Pill className="h-3.5 w-3.5 text-[#0F766E]" aria-hidden="true" />
                        Medicine Name
                      </dt>
                      <dd className="mt-1.5 text-sm font-semibold text-slate-900">
                        {verification.batch.medicineName}
                      </dd>
                    </div>

                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                      <dt className="flex items-center gap-2 text-xs font-medium text-slate-500">
                        <Layers className="h-3.5 w-3.5 text-[#0F766E]" aria-hidden="true" />
                        Drug Group
                      </dt>
                      <dd className="mt-1.5 text-sm font-semibold text-slate-900">
                        {verification.batch.drugGroup}
                      </dd>
                    </div>

                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                      <dt className="flex items-center gap-2 text-xs font-medium text-slate-500">
                        <Factory className="h-3.5 w-3.5 text-[#0F766E]" aria-hidden="true" />
                        Company
                      </dt>
                      <dd className="mt-1.5 text-sm font-semibold text-slate-900">
                        {verification.batch.manufacturerName}{' '}
                        <span className="font-mono text-xs font-medium text-slate-500">
                          (ID: {verification.batch.manufacturerId})
                        </span>
                      </dd>
                    </div>

                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                      <dt className="flex items-center gap-2 text-xs font-medium text-slate-500">
                        <Tag className="h-3.5 w-3.5 text-[#0F766E]" aria-hidden="true" />
                        MRP Unit Price
                      </dt>
                      <dd className="mt-1.5 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                        {verification.batch.unitPrice.toFixed(2)} BDT
                      </dd>
                    </div>

                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                      <dt className="flex items-center gap-2 text-xs font-medium text-slate-500">
                        <CalendarCheck className="h-3.5 w-3.5 text-[#0F766E]" aria-hidden="true" />
                        Production Date
                      </dt>
                      <dd className="mt-1.5 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                        {verification.batch.productionDate}
                      </dd>
                    </div>

                    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
                      <dt className="flex items-center gap-2 text-xs font-medium text-slate-500">
                        <CalendarClock className="h-3.5 w-3.5 text-[#0F766E]" aria-hidden="true" />
                        Expiry Date
                      </dt>
                      <dd className="mt-1.5 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                        {verification.batch.expiryDate}
                      </dd>
                    </div>

                    <div className="sm:col-span-2 lg:col-span-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <dt className="flex items-center gap-2 text-xs font-medium text-slate-500">
                        <ShieldCheck className="h-3.5 w-3.5 text-[#0F766E]" aria-hidden="true" />
                        DGDA Regulatory Clearance
                      </dt>
                      <dd className="flex items-center gap-2 text-xs">
                        <BatchApprovalStatusBadge status={verification.batch.approvalStatus || 'PENDING_APPROVAL'} />
                        {verification.batch.approvalRemarks && (
                          <span className="text-slate-600 font-normal">
                            ({verification.batch.approvalRemarks})
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  {verification.pharmacyVerification && (
                    <div className="rounded-xl border border-slate-200/80 bg-white p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <h3 className="text-sm font-semibold text-slate-900">
                          Pharmacy Stock Verification
                        </h3>
                        <MonoIdBadge>{verification.pharmacyVerification.pharmacyId}</MonoIdBadge>
                      </div>
                      {verification.pharmacyVerification.found ? (
                        <div className="mt-3.5 grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-xs text-slate-500">Licensed Pharmacy</div>
                            <div className="mt-1 font-medium text-slate-900">
                              {verification.pharmacyVerification.pharmacyName}
                            </div>
                            {verification.pharmacyVerification.area && (
                              <div className="text-xs text-slate-500">
                                {verification.pharmacyVerification.area}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">Supplied to Store</div>
                            <div className="mt-1 font-mono text-slate-900 tabular-nums">
                              {verification.pharmacyVerification.receivedQty} pcs
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">Dispensed</div>
                            <div className="mt-1 font-mono text-slate-900 tabular-nums">
                              {verification.pharmacyVerification.soldQty} pcs
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">Current Live Stock</div>
                            <div className="mt-1 font-mono font-semibold text-[#0F766E] tabular-nums">
                              {verification.pharmacyVerification.remainingStock} pcs
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2.5 text-sm text-amber-800">
                          No registered pharmacy found with ID{' '}
                          <span className="font-mono font-semibold">
                            {verification.pharmacyVerification.pharmacyId}
                          </span>
                          .
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Tab 2: Search Medicine */}
      {activeTab === 'stock' && (
        <div className={`${cardSurface} p-6 sm:p-8`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                Search Medicine Availability
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Live, DGDA-approved inventory across all registered pharmacies. Search by medicine name to see which pharmacies have stock.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['All', ...DRUG_GROUPS] as const).map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => setSelectedGroup(group)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
                    selectedGroup === group
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  {group}
                </button>
              ))}
            </div>
          </div>

          {/* Search Medicine by Name Bar */}
          <div className="mt-5 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
              <input
                type="text"
                value={medicineSearchInput}
                onChange={(e) => setMedicineSearchInput(e.target.value)}
                placeholder="Search medicine by name (e.g., Napa, Seclo, Cipro, Paracetamol...)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-10 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
              />
              {medicineSearchInput && (
                <button
                  type="button"
                  onClick={() => setMedicineSearchInput('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 hover:text-slate-600"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setStockViewMode('grouped')}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                  stockViewMode === 'grouped'
                    ? 'bg-[#0F766E] text-white shadow-xs'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Pharmacy Stock View
              </button>
              <button
                type="button"
                onClick={() => setStockViewMode('table')}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-all whitespace-nowrap ${
                  stockViewMode === 'table'
                    ? 'bg-[#0F766E] text-white shadow-xs'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                Table Ledger
              </button>
            </div>
          </div>

          {stockError && (
            <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {stockError}
            </div>
          )}

          {stockLoading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Loading active pharmacy stock...
            </div>
          ) : stockItems.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-sm font-semibold text-slate-900">
                {medicineSearchInput ? `No pharmacies found with "${medicineSearchInput}" in stock` : 'No active medicine stock found'}
              </p>
              <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
                {medicineSearchInput
                  ? 'Try searching for another medicine name or check back once partner pharmacies receive new stock.'
                  : 'Stock will appear here once a registered company dispatches an active batch to a licensed pharmacy.'}
              </p>
              {medicineSearchInput && (
                <button
                  type="button"
                  onClick={() => setMedicineSearchInput('')}
                  className="mt-4 inline-flex items-center rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-all"
                >
                  Clear search filter
                </button>
              )}
            </div>
          ) : stockViewMode === 'grouped' ? (
            /* Grouped View: Medicine -> Available Pharmacies */
            <div className="mt-6 space-y-5">
              {Object.values(
                stockItems.reduce<
                  Record<
                    string,
                    {
                      medicineName: string;
                      drugGroup: string;
                      manufacturerName: string;
                      unitPrice: number;
                      totalAvailable: number;
                      pharmacies: Array<{
                        pharmacyId: string;
                        pharmacyName: string;
                        area: string;
                        address: string;
                        contact: string;
                        availableStock: number;
                        batchId: string;
                        expiryDate: string;
                      }>;
                    }
                  >
                >((acc, item) => {
                  const key = item.medicineName.trim().toLowerCase();
                  if (!acc[key]) {
                    acc[key] = {
                      medicineName: item.medicineName,
                      drugGroup: item.drugGroup,
                      manufacturerName: item.manufacturerName,
                      unitPrice: item.unitPrice,
                      totalAvailable: 0,
                      pharmacies: [],
                    };
                  }
                  acc[key].totalAvailable += item.availableStock;
                  acc[key].pharmacies.push({
                    pharmacyId: item.pharmacyId,
                    pharmacyName: item.pharmacyName,
                    area: item.area,
                    address: item.address,
                    contact: item.contact,
                    availableStock: item.availableStock,
                    batchId: item.batchId,
                    expiryDate: item.expiryDate,
                  });
                  return acc;
                }, {})
              ).map((med) => (
                <div
                  key={med.medicineName}
                  className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-xs hover:border-teal-300 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="text-lg font-semibold tracking-tight text-slate-900">
                          {med.medicineName}
                        </h3>
                        <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-[#0F766E]">
                          {med.drugGroup}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Manufacturer: <span className="font-medium text-slate-700">{med.manufacturerName}</span> · MRP Price:{' '}
                        <span className="font-mono font-semibold text-slate-900 tabular-nums">
                          ৳{med.unitPrice.toFixed(2)}
                        </span>
                      </p>
                    </div>
                    <div className="sm:text-right">
                      <span className="text-xs text-slate-500 block">Available In Stock At</span>
                      <span className="font-semibold text-sm text-[#0F766E]">
                        {med.pharmacies.length} {med.pharmacies.length === 1 ? 'Pharmacy' : 'Pharmacies'} ({med.totalAvailable.toLocaleString()} pcs total)
                      </span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                      Available Pharmacies ({med.pharmacies.length}):
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {med.pharmacies.map((pharm) => (
                        <div
                          key={`${pharm.pharmacyId}-${pharm.batchId}`}
                          className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 flex flex-col justify-between hover:bg-white hover:border-teal-300 transition-all"
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h5 className="font-semibold text-sm text-slate-900">
                                  {pharm.pharmacyName}
                                </h5>
                                <span className="font-mono text-xs text-slate-500">
                                  License: {pharm.pharmacyId}
                                </span>
                              </div>
                              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-700 tabular-nums whitespace-nowrap">
                                {pharm.availableStock} pcs
                              </span>
                            </div>

                            <div className="mt-2.5 text-xs text-slate-600 space-y-1">
                              <div className="flex items-center gap-1.5 text-slate-600">
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                                <span>{pharm.area} · {pharm.address}</span>
                              </div>
                              {pharm.contact && (
                                <div className="flex items-center gap-1.5 text-slate-600">
                                  <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                                  <a
                                    href={`tel:${pharm.contact}`}
                                    className="font-mono hover:text-[#0F766E] transition-colors"
                                  >
                                    {pharm.contact}
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="mt-3.5 pt-2.5 border-t border-slate-200/70 flex items-center justify-between text-[11px] text-slate-500">
                            <span className="font-mono">Batch: {pharm.batchId}</span>
                            <span>Exp: {pharm.expiryDate}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Table View */
            <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-4">Batch Number</th>
                    <th className="py-3 px-4">Medicine</th>
                    <th className="py-3 px-4">Group</th>
                    <th className="py-3 px-4">Pharmacy</th>
                    <th className="py-3 px-4">Area</th>
                    <th className="py-3 px-4 text-right">Price (BDT)</th>
                    <th className="py-3 px-4">Expiry</th>
                    <th className="py-3 px-4 text-right">Available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stockItems.map((item) => (
                    <tr
                      key={`${item.batchId}-${item.pharmacyId}`}
                      className="even:bg-slate-50/50 hover:bg-teal-50/30 transition-colors"
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <MonoIdBadge>{item.batchId}</MonoIdBadge>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        <div>{item.medicineName}</div>
                        <div className="text-xs font-normal text-slate-500">{item.manufacturerName}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{item.drugGroup}</td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{item.pharmacyName}</div>
                        <div className="font-mono text-xs text-slate-500">{item.pharmacyId}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{item.area}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                        {item.unitPrice.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                        {item.expiryDate}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-emerald-700">
                          {item.availableStock} pcs
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Pharmacy Near Me */}
      {activeTab === 'near-me' && (
        <div className={`${cardSurface} p-6 sm:p-8`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                Pharmacy Near Me
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Browse nearby pharmacies by area with full details, contacts, and Google Maps links.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['All', ...PHARMACY_AREAS] as const).map((area) => (
                <button
                  key={area}
                  type="button"
                  onClick={() => setSelectedArea(area)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
                    selectedArea === area
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  {area}
                </button>
              ))}
            </div>
          </div>

          {pharmaciesError && (
            <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {pharmaciesError}
            </div>
          )}

          {pharmaciesLoading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Loading nearby pharmacies...
            </div>
          ) : pharmacies.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-sm font-semibold text-slate-900">
                No licensed pharmacies registered{selectedArea !== 'All' ? ` in ${selectedArea}` : ''}
              </p>
              <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
                Pharmacy organizations can register with their license ID to appear here.
              </p>
              <button
                type="button"
                onClick={() => onOpenAuth('register')}
                className="mt-5 inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-teal-300 transition-all"
              >
                Register Pharmacy
              </button>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pharmacies.map((pharmacy) => (
                <div
                  key={pharmacy.entityId}
                  className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_10px_-3px_rgba(15,23,42,0.06)] hover:border-teal-300 transition-all flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold tracking-tight text-slate-900">
                        {pharmacy.organizationName}
                      </h3>
                      <MonoIdBadge>{pharmacy.entityId}</MonoIdBadge>
                    </div>
                    <p className="mt-1 text-xs font-medium text-[#0F766E]">
                      Area: {pharmacy.area}
                    </p>
                    <div className="mt-3.5 space-y-2 text-sm text-slate-600">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" aria-hidden="true" />
                        <span>{pharmacy.address}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                        <span className="font-mono text-xs">{pharmacy.contact}</span>
                      </div>
                    </div>
                  </div>

                  <a
                    href={pharmacy.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50/70 px-3.5 py-2 text-xs font-semibold text-[#0F766E] hover:bg-teal-100/80 transition-colors"
                  >
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    Open in Google Maps
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Pharmacy Profiles */}
      {activeTab === 'profiles' && (
        <div className={`${cardSurface} p-6 sm:p-8`}>
          <div className="pb-5 border-b border-slate-100">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Registered Pharmacy Profiles
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Complete owner details, license IDs, addresses, and verified contact info for every registered pharmacy.
            </p>
          </div>

          {pharmaciesError && (
            <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {pharmaciesError}
            </div>
          )}

          {pharmaciesLoading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Loading pharmacy profiles...
            </div>
          ) : pharmacies.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-sm font-semibold text-slate-900">
                No pharmacy profiles available yet
              </p>
              <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
                Registered pharmacies appear here with owner name, license ID, address, and contact details.
              </p>
              <button
                type="button"
                onClick={() => onOpenAuth('register')}
                className="mt-5 inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-teal-300 transition-all"
              >
                Register Pharmacy
              </button>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {pharmacies.map((pharmacy) => (
                <div
                  key={pharmacy.entityId}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/40 p-5 hover:border-teal-300 hover:bg-white transition-all space-y-3"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-slate-200/70 pb-3">
                    <div>
                      <h3 className="text-base font-semibold tracking-tight text-slate-900">
                        {pharmacy.organizationName}
                      </h3>
                      <p className="mt-0.5 text-xs font-medium text-[#0F766E]">
                        Zone: {pharmacy.area}
                      </p>
                    </div>
                    <MonoIdBadge>{pharmacy.entityId}</MonoIdBadge>
                  </div>

                  <dl className="space-y-2 text-sm text-slate-600">
                    <div className="flex items-center gap-2.5">
                      <User className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <div>
                        <dt className="sr-only">Owner Name</dt>
                        <dd>
                          <span className="text-xs text-slate-500 mr-1.5">Owner:</span>
                          <span className="font-medium text-slate-900">
                            {pharmacy.ownerName || pharmacy.organizationName}
                          </span>
                        </dd>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <MapPin className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" aria-hidden="true" />
                      <div>
                        <dt className="sr-only">Address</dt>
                        <dd>{pharmacy.address}</dd>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Phone className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                      <div>
                        <dt className="sr-only">Contact</dt>
                        <dd className="font-mono text-xs text-slate-700">{pharmacy.contact}</dd>
                      </div>
                    </div>
                  </dl>

                  <div className="pt-1">
                    <a
                      href={pharmacy.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F766E] hover:underline"
                    >
                      View Location on Google Maps
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Report & Track */}
      {activeTab === 'report' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className={`lg:col-span-7 ${cardSurface} p-6 sm:p-8`}>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Submit Citizen Regulatory Complaint
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Report counterfeit batches, expired medicine sales, or overpricing directly to DGDA regulators.
            </p>

            {submittedComplaint && (
              <div
                role="status"
                className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                  Complaint Submitted Successfully
                </div>
                <p className="mt-1">
                  Your tracking ID is{' '}
                  <span className="font-mono font-bold">{submittedComplaint.complaintId}</span>. Use this ID in the tracker panel to check DGDA updates.
                </p>
              </div>
            )}

            {submitError && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
              >
                {submitError}
              </div>
            )}

            <form onSubmit={handleComplaintSubmit} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="complaint-pharmacy-id"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Pharmacy ID
                  </label>
                  {allPharmacies.length > 0 ? (
                    <select
                      id="complaint-pharmacy-id"
                      required
                      value={reportPharmacyId}
                      onChange={(e) => setReportPharmacyId(e.target.value)}
                      className={inputFieldClass}
                    >
                      {allPharmacies.map((p) => (
                        <option key={p.entityId} value={p.entityId}>
                          {p.entityId} — {p.organizationName} ({p.area})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="complaint-pharmacy-id"
                      type="text"
                      required
                      value={reportPharmacyId}
                      onChange={(e) => setReportPharmacyId(e.target.value.toUpperCase())}
                      placeholder="e.g., DSC_01"
                      className={`${inputFieldClass} font-mono placeholder:font-sans`}
                    />
                  )}
                </div>

                <div>
                  <label
                    htmlFor="complaint-batch-id"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Batch Number (optional)
                  </label>
                  <input
                    id="complaint-batch-id"
                    type="text"
                    value={reportBatchId}
                    onChange={(e) => setReportBatchId(e.target.value.toUpperCase())}
                    placeholder="CPA-ATB-P001-1028"
                    className={`${inputFieldClass} font-mono placeholder:font-sans`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="complaint-name"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Your Full Name
                  </label>
                  <input
                    id="complaint-name"
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Full name"
                    className={inputFieldClass}
                  />
                </div>

                <div>
                  <label
                    htmlFor="complaint-contact"
                    className="block text-sm font-medium text-slate-700 mb-1.5"
                  >
                    Contact Number or Email
                  </label>
                  <input
                    id="complaint-contact"
                    type="text"
                    required
                    value={customerContact}
                    onChange={(e) => setCustomerContact(e.target.value)}
                    placeholder="+8801..."
                    className={inputFieldClass}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="complaint-issue"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Issue Category
                </label>
                <select
                  id="complaint-issue"
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value as ComplaintIssueType)}
                  className={inputFieldClass}
                >
                  {COMPLAINT_ISSUE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="complaint-description"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Incident Description
                </label>
                <textarea
                  id="complaint-description"
                  required
                  rows={3}
                  maxLength={300}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the issue clearly (pricing discrepancy, expiry date, suspected counterfeit packaging)..."
                  className={inputFieldClass}
                />
              </div>

              <button
                type="submit"
                disabled={submitLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#115E59] focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:opacity-60 transition-all"
              >
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                {submitLoading ? 'Submitting...' : 'Submit Complaint'}
              </button>
            </form>
          </div>

          <div className={`lg:col-span-5 ${cardSurface} p-6 sm:p-8`}>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Track Complaint Status
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Check real-time DGDA investigation progress using your reference ID.
            </p>

            <form onSubmit={handleTrackSubmit} className="mt-5 flex gap-2">
              <label htmlFor="track-complaint-id" className="sr-only">
                Complaint ID
              </label>
              <input
                id="track-complaint-id"
                type="text"
                required
                value={trackIdInput}
                onChange={(e) => setTrackIdInput(e.target.value.toUpperCase())}
                placeholder="e.g., CPM001"
                className={`flex-1 ${inputFieldClass} font-mono placeholder:font-sans`}
              />
              <button
                type="submit"
                disabled={trackLoading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:opacity-60 transition-all whitespace-nowrap"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                {trackLoading ? 'Finding...' : 'Track'}
              </button>
            </form>

            {trackError && (
              <div
                role="alert"
                className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
              >
                {trackError}
              </div>
            )}

            {trackedComplaint ? (
              <div className="mt-6 space-y-4 border-t border-slate-100 pt-5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <MonoIdBadge>{trackedComplaint.complaintId}</MonoIdBadge>
                  <ComplaintStatusBadge status={trackedComplaint.status} />
                </div>

                <dl className="space-y-3">
                  <div>
                    <dt className="text-xs text-slate-500">Pharmacy</dt>
                    <dd className="font-medium text-slate-900">
                      {trackedComplaint.pharmacyName || trackedComplaint.pharmacyId}{' '}
                      <span className="font-mono text-xs text-slate-500">
                        ({trackedComplaint.pharmacyId})
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Issue Type</dt>
                    <dd className="text-slate-900">{trackedComplaint.issueType}</dd>
                  </div>
                  {trackedComplaint.batchId && (
                    <div>
                      <dt className="text-xs text-slate-500">Referenced Batch</dt>
                      <dd className="mt-0.5">
                        <MonoIdBadge>{trackedComplaint.batchId}</MonoIdBadge>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-slate-500">Description</dt>
                    <dd className="text-slate-700">{trackedComplaint.description}</dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200/80">
                    <dt className="text-xs font-medium text-slate-500">Official DGDA Remarks</dt>
                    <dd className="mt-1 text-slate-900">{trackedComplaint.officialRemarks}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="mt-8 rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                Enter a complaint reference ID such as <span className="font-mono text-slate-700">CPM001</span> to inspect current DGDA status.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
