import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Clock,
  FileWarning,
  Layers,
  LayoutDashboard,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  api,
  type RegulatorBatchView,
  type RegulatorSummary,
} from '../lib/api';
import type { ComplaintRecord, PublicUser } from '../lib/pharmaLogic';
import { DashboardShell, type SidebarNavItem } from './DashboardShell';
import { SlideOverDrawer } from './SlideOverDrawer';
import {
  BatchStatusBadge,
  ComplaintStatusBadge,
  MonoIdBadge,
} from './StatusBadge';

interface RegulatorDashboardProps {
  user: PublicUser;
}

type RegulatorNavTab = 'overview' | 'batches' | 'complaints';

export function RegulatorDashboard({ user }: RegulatorDashboardProps) {
  const [activeNav, setActiveNav] = useState<RegulatorNavTab>('overview');
  const [batches, setBatches] = useState<RegulatorBatchView[]>([]);
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [summary, setSummary] = useState<RegulatorSummary>({
    totalBatches: 0,
    recalledBatches: 0,
    pendingComplaints: 0,
    registeredManufacturers: 0,
    registeredPharmacies: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [batchFilter, setBatchFilter] = useState<string>('All');
  const [complaintFilter, setComplaintFilter] = useState<string>('All');

  // Slide-over drawer targets
  const [recallDrawerBatch, setRecallDrawerBatch] = useState<RegulatorBatchView | null>(null);
  const [recallReason, setRecallReason] = useState('');
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const [reviewDrawerComplaint, setReviewDrawerComplaint] = useState<ComplaintRecord | null>(null);
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [drawerError, setDrawerError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getRegulatorDashboard();
      setBatches(data.batches);
      setComplaints(data.complaints);
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

  const filteredBatches = batches.filter(
    (b) => batchFilter === 'All' || b.status === batchFilter
  );
  const filteredComplaints = complaints.filter(
    (c) => complaintFilter === 'All' || c.status === complaintFilter
  );

  const navItems: SidebarNavItem[] = [
    { id: 'overview', label: 'Regulatory Overview', icon: LayoutDashboard },
    { id: 'batches', label: 'Batch Audit & Recalls', icon: Layers, count: batches.length },
    {
      id: 'complaints',
      label: 'Citizen Complaints',
      icon: FileWarning,
      count: summary.pendingComplaints,
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
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className={`${cardSurface} hover:border-teal-300 p-5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">Total Batches</span>
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
            <span className="text-xs font-medium text-slate-500">Pending Audits</span>
            <Clock className="h-4 w-4 text-amber-600" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
            {summary.pendingComplaints}
          </div>
        </div>

        <div className={`${cardSurface} hover:border-teal-300 p-5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">Registered Entities</span>
            <Building2 className="h-4 w-4 text-slate-500" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {summary.registeredManufacturers + summary.registeredPharmacies}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {summary.registeredManufacturers} Mfg · {summary.registeredPharmacies} Pharmacies
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
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
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-2.5">Batch ID</th>
                    <th className="py-3 px-2.5">Medicine</th>
                    <th className="py-3 px-2.5">Manufacturer</th>
                    <th className="py-3 px-2.5 text-right">Prod / Sold</th>
                    <th className="py-3 px-2.5">Expiry</th>
                    <th className="py-3 px-2.5">Status</th>
                    <th className="py-3 px-2.5 text-right">Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBatches.map((b) => (
                    <tr
                      key={b.batchId}
                      className="even:bg-slate-50/50 hover:bg-teal-50/30 align-top transition-colors"
                    >
                      <td className="py-3 px-2.5 whitespace-nowrap">
                        <MonoIdBadge>{b.batchId}</MonoIdBadge>
                      </td>
                      <td className="py-3 px-2.5">
                        <div className="font-medium text-slate-900">{b.medicineName}</div>
                        <div className="text-xs text-slate-500">{b.drugGroup}</div>
                      </td>
                      <td className="py-3 px-2.5">
                        <div className="text-slate-900">{b.manufacturerName}</div>
                        <div className="font-mono text-xs text-slate-500">{b.manufacturerId}</div>
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                        {b.totalQuantity} / {b.soldQty} pcs
                      </td>
                      <td className="py-3 px-2.5 font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                        {b.expiryDate}
                      </td>
                      <td className="py-3 px-3">
                        <BatchStatusBadge status={b.status} />
                        {b.isRecalled && b.recallReason && (
                          <p className="mt-1.5 max-w-xs text-xs text-rose-700">{b.recallReason}</p>
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
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-3">Complaint ID</th>
                    <th className="py-3 px-3">Pharmacy</th>
                    <th className="py-3 px-3">Issue &amp; Details</th>
                    <th className="py-3 px-3">Citizen</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredComplaints.map((c) => (
                    <tr
                      key={c.complaintId}
                      className="even:bg-slate-50/50 hover:bg-teal-50/30 align-top transition-colors"
                    >
                      <td className="py-3 px-3 whitespace-nowrap">
                        <MonoIdBadge>{c.complaintId}</MonoIdBadge>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-900">
                          {c.pharmacyName || c.pharmacyId}
                        </div>
                        <div className="font-mono text-xs text-slate-500">{c.pharmacyId}</div>
                      </td>
                      <td className="py-3 px-3 max-w-sm">
                        <div className="font-medium text-slate-900">
                          {c.issueType}
                          {c.batchId && (
                            <span className="ml-2 font-mono text-xs text-slate-500">
                              ({c.batchId})
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-600">{c.description}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Remarks: {c.officialRemarks}
                        </p>
                      </td>
                      <td className="py-3 px-3">
                        <div className="text-slate-900">{c.customerName}</div>
                        <div className="font-mono text-xs text-slate-500">{c.customerContact}</div>
                      </td>
                      <td className="py-3 px-3">
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
