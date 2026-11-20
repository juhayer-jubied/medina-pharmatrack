import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Boxes,
  LayoutDashboard,
  Package,
  Printer,
  Receipt,
  ShoppingCart,
  Store,
  TrendingUp,
} from 'lucide-react';
import { api, type PharmacyInventoryItem } from '../lib/api';
import type { PublicUser, SaleRecord } from '../lib/pharmaLogic';
import { DashboardShell, type SidebarNavItem } from './DashboardShell';
import { SlideOverDrawer } from './SlideOverDrawer';
import { BatchStatusBadge, LowStockBadge, MonoIdBadge } from './StatusBadge';

interface PharmacyDashboardProps {
  user: PublicUser;
}

type PharmacyNavTab = 'overview' | 'inventory' | 'sales';

export function PharmacyDashboard({ user }: PharmacyDashboardProps) {
  const [activeNav, setActiveNav] = useState<PharmacyNavTab>('overview');
  const [inventory, setInventory] = useState<PharmacyInventoryItem[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Slide-over drawer state
  const [posDrawerOpen, setPosDrawerOpen] = useState(false);

  // POS state
  const [posBatchId, setPosBatchId] = useState('');
  const [posQty, setPosQty] = useState('1');
  const [posLoading, setPosLoading] = useState(false);
  const [posError, setPosError] = useState<string | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<SaleRecord | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getPharmacyDashboard();
      setInventory(data.inventory);
      setSales(data.sales);
      setTotalRevenue(data.totalRevenue);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load pharmacy data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  function openPosWithBatch(batchId?: string) {
    setPosError(null);
    if (batchId) {
      setPosBatchId(batchId);
    }
    setPosDrawerOpen(true);
  }

  const selectedBatch = inventory.find(
    (item) => item.batchId.toUpperCase() === posBatchId.trim().toUpperCase()
  );

  const isSelectedBlocked =
    selectedBatch &&
    (selectedBatch.status === 'RECALLED' || selectedBatch.status === 'EXPIRED');

  async function handleSellSubmit(e: FormEvent) {
    e.preventDefault();
    setPosError(null);
    setPosLoading(true);
    try {
      const res = await api.createPharmacySale({
        batchId: posBatchId.trim().toUpperCase(),
        quantity: Number(posQty),
      });
      setPosDrawerOpen(false);
      setActiveReceipt(res.sale);
      setPosQty('1');
      await loadDashboard();
    } catch (err) {
      setPosError(err instanceof Error ? err.message : 'Unable to process sale.');
    } finally {
      setPosLoading(false);
    }
  }

  const lowStockItems = inventory.filter((item) => item.isLowStock);
  const blockedItems = inventory.filter(
    (item) => (item.status === 'RECALLED' || item.status === 'EXPIRED') && item.remainingStock > 0
  );
  const totalActiveStock = inventory
    .filter((i) => i.status === 'AUTHENTIC')
    .reduce((sum, i) => sum + i.remainingStock, 0);

  const navItems: SidebarNavItem[] = [
    { id: 'overview', label: 'Store Overview', icon: LayoutDashboard },
    { id: 'inventory', label: 'Live Inventory', icon: Package, count: inventory.length },
    { id: 'sales', label: 'Sales History', icon: Receipt, count: sales.length },
  ];

  const cardSurface =
    'rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_10px_-3px_rgba(15,23,42,0.06)] transition-all';
  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all';

  return (
    <DashboardShell
      user={user}
      roleLabel="Pharmacy"
      roleIcon={Store}
      navItems={navItems}
      activeNavId={activeNav}
      onSelectNav={(id) => setActiveNav(id as PharmacyNavTab)}
      title={user.organizationName}
      subtitle="Manage store inventory, enforce DGDA recall/expiry safety locks, and dispense via Counter POS."
      headerActions={
        <button
          type="button"
          onClick={() => openPosWithBatch()}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#115E59] focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all whitespace-nowrap shrink-0"
        >
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          Open POS Counter
        </button>
      }
      sidebarFooter={
        <button
          type="button"
          onClick={() => openPosWithBatch()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-2 text-xs font-semibold text-[#0F766E] hover:bg-teal-100/70 transition-colors"
        >
          <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
          Quick POS Checkout
        </button>
      }
    >
      {/* Top KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 no-print">
        <div className={`${cardSurface} hover:border-teal-300 p-5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">Total Revenue</span>
            <TrendingUp className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-[#0F766E] tabular-nums">
            {totalRevenue.toFixed(2)} BDT
          </div>
        </div>

        <div className={`${cardSurface} hover:border-teal-300 p-5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">Active Stock</span>
            <Boxes className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {totalActiveStock.toLocaleString()} pcs
          </div>
        </div>

        <div className={`${cardSurface} hover:border-teal-300 p-5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">Tracked Batches</span>
            <Package className="h-4 w-4 text-slate-500" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {inventory.length}
          </div>
        </div>

        <div className={`${cardSurface} hover:border-teal-300 p-5`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">Low Stock Alerts (&lt;10)</span>
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
            {lowStockItems.length}
          </div>
        </div>
      </div>

      {/* Compliance & Low Stock Alerts */}
      {(lowStockItems.length > 0 || blockedItems.length > 0) && (
        <div className="space-y-3 no-print">
          {blockedItems.length > 0 && (
            <div
              role="alert"
              className="rounded-2xl border border-rose-200 bg-rose-50/90 px-5 py-4 text-sm text-rose-950"
            >
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4 text-rose-700 shrink-0" aria-hidden="true" />
                Quarantine Alert: Expired or DGDA-Recalled Batches in Inventory
              </div>
              <p className="mt-1 text-rose-800">
                POS dispensing is automatically blocked for:{' '}
                <span className="font-mono font-semibold">
                  {blockedItems.map((b) => `${b.batchId} (${b.status})`).join(', ')}
                </span>
              </p>
            </div>
          )}

          {lowStockItems.length > 0 && (
            <div
              role="status"
              className="rounded-2xl border border-amber-200 bg-amber-50/90 px-5 py-4 text-sm text-amber-950"
            >
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" aria-hidden="true" />
                Low Stock Notice
              </div>
              <p className="mt-1 text-amber-900">
                {lowStockItems
                  .map((i) => `${i.medicineName} [${i.batchId}: ${i.remainingStock} pcs]`)
                  .join(' · ')}
              </p>
            </div>
          )}
        </div>
      )}

      {loadError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 no-print">
          {loadError}
        </div>
      )}

      {/* Live Inventory Table */}
      {(activeNav === 'overview' || activeNav === 'inventory') && (
        <section className={`${cardSurface} p-6 no-print`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                Live Pharmacy Inventory
              </h2>
              <p className="text-sm text-slate-500">
                Batch-level received stock, sales deductions, and expiry/recall compliance.
              </p>
            </div>
            <button
              type="button"
              onClick={() => openPosWithBatch()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-teal-300 transition-all whitespace-nowrap self-start sm:self-auto"
            >
              <ShoppingCart className="h-3.5 w-3.5 text-[#0F766E]" aria-hidden="true" />
              New Sale
            </button>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading inventory...</div>
          ) : inventory.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No batches supplied to your pharmacy yet.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-2.5">Batch ID</th>
                    <th className="py-3 px-2.5">Medicine</th>
                    <th className="py-3 px-2.5 text-right">Store Stock</th>
                    <th className="py-3 px-2.5 text-right">Price</th>
                    <th className="py-3 px-2.5">Expiry</th>
                    <th className="py-3 px-2.5">Status &amp; Alerts</th>
                    <th className="py-3 px-2.5 text-right">POS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inventory.map((item) => (
                    <tr
                      key={item.batchId}
                      className="even:bg-slate-50/50 hover:bg-teal-50/30 transition-colors"
                    >
                      <td className="py-3 px-2.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openPosWithBatch(item.batchId)}
                          className="hover:opacity-80"
                          title="Open in POS"
                        >
                          <MonoIdBadge>{item.batchId}</MonoIdBadge>
                        </button>
                      </td>
                      <td className="py-3 px-2.5">
                        <div className="font-medium text-slate-900">{item.medicineName}</div>
                        <div className="text-xs text-slate-500">
                          {item.drugGroup} · {item.manufacturerName}
                        </div>
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-slate-900">
                          {item.remainingStock} pcs
                        </div>
                        <div className="text-xs text-slate-500">
                          {item.receivedQty} rec · {item.soldQty} sold
                        </div>
                      </td>
                      <td className="py-3 px-2.5 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                        {item.unitPrice.toFixed(2)}
                      </td>
                      <td className="py-3 px-2.5 font-mono text-xs tabular-nums text-slate-600 whitespace-nowrap">
                        {item.expiryDate}
                      </td>
                      <td className="py-3 px-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <BatchStatusBadge status={item.status} />
                          {item.isLowStock && <LowStockBadge />}
                        </div>
                      </td>
                      <td className="py-3 px-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openPosWithBatch(item.batchId)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-teal-300 transition-all"
                        >
                          <ShoppingCart className="h-3 w-3" aria-hidden="true" />
                          Dispense
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Sales History Table */}
      {(activeNav === 'overview' || activeNav === 'sales') && (
        <section className={`${cardSurface} p-6 no-print`}>
          <div className="pb-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              Sales History
            </h2>
            <p className="text-sm text-slate-500">
              Completed POS transactions and printable digital receipts.
            </p>
          </div>

          {sales.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              No sales recorded yet.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold text-slate-500">
                    <th className="py-3 px-3">Receipt ID</th>
                    <th className="py-3 px-3">Batch ID</th>
                    <th className="py-3 px-3">Medicine</th>
                    <th className="py-3 px-3 text-right">Qty</th>
                    <th className="py-3 px-3 text-right">Total (BDT)</th>
                    <th className="py-3 px-3">Sold At</th>
                    <th className="py-3 px-3 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sales.map((s) => (
                    <tr
                      key={s.salesId}
                      className="even:bg-slate-50/50 hover:bg-teal-50/30 transition-colors"
                    >
                      <td className="py-3 px-3 whitespace-nowrap">
                        <MonoIdBadge>{s.salesId}</MonoIdBadge>
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                        {s.batchId}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-900">
                        {s.medicineName}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900">
                        {s.quantity}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-[#0F766E]">
                        {s.totalPrice.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs tabular-nums text-slate-600">
                        {new Date(s.soldAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setActiveReceipt(s)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-[#0F766E] hover:bg-teal-50 hover:border-teal-300 transition-all"
                        >
                          <Receipt className="h-3 w-3" aria-hidden="true" />
                          View Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Slide-Over Drawer: Live Counter POS */}
      <SlideOverDrawer
        open={posDrawerOpen}
        onClose={() => setPosDrawerOpen(false)}
        title="Live Counter POS"
        subtitle="Dispense verified stock by Batch ID. Automatically enforces DGDA recall and expiry safety locks."
      >
        {posError && (
          <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {posError}
          </div>
        )}

        <form onSubmit={handleSellSubmit} className="space-y-4">
          <div>
            <label htmlFor="pos-batch-id" className="block text-sm font-medium text-slate-700 mb-1.5">
              Batch ID
            </label>
            <input
              id="pos-batch-id"
              type="text"
              required
              list="pharmacy-batch-options"
              value={posBatchId}
              onChange={(e) => {
                setPosBatchId(e.target.value.toUpperCase());
                setPosError(null);
              }}
              placeholder="Enter or select CPA-G1-P01A-1028"
              className={`${inputClass} font-mono placeholder:font-sans`}
            />
            <datalist id="pharmacy-batch-options">
              {inventory.map((item) => (
                <option key={item.batchId} value={item.batchId}>
                  {item.medicineName} ({item.remainingStock} pcs · {item.status})
                </option>
              ))}
            </datalist>
          </div>

          {selectedBatch && (
            <div
              className={`rounded-xl border p-4 text-sm space-y-2 ${
                isSelectedBlocked
                  ? 'border-rose-200 bg-rose-50/70'
                  : 'border-slate-200/80 bg-slate-50/80'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">
                  {selectedBatch.medicineName}
                </span>
                <BatchStatusBadge status={selectedBatch.status} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-slate-600 pt-1">
                <div>
                  Stock:{' '}
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {selectedBatch.remainingStock} pcs
                  </span>
                </div>
                <div>
                  Unit:{' '}
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {selectedBatch.unitPrice.toFixed(2)} BDT
                  </span>
                </div>
                <div>
                  Exp:{' '}
                  <span className="font-mono text-slate-900 tabular-nums">
                    {selectedBatch.expiryDate}
                  </span>
                </div>
              </div>
              {isSelectedBlocked && (
                <p className="text-xs font-semibold text-rose-700 pt-1">
                  Dispensing blocked: batch is {selectedBatch.status}.
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="pos-qty" className="block text-sm font-medium text-slate-700 mb-1.5">
              Quantity to Sell (pcs)
            </label>
            <input
              id="pos-qty"
              type="number"
              min={1}
              step={1}
              required
              value={posQty}
              onChange={(e) => setPosQty(e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </div>

          {selectedBatch && Number(posQty) > 0 && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
              <span className="text-slate-600">Estimated Total</span>
              <span className="font-mono text-base font-semibold text-slate-900 tabular-nums">
                {(Number(posQty) * selectedBatch.unitPrice).toFixed(2)} BDT
              </span>
            </div>
          )}

          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPosDrawerOpen(false)}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={posLoading || Boolean(isSelectedBlocked)}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#115E59] focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:opacity-50 transition-all"
            >
              <Receipt className="h-4 w-4" aria-hidden="true" />
              {posLoading ? 'Processing...' : 'Complete Sale & Generate Receipt'}
            </button>
          </div>
        </form>
      </SlideOverDrawer>

      {/* Slide-Over Drawer: Printable Digital Receipt */}
      <SlideOverDrawer
        open={Boolean(activeReceipt)}
        onClose={() => setActiveReceipt(null)}
        title={activeReceipt ? `Digital Receipt ${activeReceipt.salesId}` : 'Digital Receipt'}
        subtitle="MediNa - PharmaTrack Verified Point-of-Sale Receipt"
        printVisible
      >
        {activeReceipt && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
                <div>
                  <p className="text-xs font-semibold text-[#0F766E]">
                    MediNa - PharmaTrack Verified Receipt
                  </p>
                  <h3 className="mt-1 font-mono text-xl font-bold text-slate-900">
                    {activeReceipt.salesId}
                  </h3>
                </div>
                <MonoIdBadge>{activeReceipt.batchId}</MonoIdBadge>
              </div>

              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Pharmacy</dt>
                  <dd className="font-medium text-slate-900 text-right">
                    {activeReceipt.pharmacyName} ({activeReceipt.pharmacyId})
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Medicine</dt>
                  <dd className="text-slate-900 text-right">
                    {activeReceipt.medicineName} ({activeReceipt.drugGroup})
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Quantity</dt>
                  <dd className="font-mono tabular-nums text-slate-900">
                    {activeReceipt.quantity} pcs
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Unit Price</dt>
                  <dd className="font-mono tabular-nums text-slate-900">
                    {activeReceipt.unitPrice.toFixed(2)} BDT
                  </dd>
                </div>
                <div className="flex justify-between gap-4 border-t border-slate-200 pt-3">
                  <dt className="font-semibold text-slate-900">Total Paid</dt>
                  <dd className="font-mono text-lg font-bold text-[#0F766E] tabular-nums">
                    {activeReceipt.totalPrice.toFixed(2)} BDT
                  </dd>
                </div>
                <div className="flex justify-between gap-4 text-xs text-slate-500 pt-1">
                  <dt>Timestamp</dt>
                  <dd className="font-mono">{new Date(activeReceipt.soldAt).toLocaleString()}</dd>
                </div>
              </dl>
            </div>

            <div className="flex items-center gap-3 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                Print Receipt
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveReceipt(null);
                  openPosWithBatch();
                }}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F766E] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#115E59] transition-colors"
              >
                <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                New Sale
              </button>
            </div>
          </div>
        )}
      </SlideOverDrawer>
    </DashboardShell>
  );
}
