export type UserRole = 'Company' | 'Pharmacy' | 'DGDA Regulator';

export type DrugGroup = 'Antibiotics' | 'Painkillers' | 'Antacids' | 'Paracetamol';

export type PharmacyArea = 'Daffodil' | 'Mirpur' | 'Uttara';

export type BatchStatus = 'AUTHENTIC' | 'EXPIRED' | 'RECALLED' | 'UNVERIFIED';

export type ComplaintIssueType =
  | 'Counterfeit Medicine'
  | 'Expired Medicine'
  | 'Overpricing'
  | 'Bad Behavior'
  | 'Other';

export type ComplaintStatus = 'Pending' | 'Resolved' | 'Dismissed';

// Matches C++ DRUG_GROUPS[4] = {"Antibiotics", "Painkillers", "Antacids", "Paracetamol"}
// so groupChoice 1..4 aligns directly with G1..G4 in Batch Numbers.
export const DRUG_GROUPS: readonly DrugGroup[] = [
  'Antibiotics',
  'Painkillers',
  'Antacids',
  'Paracetamol',
] as const;

export const PHARMACY_AREAS: readonly PharmacyArea[] = [
  'Daffodil',
  'Mirpur',
  'Uttara',
] as const;

export const COMPLAINT_ISSUE_TYPES: readonly ComplaintIssueType[] = [
  'Counterfeit Medicine',
  'Expired Medicine',
  'Overpricing',
  'Bad Behavior',
  'Other',
] as const;

export interface PublicUser {
  id: string;
  organizationName: string;
  username: string;
  role: UserRole;
  entityId: string;
  companyPrefix?: string;
  ownerName?: string;
  area?: PharmacyArea;
  address?: string;
  contact?: string;
  googleMapsUrl?: string;
  createdAt: string;
}

export interface ProductionBatch {
  batchId: string;
  medicineName: string;
  drugGroup: DrugGroup;
  manufacturerId: string;
  manufacturerName: string;
  totalQuantity: number;
  unitPrice: number;
  productionDate: string; // YYYY-MM-DD
  expiryDate: string; // YYYY-MM-DD
  isRecalled: boolean;
  recallReason?: string;
  recalledBy?: string;
  recalledAt?: string;
  createdAt: string;
}

export interface SupplyDispatch {
  supplyId: string;
  batchId: string;
  manufacturerId: string;
  manufacturerName: string;
  pharmacyId: string;
  pharmacyName: string;
  quantity: number;
  supplyDate: string; // YYYY-MM-DD
  createdAt: string;
}

export interface SaleRecord {
  salesId: string;
  batchId: string;
  pharmacyId: string;
  pharmacyName: string;
  medicineName: string;
  drugGroup: DrugGroup;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  soldAt: string;
  soldBy: string;
}

export interface ComplaintRecord {
  complaintId: string;
  pharmacyId: string;
  pharmacyName?: string;
  batchId?: string;
  customerName: string;
  customerContact: string;
  issueType: ComplaintIssueType;
  description: string;
  status: ComplaintStatus;
  officialRemarks: string;
  createdAt: string;
  updatedAt?: string;
}

export function getTodayISODate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidISODate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function validateBatchDates(
  productionDate: string,
  expiryDate: string
): { valid: boolean; error?: string } {
  if (!isValidISODate(productionDate)) {
    return { valid: false, error: 'Production date must be a valid YYYY-MM-DD calendar date.' };
  }
  if (!isValidISODate(expiryDate)) {
    return { valid: false, error: 'Expiry date must be a valid YYYY-MM-DD calendar date.' };
  }
  if (expiryDate <= productionDate) {
    return {
      valid: false,
      error: `Expiry date (${expiryDate}) must be strictly later than production date (${productionDate}).`,
    };
  }
  return { valid: true };
}

export function getDrugGroupNumber(drugGroup: DrugGroup): number {
  const index = DRUG_GROUPS.indexOf(drugGroup);
  return index >= 0 ? index + 1 : 4;
}

