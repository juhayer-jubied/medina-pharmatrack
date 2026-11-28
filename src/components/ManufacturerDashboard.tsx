import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Boxes,
  Building2,
  CheckCircle2,
  Factory,
  LayoutDashboard,
  PackageCheck,
  PackagePlus,
  Send,
  TrendingUp,
} from 'lucide-react';
import {
  api,
  type ManufacturerBatchView,
  type ManufacturerDispatchView,
} from '../lib/api';
import {
  DRUG_GROUPS,
  getTodayISODate,
  type DrugGroup,
  type PublicUser,
} from '../lib/pharmaLogic';
import { DashboardShell, type SidebarNavItem } from './DashboardShell';
import { SlideOverDrawer } from './SlideOverDrawer';
import { BatchApprovalStatusBadge, BatchStatusBadge, MonoIdBadge } from './StatusBadge';

interface ManufacturerDashboardProps {
  user: PublicUser;
}

type MfgNavTab = 'overview' | 'batches' | 'dispatches' | 'pharmacies';

export function ManufacturerDashboard({ user }: ManufacturerDashboardProps) {
  const [activeNav, setActiveNav] = useState<MfgNavTab>('overview');
  const [batches, setBatches] = useState<ManufacturerBatchView[]>([]);
  const [dispatches, setDispatches] = useState<ManufacturerDispatchView[]>([]);
  const [pharmacies, setPharmacies] = useState<
    Array<{ entityId: string; organizationName: string; area: string; contact: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Slide-over drawer state
  const [drawerMode, setDrawerMode] = useState<'batch' | 'dispatch' | null>(null);

  // Production entry form
  const [medicineName, setMedicineName] = useState('');
  const [drugGroup, setDrugGroup] = useState<DrugGroup>('Paracetamol');
  const [totalQuantity, setTotalQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [productionDate, setProductionDate] = useState(getTodayISODate());
  const [expiryDate, setExpiryDate] = useState('');
  const [prodLoading, setProdLoading] = useState(false);
  const [prodError, setProdError] = useState<string | null>(null);
  const [createdBatch, setCreatedBatch] = useState<ManufacturerBatchView | null>(null);

  // Dispatch form
  const [dispatchBatchId, setDispatchBatchId] = useState('');
  const [dispatchPharmacyId, setDispatchPharmacyId] = useState('');
  const [dispatchQuantity, setDispatchQuantity] = useState('');
  const [supplyDate, setSupplyDate] = useState(getTodayISODate());
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getManufacturerDashboard();
      setBatches(data.batches);
      setDispatches(data.dispatches);
      setPharmacies(data.pharmacies);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  function openBatchDrawer() {
    setProdError(null);
    setCreatedBatch(null);
    setDrawerMode('batch');
  }

  function openDispatchDrawer(preselectedBatchId?: string) {
    setDispatchError(null);
    setDispatchSuccess(null);
    if (preselectedBatchId) {
      setDispatchBatchId(preselectedBatchId);
    }
    setDrawerMode('dispatch');
  }

  async function handleCreateBatch(e: FormEvent) {
    e.preventDefault();
    setProdError(null);
    setCreatedBatch(null);
    if (expiryDate <= productionDate) {
      setProdError('Expiry date must be strictly later than production date.');
      return;
    }
    setProdLoading(true);
    try {
      const res = await api.createProductionBatch({
        medicineName,
        drugGroup,
        totalQuantity: Number(totalQuantity),
        unitPrice: Number(unitPrice),
        productionDate,
        expiryDate,
      });
      setCreatedBatch(res.batch);
      setDispatchBatchId(res.batch.batchId);
      setMedicineName('');
      setTotalQuantity('');
      setUnitPrice('');
      setExpiryDate('');
      await loadDashboard();
    } catch (err) {
      setProdError(err instanceof Error ? err.message : 'Unable to register batch.');
    } finally {
      setProdLoading(false);
    }
  }

  async function handleDispatch(e: FormEvent) {
    e.preventDefault();
    setDispatchError(null);
    setDispatchSuccess(null);
    setDispatchLoading(true);
    try {
      const res = await api.dispatchSupply({
        batchId: dispatchBatchId,
        pharmacyId: dispatchPharmacyId,
        quantity: Number(dispatchQuantity),
        supplyDate,
      });
      setDispatchSuccess(
        `Dispatched ${res.dispatch.quantity} pcs of ${res.dispatch.batchId} to ${res.dispatch.pharmacyName} (${res.dispatch.supplyId}).`
      );
      setDispatchQuantity('');
      await loadDashboard();
    } catch (err) {
      setDispatchError(err instanceof Error ? err.message : 'Dispatch failed.');
    } finally {
      setDispatchLoading(false);
    }
  }

  const totalFactoryRemaining = batches.reduce((sum, b) => sum + b.remainingQty, 0);
  const totalDispatched = batches.reduce((sum, b) => sum + b.dispatchedQty, 0);

  const navItems: SidebarNavItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'batches', label: 'Production Batches', icon: PackageCheck, count: batches.length },
    { id: 'dispatches', label: 'Supply Dispatches', icon: Send, count: dispatches.length },
    { id: 'pharmacies', label: 'Partner Pharmacies', icon: Building2, count: pharmacies.length },
  ];

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all';
  const cardSurface =
    'rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_10px_-3px_rgba(15,23,42,0.06)] transition-all';

  return (
    <DashboardShell
      user={user}
      roleLabel="Company"
      roleIcon={Factory}
      navItems={navItems}
      activeNavId={activeNav}
      onSelectNav={(id) => setActiveNav(id as MfgNavTab)}
      title={user.organizationName}
      subtitle="Register standardized production batches and dispatch verified inventory to licensed pharmacies."
      headerActions={
        <>
          <button
            type="button"
            onClick={() => openDispatchDrawer()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all whitespace-nowrap shrink-0"
          >
            <Send className="h-4 w-4 text-slate-500" aria-hidden="true" />
            Dispatch Stock
          </button>
          <button
            type="button"
            onClick={openBatchDrawer}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#115E59] focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all whitespace-nowrap shrink-0"
          >
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Register Batch
          </button>
        </>
      }
    >
      {/* Top KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className={`${cardSurface} hover:border-teal-300 p-5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">Total Batches</span>
            <PackageCheck className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {batches.length}
          </div>
        </div>

        <div className={`${cardSurface} hover:border-teal-300 p-5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">Active Factory Stock</span>
            <Boxes className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {totalFactoryRemaining.toLocaleString()} pcs
          </div>
        </div>

        <div className={`${cardSurface} hover:border-teal-300 p-5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">Dispatched Volume</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-[#0F766E] tabular-nums">
            {totalDispatched.toLocaleString()} pcs
          </div>
        </div>

        <div className={`${cardSurface} hover:border-teal-300 p-5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">Partner Pharmacies</span>
            <Building2 className="h-4 w-4 text-slate-500" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {pharmacies.length}
          </div>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {loadError}
        </div>
      )}

      {createdBatch && (
        <div
          role="status"
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-teal-200 bg-teal-50/90 px-5 py-4 text-sm text-teal-950"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-[#0F766E] shrink-0" aria-hidden="true" />
            <div>
              <div className="font-semibold text-slate-900">
                Production batch <span className="font-mono">{createdBatch.batchId}</span> ({createdBatch.medicineName}) registered!
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Automatically submitted to DGDA Regulator for compliance approval. Once approved, you can dispatch stock to pharmacies.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 whitespace-nowrap self-start sm:self-auto">
            Pending DGDA Approval
          </span>
        </div>
      )}

      {/* Manufactured Batches Table */}
      {(activeNav === 'overview' || activeNav === 'batches') && (
        <section className={`${cardSurface} p-6`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                Manufactured Batches
              </h2>
              <p className="text-sm text-slate-500">
                Live production ledger, DGDA regulatory approval status, and factory inventory.
              </p>
            </div>
            <button
              type="button"
              onClick={openBatchDrawer}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-teal-300 transition-all whitespace-nowrap self-start sm:self-auto"
            >
              <PackagePlus className="h-3.5 w-3.5 text-[#0F766E]" aria-hidden="true" />
              New Batch
            </button>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading batches...</div>
          ) : batches.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm font-medium text-slate-900">No batches manufactured yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Register your first production batch to generate a standardized Batch ID and submit to DGDA.
              </p>
              <button
                type="button"
                onClick={openBatchDrawer}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#115E59] transition-colors"
              >
                <PackagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                Register First Batch
              </button>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-2.5">Batch ID</th>
                    <th className="py-3 px-2.5">Medicine</th>
                    <th className="py-3 px-2.5 text-right">Factory Stock</th>
                    <th className="py-3 px-2.5 text-right">Price</th>
                    <th className="py-3 px-2.5">Mfg / Expiry</th>
                    <th className="py-3 px-2.5">DGDA Approval</th>
                    <th className="py-3 px-2.5">Status</th>
                    <th className="py-3 px-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batches.map((b) => {
                    const isApproved = b.approvalStatus === 'APPROVED';
                    const canDispatch =
                      isApproved &&
                      b.status === 'AUTHENTIC' &&
                      b.remainingQty > 0 &&
                      pharmacies.length > 0;
                    return (
                      <tr
                        key={b.batchId}
                        className="even:bg-slate-50/50 hover:bg-teal-50/30 transition-colors"
                      >
                        <td className="py-3 px-2.5 whitespace-nowrap">
                          <MonoIdBadge>{b.batchId}</MonoIdBadge>
                        </td>
                        <td className="py-3 px-2.5">
                          <div className="font-medium text-slate-900">{b.medicineName}</div>
                          <div className="text-xs text-slate-500">{b.drugGroup}</div>
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                          <div className="font-semibold text-slate-900">
                            {b.remainingQty} / {b.totalQuantity} pcs
                          </div>
                          <div className="text-xs text-slate-500">
                            {b.dispatchedQty} dispatched
                          </div>
                        </td>
                        <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                          {b.unitPrice.toFixed(2)}
                        </td>
                        <td className="py-3 px-2.5 font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                          <div>{b.productionDate}</div>
                          <div className="text-slate-400">Exp {b.expiryDate}</div>
                        </td>
                        <td className="py-3 px-2.5 whitespace-nowrap">
                          <BatchApprovalStatusBadge status={b.approvalStatus} />
                          {b.approvalRemarks && (
                            <div className="mt-0.5 max-w-[160px] truncate text-[11px] text-slate-400">
                              {b.approvalRemarks}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-2.5 whitespace-nowrap">
                          <BatchStatusBadge status={b.status} />
                        </td>
                        <td className="py-3 px-2.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            disabled={!canDispatch}
                            onClick={() => openDispatchDrawer(b.batchId)}
                            title={
                              !isApproved
                                ? 'DGDA approval required before dispatching'
                                : b.remainingQty <= 0
                                ? 'No remaining factory stock'
                                : undefined
                            }
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${
                              canDispatch
                                ? 'border-teal-200 bg-teal-50 text-[#0F766E] hover:bg-teal-100 hover:border-teal-300'
                                : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed opacity-60'
                            }`}
                          >
                            <Send className="h-3 w-3" aria-hidden="true" />
                            {isApproved ? 'Dispatch' : 'Awaiting DGDA'}
                          </button>
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

      {/* Supply Dispatch History Table */}
      {(activeNav === 'overview' || activeNav === 'dispatches') && (
        <section className={`${cardSurface} p-6`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                Supply Dispatch History
              </h2>
              <p className="text-sm text-slate-500">
                Shipments sent to licensed pharmacies and current store-level balances.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openDispatchDrawer()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-teal-300 transition-all whitespace-nowrap self-start sm:self-auto"
            >
              <Send className="h-3.5 w-3.5 text-[#0F766E]" aria-hidden="true" />
              New Dispatch
            </button>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading dispatch history...</div>
          ) : dispatches.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No dispatches recorded yet.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-3">Supply ID</th>
                    <th className="py-3 px-3">Batch ID</th>
                    <th className="py-3 px-3">Medicine</th>
                    <th className="py-3 px-3">Destination Pharmacy</th>
                    <th className="py-3 px-3 text-right">Dispatched</th>
                    <th className="py-3 px-3 text-right">Store Balance</th>
                    <th className="py-3 px-3">Supply Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dispatches.map((d) => (
                    <tr
                      key={d.supplyId}
                      className="even:bg-slate-50/50 hover:bg-teal-50/30 transition-colors"
                    >
                      <td className="py-3 px-3 whitespace-nowrap">
                        <MonoIdBadge>{d.supplyId}</MonoIdBadge>
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-slate-900 whitespace-nowrap">
                        {d.batchId}
                      </td>
                      <td className="py-3 px-3 text-slate-900">
                        <div className="font-medium whitespace-nowrap">{d.medicineName}</div>
                        <div className="text-xs text-slate-500">{d.drugGroup}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-900">{d.pharmacyName}</div>
                        <div className="font-mono text-xs text-slate-500">{d.pharmacyId}</div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                        {d.quantity} pcs
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#0F766E] font-semibold whitespace-nowrap">
                        {d.pharmacyRemaining} pcs
                      </td>
                      <td className="py-3 px-3 font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                        {d.supplyDate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Registered Pharmacies Reference */}
      {activeNav === 'pharmacies' && (
        <section className={`${cardSurface} p-6`}>
          <div className="pb-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Registered Partner Pharmacies
            </h2>
            <p className="text-sm text-slate-500">
              Licensed dispensaries eligible to receive verified factory stock.
            </p>
          </div>
          {pharmacies.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No pharmacies have registered yet.
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {pharmacies.map((p) => (
                <div
                  key={p.entityId}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{p.organizationName}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {p.area} · <span className="font-mono">{p.contact}</span>
                    </div>
                  </div>
                  <MonoIdBadge>{p.entityId}</MonoIdBadge>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Slide-Over Drawer: Register Production Batch */}
      <SlideOverDrawer
        open={drawerMode === 'batch'}
        onClose={() => setDrawerMode(null)}
        title="Register New Production Batch"
        subtitle="Generates a C++ PharmaTrack Batch Number (e.g., CPA-ATB-P001-1028)."
      >
        {createdBatch && (
          <div
            role="status"
            className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          >
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
              Batch Registered
            </div>
            <p className="mt-1">
              Assigned Batch ID:{' '}
              <span className="font-mono font-bold">{createdBatch.batchId}</span>
            </p>
          </div>
        )}

        {prodError && (
          <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {prodError}
          </div>
        )}

        <form onSubmit={handleCreateBatch} className="space-y-4">
          <div>
            <label htmlFor="mfg-med-name" className="block text-sm font-medium text-slate-700 mb-1.5">
              Medicine Name
            </label>
            <input
              id="mfg-med-name"
              type="text"
              required
              value={medicineName}
              onChange={(e) => setMedicineName(e.target.value)}
              placeholder="e.g., Napa Extend 665mg"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="mfg-drug-group" className="block text-sm font-medium text-slate-700 mb-1.5">
              Drug Group
            </label>
            <select
              id="mfg-drug-group"
              value={drugGroup}
              onChange={(e) => setDrugGroup(e.target.value as DrugGroup)}
              className={inputClass}
            >
              {DRUG_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mfg-quantity" className="block text-sm font-medium text-slate-700 mb-1.5">
                Total Quantity (pcs)
              </label>
              <input
                id="mfg-quantity"
                type="number"
                min={1}
                step={1}
                required
                value={totalQuantity}
                onChange={(e) => setTotalQuantity(e.target.value)}
                placeholder="e.g., 500"
                className={`${inputClass} font-mono placeholder:font-sans`}
              />
            </div>

            <div>
              <label htmlFor="mfg-unit-price" className="block text-sm font-medium text-slate-700 mb-1.5">
                Unit Price (BDT)
              </label>
              <input
                id="mfg-unit-price"
                type="number"
                min={0.01}
                step={0.01}
                required
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="e.g., 2.50"
                className={`${inputClass} font-mono placeholder:font-sans`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mfg-prod-date" className="block text-sm font-medium text-slate-700 mb-1.5">
                Production Date
              </label>
              <input
                id="mfg-prod-date"
                type="date"
                required
                value={productionDate}
                onChange={(e) => setProductionDate(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label htmlFor="mfg-exp-date" className="block text-sm font-medium text-slate-700 mb-1.5">
                Expiry Date
              </label>
              <input
                id="mfg-exp-date"
                type="date"
                required
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>

          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDrawerMode(null)}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={prodLoading}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#115E59] focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:opacity-60 transition-all"
            >
              <PackagePlus className="h-4 w-4" aria-hidden="true" />
              {prodLoading ? 'Registering...' : 'Register Production Batch'}
            </button>
          </div>
        </form>
      </SlideOverDrawer>

      {/* Slide-Over Drawer: Dispatch Stock */}
      <SlideOverDrawer
        open={drawerMode === 'dispatch'}
        onClose={() => setDrawerMode(null)}
        title="Dispatch Stock to Pharmacy"
        subtitle="Allocates factory stock to licensed pharmacies. Expired or DGDA-recalled batches are automatically blocked."
      >
        {dispatchSuccess && (
          <div
            role="status"
            className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            {dispatchSuccess}
          </div>
        )}

        {dispatchError && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            {dispatchError}
          </div>
        )}

        {(() => {
          const selectedDispatchBatch = batches.find(
            (b) => b.batchId.toUpperCase() === dispatchBatchId.trim().toUpperCase()
          );
          const isSelectedBatchApproved = selectedDispatchBatch?.approvalStatus === 'APPROVED';

          return (
            <form onSubmit={handleDispatch} className="space-y-4">
              <div>
                <label htmlFor="disp-batch" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Production Batch
                </label>
                {batches.length > 0 ? (
                  <select
                    id="disp-batch"
                    required
                    value={dispatchBatchId}
                    onChange={(e) => setDispatchBatchId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select a batch...</option>
                    {batches.map((b) => (
                      <option key={b.batchId} value={b.batchId}>
                        {b.batchId} — {b.medicineName} ({b.remainingQty} pcs left,{' '}
                        {b.approvalStatus === 'APPROVED' ? 'DGDA Approved' : 'Pending Approval - Cannot Dispatch'})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="disp-batch"
                    type="text"
                    required
                    value={dispatchBatchId}
                    onChange={(e) => setDispatchBatchId(e.target.value.toUpperCase())}
                    placeholder="Register a batch first"
                    className={`${inputClass} bg-slate-50 font-mono`}
                  />
                )}

                {selectedDispatchBatch && !isSelectedBatchApproved && (
                  <div className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="font-semibold flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                      DGDA Approval Required Before Supply
                    </p>
                    <p className="mt-1 text-slate-600">
                      Batch <span className="font-mono font-semibold">{selectedDispatchBatch.batchId}</span> is currently{' '}
                      <span className="font-semibold text-amber-800">
                        {selectedDispatchBatch.approvalStatus || 'PENDING_APPROVAL'}
                      </span>
                      . You cannot dispatch or market this batch until DGDA Regulator grants commercial approval.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="disp-pharmacy" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Target Licensed Pharmacy
                </label>
                {pharmacies.length > 0 ? (
                  <select
                    id="disp-pharmacy"
                    required
                    value={dispatchPharmacyId}
                    onChange={(e) => setDispatchPharmacyId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select a registered pharmacy...</option>
                    {pharmacies.map((p) => (
                      <option key={p.entityId} value={p.entityId}>
                        {p.entityId} — {p.organizationName} ({p.area})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="disp-pharmacy"
                    type="text"
                    required
                    value={dispatchPharmacyId}
                    onChange={(e) => setDispatchPharmacyId(e.target.value.toUpperCase())}
                    placeholder="No pharmacies registered yet"
                    className={`${inputClass} bg-slate-50 font-mono`}
                  />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="disp-qty" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Dispatch Quantity (pcs)
                  </label>
                  <input
                    id="disp-qty"
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={dispatchQuantity}
                    onChange={(e) => setDispatchQuantity(e.target.value)}
                    placeholder="e.g., 100"
                    className={`${inputClass} font-mono placeholder:font-sans`}
                  />
                </div>

                <div>
                  <label htmlFor="disp-date" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Supply Date
                  </label>
                  <input
                    id="disp-date"
                    type="date"
                    required
                    value={supplyDate}
                    onChange={(e) => setSupplyDate(e.target.value)}
                    className={`${inputClass} font-mono`}
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDrawerMode(null)}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={
                    dispatchLoading ||
                    batches.length === 0 ||
                    pharmacies.length === 0 ||
                    !isSelectedBatchApproved
                  }
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-all"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {dispatchLoading ? 'Dispatching...' : 'Dispatch Batch'}
                </button>
              </div>
            </form>
          );
        })()}
      </SlideOverDrawer>
    </DashboardShell>
  );
}
