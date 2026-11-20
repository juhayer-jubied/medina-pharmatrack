import type {
  BatchStatus,
  ComplaintIssueType,
  ComplaintRecord,
  ComplaintStatus,
  DrugGroup,
  PharmacyArea,
  PublicUser,
  SaleRecord,
  SupplyDispatch,
  UserRole,
} from './pharmaLogic';

const TOKEN_STORAGE_KEY = 'medina_pharmatrack_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof data?.error === 'string'
        ? data.error
        : `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export interface AuthResponse {
  user: PublicUser;
  token: string;
}

export interface RegisterPayload {
  organizationName: string;
  username: string;
  password: string;
  role: UserRole;
  entityId: string;
  companyPrefix?: string;
  ownerName?: string;
  area?: PharmacyArea;
  address?: string;
  contact?: string;
  googleMapsUrl?: string;
}

export interface BatchVerificationResult {
  found: boolean;
  batchId?: string;
  status: BatchStatus;
  checkedAt: string;
  batch?: {
    batchId: string;
    medicineName: string;
    drugGroup: DrugGroup;
    manufacturerId: string;
    manufacturerName: string;
    unitPrice: number;
    productionDate: string;
    expiryDate: string;
    isRecalled: boolean;
    recallReason?: string;
  };
  pharmacyVerification?: {
    pharmacyId: string;
    found: boolean;
    pharmacyName?: string;
    ownerName?: string;
    area?: string;
    address?: string;
    contact?: string;
    googleMapsUrl?: string;
    receivedQty: number;
    soldQty: number;
    remainingStock: number;
  } | null;
}

export interface PublicStockItem {
  batchId: string;
  medicineName: string;
  drugGroup: DrugGroup;
  manufacturerName: string;
  unitPrice: number;
  expiryDate: string;
  pharmacyId: string;
  pharmacyName: string;
  area: string;
  address: string;
  contact: string;
  availableStock: number;
}

export interface PublicPharmacy {
  entityId: string;
  organizationName: string;
  ownerName: string;
  area: string;
  address: string;
  contact: string;
  googleMapsUrl: string;
  createdAt: string;
}

export interface ManufacturerBatchView {
  batchId: string;
  medicineName: string;
  drugGroup: DrugGroup;
  manufacturerId: string;
  manufacturerName: string;
  totalQuantity: number;
  unitPrice: number;
  productionDate: string;
  expiryDate: string;
  isRecalled: boolean;
  recallReason?: string;
  status: BatchStatus;
  dispatchedQty: number;
  remainingQty: number;
  createdAt: string;
}

export interface ManufacturerDispatchView extends SupplyDispatch {
  medicineName: string;
  drugGroup: DrugGroup;
  pharmacyRemaining: number;
}

export interface PharmacyInventoryItem {
  batchId: string;
  medicineName: string;
  drugGroup: DrugGroup;
  manufacturerName: string;
  unitPrice: number;
  productionDate: string;
  expiryDate: string;
  status: BatchStatus;
  isRecalled: boolean;
  recallReason?: string;
  receivedQty: number;
  soldQty: number;
  remainingStock: number;
  isLowStock: boolean;
}

export interface RegulatorBatchView {
  batchId: string;
  medicineName: string;
  drugGroup: DrugGroup;
  manufacturerId: string;
  manufacturerName: string;
  totalQuantity: number;
  unitPrice: number;
  productionDate: string;
  expiryDate: string;
  isRecalled: boolean;
  recallReason?: string;
  recalledBy?: string;
  recalledAt?: string;
  status: BatchStatus;
  dispatchedQty: number;
  soldQty: number;
  createdAt: string;
}

export interface RegulatorSummary {
  totalBatches: number;
  recalledBatches: number;
  pendingComplaints: number;
  registeredManufacturers: number;
  registeredPharmacies: number;
}

export const api = {
  register(payload: RegisterPayload) {
    return apiRequest<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  login(username: string, password: string, role?: UserRole) {
    return apiRequest<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, ...(role ? { role } : {}) }),
    });
  },
  me() {
    return apiRequest<{ user: PublicUser }>('/api/auth/me');
  },
  verifyBatch(batchId: string, pharmacyId?: string) {
    const params = new URLSearchParams({ batchId });
    if (pharmacyId) params.set('pharmacyId', pharmacyId);
    return apiRequest<BatchVerificationResult>(`/api/public/verify?${params.toString()}`);
  },
  getPublicStock(drugGroup: string = 'All') {
    const params = new URLSearchParams({ drugGroup });
    return apiRequest<{ items: PublicStockItem[] }>(`/api/public/stock?${params.toString()}`);
  },
  getPublicPharmacies(area: string = 'All') {
    const params = new URLSearchParams({ area });
    return apiRequest<{ pharmacies: PublicPharmacy[] }>(`/api/public/pharmacies?${params.toString()}`);
  },
  submitComplaint(payload: {
    pharmacyId: string;
    batchId?: string;
    customerName: string;
    customerContact: string;
    issueType: ComplaintIssueType;
    description: string;
  }) {
    return apiRequest<{ complaint: ComplaintRecord }>('/api/public/complaints', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  trackComplaint(complaintId: string) {
    return apiRequest<{ complaint: ComplaintRecord }>(
      `/api/public/complaints/${encodeURIComponent(complaintId)}`
    );
  },
  getManufacturerDashboard() {
    return apiRequest<{
      batches: ManufacturerBatchView[];
      dispatches: ManufacturerDispatchView[];
      pharmacies: Array<{
        entityId: string;
        organizationName: string;
        area: string;
        contact: string;
      }>;
    }>('/api/manufacturer/dashboard');
  },
  createProductionBatch(payload: {
    medicineName: string;
    drugGroup: DrugGroup;
    totalQuantity: number;
    unitPrice: number;
    productionDate: string;
    expiryDate: string;
  }) {
    return apiRequest<{ batch: ManufacturerBatchView }>('/api/manufacturer/batches', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  dispatchSupply(payload: {
    batchId: string;
    pharmacyId: string;
    quantity: number;
    supplyDate: string;
  }) {
    return apiRequest<{ dispatch: SupplyDispatch }>('/api/manufacturer/dispatches', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getPharmacyDashboard() {
    return apiRequest<{
      inventory: PharmacyInventoryItem[];
      sales: SaleRecord[];
      totalRevenue: number;
    }>('/api/pharmacy/dashboard');
  },
  createPharmacySale(payload: { batchId: string; quantity: number }) {
    return apiRequest<{ sale: SaleRecord; remainingStock: number }>(
      '/api/pharmacy/sales',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },
  getRegulatorDashboard() {
    return apiRequest<{
      batches: RegulatorBatchView[];
      complaints: ComplaintRecord[];
      summary: RegulatorSummary;
    }>('/api/regulator/dashboard');
  },
  toggleBatchRecall(batchId: string, recall: boolean, recallReason?: string) {
    return apiRequest<{ batch: RegulatorBatchView }>(
      `/api/regulator/batches/${encodeURIComponent(batchId)}/recall`,
      {
        method: 'POST',
        body: JSON.stringify({ recall, recallReason }),
      }
    );
  },
  updateComplaintStatus(
    complaintId: string,
    status: Extract<ComplaintStatus, 'Resolved' | 'Dismissed'>,
    officialRemarks: string
  ) {
    return apiRequest<{ complaint: ComplaintRecord }>(
      `/api/regulator/complaints/${encodeURIComponent(complaintId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status, officialRemarks }),
      }
    );
  },
  askPharmaAi(
    message: string,
    history: Array<{ role: 'user' | 'assistant'; text: string }>
  ) {
    return apiRequest<{
      reply: string;
      verifiedBatches: Array<{
        batchId: string;
        found: boolean;
        status: BatchStatus;
        medicineName?: string;
        drugGroup?: string;
        manufacturerName?: string;
        expiryDate?: string;
      }>;
    }>('/api/pharma-ai', {
      method: 'POST',
      body: JSON.stringify({ message, history }),
    });
  },
};