export function extractMMYYFromDate(dateStr: string): string {
  // Supports ISO YYYY-MM-DD (e.g., 2028-10-15 -> 1028) and DD-MM-YYYY (e.g., 15-10-2028 -> 1028)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return `${dateStr.slice(5, 7)}${dateStr.slice(2, 4)}`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
    return `${dateStr.slice(3, 5)}${dateStr.slice(8, 10)}`;
  }
  return '0000';
}

export function resolveCompanyBatchCodes(
  entityId: string,
  companyOrdinal: number = 1,
  customPrefix?: string
): { compPrefix: string; companySuffix: string } {
  const cleanId = entityId.trim().toUpperCase();
  if (cleanId === '1') {
    return { compPrefix: 'CPA', companySuffix: 'A' };
  }
  if (cleanId === '2') {
    return { compPrefix: 'CPB', companySuffix: 'B' };
  }

  if (customPrefix) {
    const cleanCustom = customPrefix.replace(/[^A-Z]/gi, '').toUpperCase();
    if (cleanCustom.length === 3) {
      return { compPrefix: cleanCustom, companySuffix: cleanCustom[2] };
    }
  }

  if (/^\d+$/.test(cleanId)) {
    const num = Number.parseInt(cleanId, 10);
    if (num >= 1 && num <= 26) {
      const letter = String.fromCharCode(64 + num);
      return { compPrefix: `CP${letter}`, companySuffix: letter };
    }
  }

  if (companyOrdinal === 1) {
    return { compPrefix: 'CPA', companySuffix: 'A' };
  }
  if (companyOrdinal === 2) {
    return { compPrefix: 'CPB', companySuffix: 'B' };
  }

  const letters = cleanId.replace(/[^A-Z]/g, '');
  if (letters.length >= 3) {
    const prefix = letters.slice(0, 3);
    return { compPrefix: prefix, companySuffix: prefix[2] };
  }

  const ordinalLetter = String.fromCharCode(64 + (((Math.max(1, companyOrdinal) - 1) % 26) + 1));
  return { compPrefix: `CP${ordinalLetter}`, companySuffix: ordinalLetter };
}

export function generateBatchId(params: {
  entityId: string;
  drugGroup: DrugGroup;
  expiryDate: string;
  companyProductionCount: number;
  companyOrdinal?: number;
  customPrefix?: string;
  existingBatchIds?: Iterable<string>;
}): string {
  const { compPrefix, companySuffix } = resolveCompanyBatchCodes(
    params.entityId,
    params.companyOrdinal ?? 1,
    params.customPrefix
  );
  const groupChoice = getDrugGroupNumber(params.drugGroup);
  const expCode = extractMMYYFromDate(params.expiryDate);
  const existing = new Set(
    Array.from(params.existingBatchIds ?? [], (id) => id.toUpperCase())
  );

  let count = Math.max(1, params.companyProductionCount + 1);
  while (true) {
    const prodIdCode = `P${String(count).padStart(2, '0')}${companySuffix}`;
    const candidate = `${compPrefix}-G${groupChoice}-${prodIdCode}-${expCode}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
    count += 1;
  }
}

export function generateSupplyId(params: {
  entityId: string;
  companySupplyCount: number;
  companyOrdinal?: number;
  customPrefix?: string;
  existingSupplyIds?: Iterable<string>;
}): string {
  const { companySuffix } = resolveCompanyBatchCodes(
    params.entityId,
    params.companyOrdinal ?? 1,
    params.customPrefix
  );
  const existing = new Set(
    Array.from(params.existingSupplyIds ?? [], (id) => id.toUpperCase())
  );

  let count = Math.max(1, params.companySupplyCount + 1);
  while (true) {
    const candidate = `S${String(count).padStart(2, '0')}${companySuffix}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
    count += 1;
  }
}

