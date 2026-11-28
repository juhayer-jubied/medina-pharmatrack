import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Bell,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileWarning,
  Layers,
  LayoutDashboard,
  MapPin,
  PackageCheck,
  Phone,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Store,
  XCircle,
} from 'lucide-react';
import {
  api,
  type RegulatorBatchView,
  type RegulatorCompanyView,
  type RegulatorPharmacyView,
  type RegulatorSummary,
} from '../lib/api';
import {
  NOTIFICATION_CATEGORIES,
  type ComplaintRecord,
  type NotificationCategory,
  type NotificationRecord,
  type NotificationTargetType,
  type PublicUser,
} from '../lib/pharmaLogic';
import { DashboardShell, type SidebarNavItem } from './DashboardShell';
import { SlideOverDrawer } from './SlideOverDrawer';
import {
  BatchApprovalStatusBadge,
  BatchStatusBadge,
  ComplaintStatusBadge,
  MonoIdBadge,
  PharmacyApprovalStatusBadge,
} from './StatusBadge';

interface RegulatorDashboardProps {
  user: PublicUser;
}

type RegulatorNavTab =
  | 'overview'
  | 'approvals'
  | 'pharmacy-approvals'
  | 'batches'
  | 'complaints'
  | 'notifications';

export function RegulatorDashboard({ user }: RegulatorDashboardProps) {
  const [activeNav, setActiveNav] = useState<RegulatorNavTab>('overview');
  const [batches, setBatches] = useState<RegulatorBatchView[]>([]);
  const [companies, setCompanies] = useState<RegulatorCompanyView[]>([]);
  const [pharmacies, setPharmacies] = useState<RegulatorPharmacyView[]>([]);
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [summary, setSummary] = useState<RegulatorSummary>({
    totalBatches: 0,
    pendingApprovals: 0,
    approvedBatches: 0,
    rejectedBatches: 0,
    recalledBatches: 0,
    pendingComplaints: 0,
    pendingPharmacyApprovals: 0,
    approvedPharmacies: 0,
    rejectedPharmacies: 0,
    registeredManufacturers: 0,
    registeredPharmacies: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [approvalFilter, setApprovalFilter] = useState<'All' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'>('All');
  const [pharmacyApprovalFilter, setPharmacyApprovalFilter] = useState<'All' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED'>('All');
  const [batchFilter, setBatchFilter] = useState<string>('All');
  const [complaintFilter, setComplaintFilter] = useState<string>('All');

  // Slide-over drawer targets
  const [approvalDrawerBatch, setApprovalDrawerBatch] = useState<RegulatorBatchView | null>(null);
  const [approvalRemarks, setApprovalRemarks] = useState('');

  const [approvalDrawerPharmacy, setApprovalDrawerPharmacy] = useState<RegulatorPharmacyView | null>(null);
  const [pharmacyApprovalRemarks, setPharmacyApprovalRemarks] = useState('');

  const [recallDrawerBatch, setRecallDrawerBatch] = useState<RegulatorBatchView | null>(null);
  const [recallReason, setRecallReason] = useState('');
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const [reviewDrawerComplaint, setReviewDrawerComplaint] = useState<ComplaintRecord | null>(null);
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [drawerError, setDrawerError] = useState<string | null>(null);

  // DGDA Notifications & Law Updates State
  const [noticeTargetType, setNoticeTargetType] = useState<NotificationTargetType>('EVERYONE');
  const [noticeTargetEntityId, setNoticeTargetEntityId] = useState('');
  const [noticeCategory, setNoticeCategory] = useState<NotificationCategory>('Law & Regulation');
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [noticeSending, setNoticeSending] = useState(false);
  const [noticeSuccess, setNoticeSuccess] = useState<string | null>(null);
  const [noticeError, setNoticeError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getRegulatorDashboard();
      setBatches(data.batches);
      setCompanies(data.companies || []);
      setPharmacies(data.pharmacies || []);
      setComplaints(data.complaints);
      setNotifications(data.notifications || []);
      setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load DGDA regulator console.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  async function handleToggleRecall(batchId: string, recall: boolean, reason?: string) {
    setActionBusyId(batchId);
    setError(null);
    setDrawerError(null);
    try {
      await api.toggleBatchRecall(batchId, recall, reason);
      setRecallDrawerBatch(null);
      setRecallReason('');
      await loadDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update batch recall status.';
      setError(msg);
      setDrawerError(msg);
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleComplaintDecision(
    complaintId: string,
    status: 'Resolved' | 'Dismissed'
  ) {
    if (!reviewRemarks.trim()) {
      setDrawerError('Please enter official DGDA remarks before updating complaint status.');
      return;
    }
    setActionBusyId(complaintId);
    setError(null);
    setDrawerError(null);
    try {
      await api.updateComplaintStatus(complaintId, status, reviewRemarks.trim());
      setReviewDrawerComplaint(null);
      setReviewRemarks('');
      await loadDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update complaint.';
      setError(msg);
      setDrawerError(msg);
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleBatchApprovalDecision(
    batchId: string,
    approvalStatus: 'APPROVED' | 'REJECTED'
  ) {
    setActionBusyId(batchId);
    setError(null);
    setDrawerError(null);
    try {
      await api.updateBatchApproval(batchId, approvalStatus, approvalRemarks.trim());
      setApprovalDrawerBatch(null);
      setApprovalRemarks('');
      await loadDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update batch approval.';
      setError(msg);
      setDrawerError(msg);
    } finally {
      setActionBusyId(null);
    }
  }

  async function handlePharmacyApprovalDecision(
    entityId: string,
    approvalStatus: 'APPROVED' | 'REJECTED'
  ) {
    setActionBusyId(entityId);
    setError(null);
    setDrawerError(null);
    try {
      await api.updatePharmacyApproval(entityId, approvalStatus, pharmacyApprovalRemarks.trim());
      setApprovalDrawerPharmacy(null);
      setPharmacyApprovalRemarks('');
      await loadDashboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update pharmacy approval.';
      setError(msg);
      setDrawerError(msg);
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleSendNotification(e: FormEvent) {
    e.preventDefault();
    setNoticeError(null);
    setNoticeSuccess(null);
    setNoticeSending(true);
    try {
      const res = await api.sendRegulatorNotification({
        title: noticeTitle,
        message: noticeMessage,
        category: noticeCategory,
        targetType: noticeTargetType,
        ...(noticeTargetType === 'INDIVIDUAL' ? { targetEntityId: noticeTargetEntityId } : {}),
      });
      setNoticeSuccess(`Notification ${res.notification.notificationId} issued successfully.`);
      setNoticeTitle('');
      setNoticeMessage('');
      await loadDashboard();
    } catch (err) {
      setNoticeError(err instanceof Error ? err.message : 'Failed to send notification.');
    } finally {
      setNoticeSending(false);
    }
  }

  const filteredApprovalBatches = batches.filter(
    (b) =>
      approvalFilter === 'All' ||
      (b.approvalStatus || 'PENDING_APPROVAL') === approvalFilter
  );
  const filteredApprovalPharmacies = pharmacies.filter(
    (p) =>
      pharmacyApprovalFilter === 'All' ||
      (p.approvalStatus || 'PENDING_APPROVAL') === pharmacyApprovalFilter
  );
  const filteredBatches = batches.filter(
    (b) => batchFilter === 'All' || b.status === batchFilter
  );
  const filteredComplaints = complaints.filter(
    (c) => complaintFilter === 'All' || c.status === complaintFilter
  );

  const navItems: SidebarNavItem[] = [
    { id: 'overview', label: 'Regulatory Overview', icon: LayoutDashboard },
    {
      id: 'approvals',
      label: 'Production Approvals',
      icon: PackageCheck,
      count: summary.pendingApprovals,
    },
    {
      id: 'pharmacy-approvals',
      label: 'Pharmacy Licenses',
      icon: Store,
      count: summary.pendingPharmacyApprovals,
    },
    { id: 'batches', label: 'Batch Audit & Recalls', icon: Layers, count: batches.length },
    {
      id: 'complaints',
      label: 'Citizen Complaints',
      icon: FileWarning,
      count: summary.pendingComplaints,
    },
    {
      id: 'notifications',
      label: 'Notices & Alerts',
      icon: Bell,
      count: notifications.length,
    },
  ];

  const cardSurface =
    'rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_10px_-3px_rgba(15,23,42,0.06)] transition-all';
  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all';

  return (
    <DashboardShell
      user={user}
      roleLabel="DGDA Regulator"
      roleIcon={ShieldCheck}
      navItems={navItems}
      activeNavId={activeNav}
      onSelectNav={(id) => setActiveNav(id as RegulatorNavTab)}
      title={user.organizationName}
      subtitle="Audit nationwide pharmaceutical batches, enforce emergency recalls, and resolve citizen complaints."
    >
      {/* Top KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className={`${cardSurface} hover:border-teal-300 p-5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">Pending Batches</span>
            <Clock className="h-4 w-4 text-amber-600" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
            {summary.pendingApprovals}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {summary.approvedBatches} approved · {summary.rejectedBatches} rejected
          </div>
        </div>

        <div className={`${cardSurface} hover:border-teal-300 p-5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">Pending Pharmacies</span>
            <Store className="h-4 w-4 text-amber-600" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
            {summary.pendingPharmacyApprovals}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {summary.approvedPharmacies} verified · {summary.rejectedPharmacies} rejected
          </div>
        </div>

        <div className={`${cardSurface} hover:border-teal-300 p-5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">Registered Batches</span>
            <Layers className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {summary.totalBatches}
          </div>
        </div>

        <div className={`${cardSurface} hover:border-teal-300 p-5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">Active Recalls</span>
            <ShieldAlert className="h-4 w-4 text-rose-600" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-rose-700 tabular-nums">
            {summary.recalledBatches}
          </div>
        </div>

        <div className={`${cardSurface} hover:border-teal-300 p-5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">Citizen Complaints</span>
            <FileWarning className="h-4 w-4 text-slate-500" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {summary.pendingComplaints}
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {/* Production Batches Approval & Clearance Console */}
      {(activeNav === 'overview' || activeNav === 'approvals') && (
        <section className={`${cardSurface} p-6`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                  New Production Approvals &amp; Market Clearance
                </h2>
                {summary.pendingApprovals > 0 && (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                    {summary.pendingApprovals} Pending
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500">
                Pharmaceutical companies cannot supply or market any production batch until DGDA grants compliance clearance.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'All', label: 'All Batches' },
                  { id: 'PENDING_APPROVAL', label: `Pending (${summary.pendingApprovals})` },
                  { id: 'APPROVED', label: `Approved (${summary.approvedBatches})` },
                  { id: 'REJECTED', label: `Rejected (${summary.rejectedBatches})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setApprovalFilter(tab.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
                    approvalFilter === tab.id
                      ? 'bg-[#0F766E] text-white shadow-xs font-semibold'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading production approvals...</div>
          ) : filteredApprovalBatches.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No production batches found for this filter.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500 whitespace-nowrap">
                    <th className="py-3 px-3">Batch ID</th>
                    <th className="py-3 px-3">Medicine &amp; Group</th>
                    <th className="py-3 px-3">Manufacturer</th>
                    <th className="py-3 px-3 text-right">Volume &amp; Price</th>
                    <th className="py-3 px-3">Mfg / Expiry</th>
                    <th className="py-3 px-3">DGDA Approval</th>
                    <th className="py-3 px-3 min-w-[260px]">Compliance Remarks</th>
                    <th className="py-3 px-3 text-right">Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredApprovalBatches.map((b) => {
                    const isPending = (b.approvalStatus || 'PENDING_APPROVAL') === 'PENDING_APPROVAL';
                    const remarkText = b.approvalRemarks || 'Awaiting DGDA compliance inspection.';
                    return (
                      <tr
                        key={b.batchId}
                        className="even:bg-slate-50/50 hover:bg-teal-50/30 align-middle transition-colors"
                      >
                        <td className="py-3 px-3 whitespace-nowrap">
                          <MonoIdBadge>{b.batchId}</MonoIdBadge>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-medium text-slate-900">{b.medicineName}</div>
                          <div className="text-xs text-slate-500">{b.drugGroup}</div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="text-slate-900 font-medium">{b.manufacturerName}</div>
                          <div className="font-mono text-xs text-slate-500">{b.manufacturerId}</div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                          <div className="font-semibold text-slate-900">{b.totalQuantity.toLocaleString()} pcs</div>
                          <div className="text-slate-500">৳{b.unitPrice.toFixed(2)}/unit</div>
                        </td>
                        <td className="py-3 px-3 font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                          <div>{b.productionDate}</div>
                          <div className="text-slate-400">Exp {b.expiryDate}</div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <BatchApprovalStatusBadge status={b.approvalStatus} />
                        </td>
                        <td className="py-3 px-3 min-w-[260px] max-w-[340px] text-xs text-slate-600">
                          <p
                            title={remarkText}
                            className="line-clamp-2 leading-relaxed"
                          >
                            {remarkText}
                          </p>
                          {b.approvedBy && (
                            <div
                              title={`By ${b.approvedBy}`}
                              className="mt-0.5 truncate text-[11px] text-slate-400"
                            >
                              By {b.approvedBy}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {isPending ? (
                            <button
                              type="button"
                              disabled={actionBusyId === b.batchId}
                              onClick={() => {
                                setDrawerError(null);
                                setApprovalRemarks('Tested against national pharmacopeia standards. Approved for market distribution.');
                                setApprovalDrawerBatch(b);
                              }}
                              className="inline-flex items-center gap-1 rounded-xl bg-[#0F766E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#115E59] transition-all whitespace-nowrap shadow-2xs"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Review &amp; Decide
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setDrawerError(null);
                                setApprovalRemarks(b.approvalRemarks || '');
                                setApprovalDrawerBatch(b);
                              }}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all whitespace-nowrap"
                            >
                              Edit Decision
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Pharmacy License Verification & Registration Approvals Console */}
      {(activeNav === 'overview' || activeNav === 'pharmacy-approvals') && (
        <section className={`${cardSurface} p-6`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                  Pharmacy Drug License Verification &amp; Approvals
                </h2>
                {summary.pendingPharmacyApprovals > 0 && (
                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                    {summary.pendingPharmacyApprovals} Pending Verification
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500">
                New retail pharmacies require DGDA verification of their Drug License ID before they can log in, receive medicine consignments, or appear in public search.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'All', label: 'All Pharmacies' },
                  { id: 'PENDING_APPROVAL', label: `Pending (${summary.pendingPharmacyApprovals})` },
                  { id: 'APPROVED', label: `Approved (${summary.approvedPharmacies})` },
                  { id: 'REJECTED', label: `Rejected (${summary.rejectedPharmacies})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setPharmacyApprovalFilter(tab.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
                    pharmacyApprovalFilter === tab.id
                      ? 'bg-[#0F766E] text-white shadow-xs font-semibold'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading pharmacy registrations...</div>
          ) : filteredApprovalPharmacies.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No pharmacies found for this filter.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500 whitespace-nowrap">
                    <th className="py-3 px-3">Drug License ID</th>
                    <th className="py-3 px-3">Pharmacy Name</th>
                    <th className="py-3 px-3">Proprietor / Owner</th>
                    <th className="py-3 px-3">Area &amp; Location</th>
                    <th className="py-3 px-3">Contact</th>
                    <th className="py-3 px-3">DGDA Status</th>
                    <th className="py-3 px-3 min-w-[260px]">Inspection Remarks</th>
                    <th className="py-3 px-3 text-right">Verification Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredApprovalPharmacies.map((p) => {
                    const isPending = (p.approvalStatus || 'PENDING_APPROVAL') === 'PENDING_APPROVAL';
                    const remarkText = p.approvalRemarks || 'Pending DGDA drug license verification.';
                    return (
                      <tr
                        key={p.entityId}
                        className="even:bg-slate-50/50 hover:bg-teal-50/30 align-middle transition-colors"
                      >
                        <td className="py-3 px-3 whitespace-nowrap">
                          <MonoIdBadge>{p.entityId}</MonoIdBadge>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-semibold text-slate-900">{p.organizationName}</div>
                          <div className="font-mono text-xs text-slate-400">ID: {p.entityId}</div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="text-slate-800 font-medium">{p.ownerName}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="inline-flex items-center gap-1 text-slate-800 whitespace-nowrap">
                            <MapPin className="h-3.5 w-3.5 text-teal-600 shrink-0" aria-hidden="true" />
                            <span className="font-medium">{p.area || 'N/A'}</span>
                          </div>
                          <div className="text-xs text-slate-500 max-w-[200px] truncate">{p.address}</div>
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-700 whitespace-nowrap">
                          <div className="flex items-center gap-1 font-mono">
                            <Phone className="h-3 w-3 text-slate-400" aria-hidden="true" />
                            <span>{p.contact || 'N/A'}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <PharmacyApprovalStatusBadge status={p.approvalStatus} />
                        </td>
                        <td className="py-3 px-3 min-w-[260px] max-w-[340px] text-xs text-slate-600">
                          <p
                            title={remarkText}
                            className="line-clamp-2 leading-relaxed"
                          >
                            {remarkText}
                          </p>
                          {p.approvedBy && (
                            <div
                              title={`By ${p.approvedBy}`}
                              className="mt-0.5 truncate text-[11px] text-slate-400"
                            >
                              By {p.approvedBy}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {isPending ? (
                            <button
                              type="button"
                              disabled={actionBusyId === p.entityId}
                              onClick={() => {
                                setDrawerError(null);
                                setPharmacyApprovalRemarks(
                                  'Drug License verified against DGDA national registry. Pharmacy authorized to operate.'
                                );
                                setApprovalDrawerPharmacy(p);
                              }}
                              className="inline-flex items-center gap-1 rounded-xl bg-[#0F766E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#115E59] transition-all whitespace-nowrap shadow-2xs"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                              Verify License
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setDrawerError(null);
                                setPharmacyApprovalRemarks(p.approvalRemarks || '');
                                setApprovalDrawerPharmacy(p);
                              }}
                              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all whitespace-nowrap"
                            >
                              Edit Decision
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Nationwide Batch Audit Table */}
      {(activeNav === 'overview' || activeNav === 'batches') && (
        <section className={`${cardSurface} p-6`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                Nationwide Batch Audit &amp; Emergency Recall
              </h2>
              <p className="text-sm text-slate-500">
                Issue or lift immediate DGDA recalls. Recalled batches are blocked across dispatch, POS, and verification.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['All', 'AUTHENTIC', 'EXPIRED', 'RECALLED'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setBatchFilter(status)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
                    batchFilter === status
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading nationwide batches...</div>
          ) : filteredBatches.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No batches match the current filter.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500 whitespace-nowrap">
                    <th className="py-3 px-3">Batch ID</th>
                    <th className="py-3 px-3">Medicine</th>
                    <th className="py-3 px-3">Manufacturer</th>
                    <th className="py-3 px-3 text-right">Prod / Sold</th>
                    <th className="py-3 px-3">Expiry</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBatches.map((b) => (
                    <tr
                      key={b.batchId}
                      className="even:bg-slate-50/50 hover:bg-teal-50/30 align-middle transition-colors"
                    >
                      <td className="py-3 px-3 whitespace-nowrap">
                        <MonoIdBadge>{b.batchId}</MonoIdBadge>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-medium text-slate-900">{b.medicineName}</div>
                        <div className="text-xs text-slate-500">{b.drugGroup}</div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="text-slate-900">{b.manufacturerName}</div>
                        <div className="font-mono text-xs text-slate-500">{b.manufacturerId}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                        {b.totalQuantity} / {b.soldQty} pcs
                      </td>
                      <td className="py-3 px-3 font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                        {b.expiryDate}
                      </td>
                      <td className="py-3 px-3">
                        <BatchStatusBadge status={b.status} />
                        {b.isRecalled && b.recallReason && (
                          <p title={b.recallReason} className="mt-1 max-w-xs line-clamp-1 text-xs text-rose-700">
                            {b.recallReason}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        {b.isRecalled ? (
                          <button
                            type="button"
                            disabled={actionBusyId === b.batchId}
                            onClick={() => void handleToggleRecall(b.batchId, false)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all whitespace-nowrap"
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            Lift Recall
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setDrawerError(null);
                              setRecallReason('');
                              setRecallDrawerBatch(b);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-all whitespace-nowrap"
                          >
                            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                            Emergency Recall
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Citizen Complaints Review Table */}
      {(activeNav === 'overview' || activeNav === 'complaints') && (
        <section className={`${cardSurface} p-6`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                Citizen Complaints Review
              </h2>
              <p className="text-sm text-slate-500">
                Inspect public reports and mark as Resolved or Dismissed with official DGDA remarks.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['All', 'Pending', 'Resolved', 'Dismissed'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setComplaintFilter(status)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
                    complaintFilter === status
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading complaints...</div>
          ) : filteredComplaints.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No complaints match the selected filter.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500 whitespace-nowrap">
                    <th className="py-3 px-3">Complaint ID</th>
                    <th className="py-3 px-3">Pharmacy</th>
                    <th className="py-3 px-3 min-w-[260px]">Issue &amp; Details</th>
                    <th className="py-3 px-3">Citizen</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredComplaints.map((c) => (
                    <tr
                      key={c.complaintId}
                      className="even:bg-slate-50/50 hover:bg-teal-50/30 align-middle transition-colors"
                    >
                      <td className="py-3 px-3 whitespace-nowrap">
                        <MonoIdBadge>{c.complaintId}</MonoIdBadge>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-medium text-slate-900">
                          {c.pharmacyName || c.pharmacyId}
                        </div>
                        <div className="font-mono text-xs text-slate-500">{c.pharmacyId}</div>
                      </td>
                      <td className="py-3 px-3 min-w-[260px] max-w-[360px]">
                        <div className="font-medium text-slate-900">
                          {c.issueType}
                          {c.batchId && (
                            <span className="ml-2 font-mono text-xs text-slate-500">
                              ({c.batchId})
                            </span>
                          )}
                        </div>
                        <p title={c.description} className="mt-0.5 line-clamp-1 text-xs text-slate-600">
                          {c.description}
                        </p>
                        <p title={c.officialRemarks} className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                          Remarks: {c.officialRemarks}
                        </p>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="text-slate-900">{c.customerName}</div>
                        <div className="font-mono text-xs text-slate-500">{c.customerContact}</div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <ComplaintStatusBadge status={c.status} />
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        {c.status === 'Pending' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDrawerError(null);
                              setReviewRemarks('');
                              setReviewDrawerComplaint(c);
                            }}
                            className="rounded-xl bg-[#0F766E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#115E59] transition-colors whitespace-nowrap"
                          >
                            Review Report
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Closed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* DGDA Notices, Alerts & Law Updates Broadcast Console */}
      {(activeNav === 'overview' || activeNav === 'notifications') && (
        <section className={`${cardSurface} p-6`}>
          <div className="pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                DGDA Notices, Alerts &amp; Law Updates
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Send regulatory law updates, urgent compliance alerts, or official notices to a specific company/pharmacy, all companies, all pharmacies, or the public portal.
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Compose Notice Form */}
            <form onSubmit={handleSendNotification} className="lg:col-span-5 space-y-4">
              {noticeSuccess && (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800"
                >
                  {noticeSuccess}
                </div>
              )}
              {noticeError && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800"
                >
                  {noticeError}
                </div>
              )}

              <div>
                <label
                  htmlFor="notice-recipient-scope"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Recipient Audience
                </label>
                <select
                  id="notice-recipient-scope"
                  value={noticeTargetType}
                  onChange={(e) => {
                    const next = e.target.value as NotificationTargetType;
                    setNoticeTargetType(next);
                    if (next === 'INDIVIDUAL' && !noticeTargetEntityId) {
                      const first = companies[0]?.entityId || pharmacies[0]?.entityId || '';
                      setNoticeTargetEntityId(first);
                    }
                  }}
                  className={inputClass}
                >
                  <option value="EVERYONE">Everyone (Public, All Companies &amp; All Pharmacies)</option>
                  <option value="PUBLIC">Public Portal Users Only</option>
                  <option value="ALL_COMPANIES">All Registered Companies</option>
                  <option value="ALL_PHARMACIES">All Registered Pharmacies</option>
                  <option value="INDIVIDUAL">Individual Company or Pharmacy</option>
                </select>
              </div>

              {noticeTargetType === 'INDIVIDUAL' && (
                <div>
                  <label
                    htmlFor="notice-individual-entity"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Select Company or Pharmacy
                  </label>
                  <select
                    id="notice-individual-entity"
                    required
                    value={noticeTargetEntityId}
                    onChange={(e) => setNoticeTargetEntityId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">-- Choose Recipient --</option>
                    {companies.length > 0 && (
                      <optgroup label="Registered Companies">
                        {companies.map((c) => (
                          <option key={c.entityId} value={c.entityId}>
                            {c.organizationName} (Company ID: {c.entityId})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {pharmacies.length > 0 && (
                      <optgroup label="Registered Pharmacies">
                        {pharmacies.map((p) => (
                          <option key={p.entityId} value={p.entityId}>
                            {p.organizationName} (Pharmacy ID: {p.entityId})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              )}

              <div>
                <label
                  htmlFor="notice-category"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Notice Type / Category
                </label>
                <select
                  id="notice-category"
                  value={noticeCategory}
                  onChange={(e) => setNoticeCategory(e.target.value as NotificationCategory)}
                  className={inputClass}
                >
                  {NOTIFICATION_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="notice-title"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Notice Title
                </label>
                <input
                  id="notice-title"
                  type="text"
                  required
                  value={noticeTitle}
                  onChange={(e) => setNoticeTitle(e.target.value)}
                  placeholder="e.g., Updated DGDA Drug Packaging Regulation 2026"
                  className={inputClass}
                />
              </div>

              <div>
                <label
                  htmlFor="notice-message"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Message / Regulatory Directive
                </label>
                <textarea
                  id="notice-message"
                  required
                  rows={3}
                  value={noticeMessage}
                  onChange={(e) => setNoticeMessage(e.target.value)}
                  placeholder="Write the official notice, alert details, or law regulation update..."
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={noticeSending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#115E59] disabled:opacity-50 transition-all"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {noticeSending ? 'Sending Notice...' : 'Publish DGDA Notification'}
              </button>
            </form>

            {/* Sent Notifications History */}
            <div className="lg:col-span-7">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Published Notices &amp; Alerts ({notifications.length})
              </h3>
              {notifications.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
                  No notices or regulatory alerts have been published yet.
                </div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto rounded-xl border border-slate-200/80 divide-y divide-slate-100">
                  {notifications.map((n) => (
                    <div key={n.notificationId} className="p-4 hover:bg-slate-50/70 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <MonoIdBadge>{n.notificationId}</MonoIdBadge>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                              n.category === 'Urgent Alert'
                                ? 'border-rose-200 bg-rose-50 text-rose-700'
                                : n.category === 'Law & Regulation'
                                ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                : 'border-teal-200 bg-teal-50 text-[#0F766E]'
                            }`}
                          >
                            {n.category}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                            {n.targetType === 'INDIVIDUAL'
                              ? `${n.targetRole}: ${n.targetEntityName} (${n.targetEntityId})`
                              : n.targetType === 'ALL_COMPANIES'
                              ? 'All Companies'
                              : n.targetType === 'ALL_PHARMACIES'
                              ? 'All Pharmacies'
                              : n.targetType === 'PUBLIC'
                              ? 'Public Portal'
                              : 'Everyone'}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">
                          {new Date(n.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="mt-1.5 text-sm font-semibold text-slate-900">{n.title}</div>
                      <p className="mt-1 text-xs text-slate-600 leading-relaxed">{n.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Slide-Over Drawer: DGDA Batch Production Approval */}
      <SlideOverDrawer
        open={Boolean(approvalDrawerBatch)}
        onClose={() => setApprovalDrawerBatch(null)}
        title={
          approvalDrawerBatch
            ? `Production Clearance (${approvalDrawerBatch.batchId})`
            : 'Production Clearance'
        }
        subtitle="Review medicine production parameters and grant or deny commercial supply authorization."
      >
        {approvalDrawerBatch && (
          <div className="space-y-5">
            {drawerError && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {drawerError}
              </div>
            )}

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-sm space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900 text-base">
                  {approvalDrawerBatch.medicineName}
                </span>
                <MonoIdBadge>{approvalDrawerBatch.batchId}</MonoIdBadge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div>
                  <span className="text-slate-400">Drug Group: </span>
                  <span className="font-medium text-slate-800">{approvalDrawerBatch.drugGroup}</span>
                </div>
                <div>
                  <span className="text-slate-400">Manufacturer: </span>
                  <span className="font-medium text-slate-800">
                    {approvalDrawerBatch.manufacturerName} ({approvalDrawerBatch.manufacturerId})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Production Volume: </span>
                  <span className="font-mono font-medium text-slate-800">
                    {approvalDrawerBatch.totalQuantity.toLocaleString()} pcs
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Declared Unit Price: </span>
                  <span className="font-mono font-medium text-slate-800">
                    ৳{approvalDrawerBatch.unitPrice.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Production Date: </span>
                  <span className="font-mono font-medium text-slate-800">{approvalDrawerBatch.productionDate}</span>
                </div>
                <div>
                  <span className="text-slate-400">Expiry Date: </span>
                  <span className="font-mono font-medium text-slate-800">{approvalDrawerBatch.expiryDate}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-500">Current Status:</span>
                <BatchApprovalStatusBadge status={approvalDrawerBatch.approvalStatus} />
              </div>
            </div>

            <div>
              <label
                htmlFor="drawer-approval-remarks"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Official DGDA Regulatory Remarks &amp; Certification
              </label>
              <textarea
                id="drawer-approval-remarks"
                rows={3}
                value={approvalRemarks}
                onChange={(e) => setApprovalRemarks(e.target.value)}
                placeholder="e.g., Tested against national pharmacopeia standards. Approved for market distribution."
                className={inputClass}
              />
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={actionBusyId === approvalDrawerBatch.batchId}
                onClick={() =>
                  void handleBatchApprovalDecision(approvalDrawerBatch.batchId, 'APPROVED')
                }
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#115E59] disabled:opacity-50 transition-colors shadow-2xs"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {actionBusyId === approvalDrawerBatch.batchId ? 'Processing...' : 'Approve for Market Supply'}
              </button>
              <button
                type="button"
                disabled={actionBusyId === approvalDrawerBatch.batchId}
                onClick={() =>
                  void handleBatchApprovalDecision(approvalDrawerBatch.batchId, 'REJECTED')
                }
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-2xs"
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                {actionBusyId === approvalDrawerBatch.batchId ? 'Processing...' : 'Reject Production Batch'}
              </button>
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* Slide-Over Drawer: Pharmacy License Verification */}
      <SlideOverDrawer
        open={Boolean(approvalDrawerPharmacy)}
        onClose={() => setApprovalDrawerPharmacy(null)}
        title={
          approvalDrawerPharmacy
            ? `Verify Drug License: ${approvalDrawerPharmacy.organizationName}`
            : 'Verify Pharmacy License'
        }
        subtitle="Validate the retail pharmacy's official Drug License ID issued by DGDA before enabling portal access."
      >
        {approvalDrawerPharmacy && (
          <div className="space-y-5">
            {drawerError && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {drawerError}
              </div>
            )}

            <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 text-sm space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900 text-base">
                  {approvalDrawerPharmacy.organizationName}
                </span>
                <PharmacyApprovalStatusBadge status={approvalDrawerPharmacy.approvalStatus} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500">License / Entity ID:</span>
                  <div className="font-mono font-bold text-teal-900 text-sm mt-0.5">
                    {approvalDrawerPharmacy.entityId}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Owner / Proprietor:</span>
                  <div className="font-medium text-slate-800 mt-0.5">{approvalDrawerPharmacy.ownerName}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">Contact Number:</span>
                  <div className="font-medium text-slate-800 mt-0.5">{approvalDrawerPharmacy.contact || 'N/A'}</div>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">Physical Address:</span>
                  <div className="font-medium text-slate-800">
                    {approvalDrawerPharmacy.address}, Area: {approvalDrawerPharmacy.area || 'N/A'}
                  </div>
                </div>
                {approvalDrawerPharmacy.googleMapsUrl && (
                  <div className="col-span-2 pt-1">
                    <a
                      href={approvalDrawerPharmacy.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900 text-xs font-medium underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View on Google Maps
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="drawer-pharmacy-approval-remarks"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Official DGDA Regulatory Remarks
              </label>
              <textarea
                id="drawer-pharmacy-approval-remarks"
                rows={3}
                value={pharmacyApprovalRemarks}
                onChange={(e) => setPharmacyApprovalRemarks(e.target.value)}
                placeholder="e.g., Drug License verified against DGDA national registry. Pharmacy authorized to operate."
                className={inputClass}
              />
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={actionBusyId === approvalDrawerPharmacy.entityId}
                onClick={() =>
                  void handlePharmacyApprovalDecision(approvalDrawerPharmacy.entityId, 'APPROVED')
                }
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#115E59] disabled:opacity-50 transition-colors shadow-2xs"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {actionBusyId === approvalDrawerPharmacy.entityId ? 'Processing...' : 'Approve Pharmacy License'}
              </button>
              <button
                type="button"
                disabled={actionBusyId === approvalDrawerPharmacy.entityId}
                onClick={() =>
                  void handlePharmacyApprovalDecision(approvalDrawerPharmacy.entityId, 'REJECTED')
                }
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-2xs"
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                {actionBusyId === approvalDrawerPharmacy.entityId ? 'Processing...' : 'Reject Pharmacy Registration'}
              </button>
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* Slide-Over Drawer: Emergency Recall */}
      <SlideOverDrawer
        open={Boolean(recallDrawerBatch)}
        onClose={() => setRecallDrawerBatch(null)}
        title={
          recallDrawerBatch
            ? `Issue Emergency Recall (${recallDrawerBatch.batchId})`
            : 'Issue Emergency Recall'
        }
        subtitle="Immediately blocks pharmacy dispensing, manufacturer dispatch, and marks the batch RECALLED nationwide."
      >
        {recallDrawerBatch && (
          <div className="space-y-5">
            {drawerError && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {drawerError}
              </div>
            )}

            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-sm space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">
                  {recallDrawerBatch.medicineName}
                </span>
                <MonoIdBadge>{recallDrawerBatch.batchId}</MonoIdBadge>
              </div>
              <div className="text-xs text-slate-600">
                Manufacturer: {recallDrawerBatch.manufacturerName} ({recallDrawerBatch.manufacturerId})
              </div>
              <div className="text-xs text-slate-600 tabular-nums">
                Produced: {recallDrawerBatch.totalQuantity} pcs · Sold: {recallDrawerBatch.soldQty} pcs · Exp: {recallDrawerBatch.expiryDate}
              </div>
            </div>

            <div>
              <label
                htmlFor="drawer-recall-reason"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Regulatory Recall Reason (optional)
              </label>
              <textarea
                id="drawer-recall-reason"
                rows={3}
                value={recallReason}
                onChange={(e) => setRecallReason(e.target.value)}
                placeholder="e.g., Substandard active ingredient potency detected in DGDA lab inspection."
                className={inputClass}
              />
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setRecallDrawerBatch(null)}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusyId === recallDrawerBatch.batchId}
                onClick={() =>
                  void handleToggleRecall(recallDrawerBatch.batchId, true, recallReason)
                }
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                {actionBusyId === recallDrawerBatch.batchId
                  ? 'Recalling...'
                  : 'Confirm Recall'}
              </button>
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* Slide-Over Drawer: Citizen Complaint Review */}
      <SlideOverDrawer
        open={Boolean(reviewDrawerComplaint)}
        onClose={() => setReviewDrawerComplaint(null)}
        title={
          reviewDrawerComplaint
            ? `Review Complaint ${reviewDrawerComplaint.complaintId}`
            : 'Review Complaint'
        }
        subtitle="Record official DGDA regulatory findings and close or dismiss this report."
      >
        {reviewDrawerComplaint && (
          <div className="space-y-5">
            {drawerError && (
              <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {drawerError}
              </div>
            )}

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-sm space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <MonoIdBadge>{reviewDrawerComplaint.complaintId}</MonoIdBadge>
                <ComplaintStatusBadge status={reviewDrawerComplaint.status} />
              </div>
              <div>
                <span className="text-xs text-slate-500">Pharmacy: </span>
                <span className="font-medium text-slate-900">
                  {reviewDrawerComplaint.pharmacyName || reviewDrawerComplaint.pharmacyId} (
                  {reviewDrawerComplaint.pharmacyId})
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500">Issue: </span>
                <span className="font-medium text-slate-900">
                  {reviewDrawerComplaint.issueType}
                </span>
                {reviewDrawerComplaint.batchId && (
                  <span className="ml-2 font-mono text-xs text-slate-600">
                    [{reviewDrawerComplaint.batchId}]
                  </span>
                )}
              </div>
              <div>
                <span className="text-xs text-slate-500">Citizen: </span>
                <span className="text-slate-900">
                  {reviewDrawerComplaint.customerName} ({reviewDrawerComplaint.customerContact})
                </span>
              </div>
              <p className="border-t border-slate-200/80 pt-2 text-slate-700">
                {reviewDrawerComplaint.description}
              </p>
            </div>

            <div>
              <label
                htmlFor="drawer-dgda-remarks"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Official DGDA Remarks
              </label>
              <textarea
                id="drawer-dgda-remarks"
                rows={3}
                value={reviewRemarks}
                onChange={(e) => setReviewRemarks(e.target.value)}
                placeholder="Enter official inspection outcome and enforcement remarks..."
                className={inputClass}
              />
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={actionBusyId === reviewDrawerComplaint.complaintId}
                onClick={() =>
                  void handleComplaintDecision(reviewDrawerComplaint.complaintId, 'Resolved')
                }
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Resolve
              </button>
              <button
                type="button"
                disabled={actionBusyId === reviewDrawerComplaint.complaintId}
                onClick={() =>
                  void handleComplaintDecision(reviewDrawerComplaint.complaintId, 'Dismissed')
                }
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Dismiss
              </button>
            </div>
          </div>
        )}
      </SlideOverDrawer>
    </DashboardShell>
  );
}