export function generatePharmacySalesId(
  pharmacyId: string,
  sales: readonly Pick<SaleRecord, 'pharmacyId' | 'salesId'>[]
): string {
  let highest = 0;
  const target = pharmacyId.trim().toUpperCase();
  for (const sale of sales) {
    if (sale.pharmacyId.trim().toUpperCase() !== target) continue;
    const upperId = sale.salesId.trim().toUpperCase();
    if (!upperId.startsWith('SL')) continue;
    const numPart = upperId.slice(2);
    if (!/^\d+$/.test(numPart)) continue;
    const parsed = Number.parseInt(numPart, 10);
    if (parsed > highest) highest = parsed;
  }
  return `SL${String(highest + 1).padStart(2, '0')}`;
}

export function computeBatchStatus(
  batch: Pick<ProductionBatch, 'isRecalled' | 'expiryDate'> | null | undefined,
  currentDate: string = getTodayISODate()
): BatchStatus {
  if (!batch) return 'UNVERIFIED';
  if (batch.isRecalled) return 'RECALLED';
  if (batch.expiryDate <= currentDate) return 'EXPIRED';
  return 'AUTHENTIC';
}

export function generateNextSequenceId(
  prefix: string,
  existingIds: Iterable<string>,
  padLength: number = 3
): string {
  let maxNumber = 0;
  for (const id of existingIds) {
    if (!id.startsWith(prefix)) continue;
    const numericPart = id.slice(prefix.length);
    if (!/^\d+$/.test(numericPart)) continue;
    const parsed = Number.parseInt(numericPart, 10);
    if (parsed > maxNumber) maxNumber = parsed;
  }
  return `${prefix}${String(maxNumber + 1).padStart(padLength, '0')}`;
}

export function getManufacturerDispatchedQty(
  batchId: string,
  supplies: readonly SupplyDispatch[]
): number {
  let total = 0;
  for (const supply of supplies) {
    if (supply.batchId === batchId) {
      total += supply.quantity;
    }
  }
  return total;
}

export function getManufacturerRemainingQty(
  batch: Pick<ProductionBatch, 'batchId' | 'totalQuantity'>,
  supplies: readonly SupplyDispatch[]
): number {
  const dispatched = getManufacturerDispatchedQty(batch.batchId, supplies);
  return Math.max(0, batch.totalQuantity - dispatched);
}

export function getPharmacyBatchReceivedQty(
  batchId: string,
  pharmacyId: string,
  supplies: readonly SupplyDispatch[]
): number {
  let total = 0;
  for (const supply of supplies) {
    if (supply.batchId === batchId && supply.pharmacyId === pharmacyId) {
      total += supply.quantity;
    }
  }
  return total;
}

export function getPharmacyBatchSoldQty(
  batchId: string,
  pharmacyId: string,
  sales: readonly SaleRecord[]
): number {
  let total = 0;
  for (const sale of sales) {
    if (sale.batchId === batchId && sale.pharmacyId === pharmacyId) {
      total += sale.quantity;
    }
  }
  return total;
}

export function getPharmacyBatchRemainingQty(
  batchId: string,
  pharmacyId: string,
  supplies: readonly SupplyDispatch[],
  sales: readonly SaleRecord[]
): number {
  const received = getPharmacyBatchReceivedQty(batchId, pharmacyId, supplies);
  const sold = getPharmacyBatchSoldQty(batchId, pharmacyId, sales);
  return Math.max(0, received - sold);
}

export function isLowStock(remainingQty: number): boolean {
  return remainingQty > 0 && remainingQty < 10;
}

export function extractBatchIdsFromText(text: string): string[] {
  const upper = text.toUpperCase();
  const cppMatches = upper.match(/[A-Z]{2,5}-G[1-4]-P\d{2,}[A-Z0-9]-\d{4}/g) ?? [];
  const legacyMatches = upper.match(/BATCH-\d{4}-\d{4}/g) ?? [];
  return Array.from(new Set([...cppMatches, ...legacyMatches]));
}

export function isValidStandardBatchFormat(batchId: string): boolean {
  return /^[A-Z]{2,5}-G[1-4]-P\d{2,}[A-Z0-9]-\d{4}$/.test(batchId.trim().toUpperCase());
}
