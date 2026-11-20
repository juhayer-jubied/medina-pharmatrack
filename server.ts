import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import Groq from 'groq-sdk';
import {
  COMPLAINT_ISSUE_TYPES,
  DRUG_GROUPS,
  PHARMACY_AREAS,
  computeBatchStatus,
  extractBatchIdsFromText,
  generateBatchId,
  generateNextSequenceId,
  generatePharmacySalesId,
  generateSupplyId,
  getManufacturerDispatchedQty,
  getManufacturerRemainingQty,
  getPharmacyBatchReceivedQty,
  getPharmacyBatchRemainingQty,
  getPharmacyBatchSoldQty,
  getTodayISODate,
  isLowStock,
  isValidISODate,
  validateBatchDates,
  type ComplaintIssueType,
  type ComplaintStatus,
  type DrugGroup,
  type PharmacyArea,
  type ProductionBatch,
  type PublicUser,
  type UserRole,
} from './src/lib/pharmaLogic.ts';
import {
  hashPassword,
  initMongoDB,
  loadStore,
  saveStore,
  signSessionToken,
  toPublicUser,
  verifyPassword,
  verifySessionToken,
} from './server/store.ts';

interface AuthenticatedRequest extends Request {
  user?: PublicUser;
}

const VALID_ROLES: readonly UserRole[] = [
  'Company',
  'Pharmacy',
  'DGDA Regulator',
];

function normalizeRoleInput(rawRole: string): UserRole | '' {
  const trimmed = rawRole.trim();
  if (trimmed === 'Manufacturer') return 'Company';
  if (VALID_ROLES.includes(trimmed as UserRole)) {
    return trimmed as UserRole;
  }
  return '';
}

function buildDefaultMapsUrl(name: string, address: string, area: string): string {
  const q = [name, address, area].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function getBearerUser(req: Request): PublicUser | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  const payload = verifySessionToken(token);
  if (!payload) return null;

  const store = loadStore();
  const found = store.users.find((u) => u.id === payload.userId);
  return found ? toPublicUser(found) : null;
}

function requireAuth(allowedRoles?: readonly UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const user = getBearerUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required. Please sign in.' });
      return;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      res.status(403).json({
        error: `Access denied. This portal requires one of: ${allowedRoles.join(', ')}.`,
      });
      return;
    }
    req.user = user;
    next();
  };
}

function getGroqClient(): Groq | null {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Groq({ apiKey });
}

async function startServer() {
  await initMongoDB();
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  // --- Health ---
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'MediNa - PharmaTrack' });
  });

  // --- Auth Endpoints ---
  app.post('/api/auth/register', (req, res) => {
    const body = req.body ?? {};
    const organizationName = String(body.organizationName ?? '').trim();
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    const role = normalizeRoleInput(String(body.role ?? ''));
    const entityId = String(body.entityId ?? '').trim().toUpperCase();
    const rawCompanyPrefix = String(body.companyPrefix ?? '')
      .replace(/[^A-Za-z]/g, '')
      .toUpperCase();
    const ownerName = String(body.ownerName ?? '').trim();
    const area = String(body.area ?? '').trim() as PharmacyArea;
    const address = String(body.address ?? '').trim();
    const contact = String(body.contact ?? '').trim();
    const rawMapsUrl = String(body.googleMapsUrl ?? '').trim();

    if (!organizationName || organizationName.length < 2) {
      res.status(400).json({ error: 'Full or organization name is required (at least 2 characters).' });
      return;
    }
    if (!username || username.length < 3 || /\s/.test(username)) {
      res.status(400).json({ error: 'Username must be at least 3 characters with no spaces.' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    if (!role) {
      res.status(400).json({ error: 'Invalid role selected.' });
      return;
    }
    if (!entityId || entityId.length < 1) {
      res.status(400).json({ error: 'License / Entity ID is required (e.g., 1, 2, or DSC_01).' });
      return;
    }
    if (role === 'Company' && rawCompanyPrefix && rawCompanyPrefix.length !== 3) {
      res.status(400).json({ error: 'Company batch prefix must be exactly 3 letters (e.g., CPA, CPB, SQP).' });
      return;
    }
    if (role === 'Pharmacy') {
      if (!PHARMACY_AREAS.includes(area)) {
        res.status(400).json({ error: 'Pharmacies must select an area (Daffodil, Mirpur, or Uttara).' });
        return;
      }
      if (!address) {
        res.status(400).json({ error: 'Pharmacy address is required.' });
        return;
      }
      if (!contact) {
        res.status(400).json({ error: 'Pharmacy contact number is required.' });
        return;
      }
    }

    const store = loadStore();
    if (store.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      res.status(409).json({ error: 'This username is already registered.' });
      return;
    }
    if (store.users.some((u) => u.entityId.toUpperCase() === entityId)) {
      res.status(409).json({ error: `License / Entity ID "${entityId}" is already registered.` });
      return;
    }

    const resolvedMapsUrl =
      role === 'Pharmacy'
        ? rawMapsUrl || buildDefaultMapsUrl(organizationName, address, area)
        : undefined;

    const newUser = {
      id: crypto.randomUUID(),
      organizationName,
      username,
      passwordHash: hashPassword(password),
      role,
      entityId,
      ...(role === 'Company' && rawCompanyPrefix ? { companyPrefix: rawCompanyPrefix } : {}),
      ...(role === 'Pharmacy'
        ? {
            ownerName: ownerName || organizationName,
            area,
            address,
            contact,
            googleMapsUrl: resolvedMapsUrl,
          }
        : {}),
      createdAt: new Date().toISOString(),
    };

    store.users.push(newUser);
    saveStore(store);

    const publicUser = toPublicUser(newUser);
    const token = signSessionToken({
      userId: publicUser.id,
      username: publicUser.username,
      role: publicUser.role,
      entityId: publicUser.entityId,
    });

    res.status(201).json({ user: publicUser, token });
  });

  app.post('/api/auth/login', (req, res) => {
    const body = req.body ?? {};
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    const requestedRole = body.role ? normalizeRoleInput(String(body.role)) : '';

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }

    const store = loadStore();
    const user = store.users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }
    if (requestedRole && user.role !== requestedRole) {
      res.status(403).json({
        error: `Account "${user.username}" belongs to ${user.role}, not the ${requestedRole} portal.`,
      });
      return;
    }

    const publicUser = toPublicUser(user);
    const token = signSessionToken({
      userId: publicUser.id,
      username: publicUser.username,
      role: publicUser.role,
      entityId: publicUser.entityId,
    });

    res.json({ user: publicUser, token });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = getBearerUser(req);
    if (!user) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    res.json({ user });
  });

  // --- Public Portal Endpoints ---
  app.get('/api/public/verify', (req, res) => {
    const batchId = String(req.query.batchId ?? '').trim().toUpperCase();
    const pharmacyId = String(req.query.pharmacyId ?? '').trim().toUpperCase();

    if (!batchId) {
      res.status(400).json({ error: 'Please provide a Batch ID to verify.' });
      return;
    }

    const store = loadStore();
    const today = getTodayISODate();
    const batch = store.batches.find((b) => b.batchId.toUpperCase() === batchId);
    const status = computeBatchStatus(batch, today);

    if (!batch) {
      res.json({
        found: false,
        batchId,
        status,
        checkedAt: new Date().toISOString(),
      });
      return;
    }

    let pharmacyVerification: null | {
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
    } = null;

    if (pharmacyId) {
      const pharmacy = store.users.find(
        (u) => u.role === 'Pharmacy' && u.entityId.toUpperCase() === pharmacyId
      );
      const receivedQty = getPharmacyBatchReceivedQty(batch.batchId, pharmacyId, store.supplies);
      const soldQty = getPharmacyBatchSoldQty(batch.batchId, pharmacyId, store.sales);
      const remainingStock = Math.max(0, receivedQty - soldQty);
      pharmacyVerification = {
        pharmacyId,
        found: Boolean(pharmacy),
        pharmacyName: pharmacy?.organizationName,
        ownerName: pharmacy?.ownerName,
        area: pharmacy?.area,
        address: pharmacy?.address,
        contact: pharmacy?.contact,
        googleMapsUrl: pharmacy?.googleMapsUrl,
        receivedQty,
        soldQty,
        remainingStock,
      };
    }

    res.json({
      found: true,
      status,
      checkedAt: new Date().toISOString(),
      batch: {
        batchId: batch.batchId,
        medicineName: batch.medicineName,
        drugGroup: batch.drugGroup,
        manufacturerId: batch.manufacturerId,
        manufacturerName: batch.manufacturerName,
        unitPrice: batch.unitPrice,
        productionDate: batch.productionDate,
        expiryDate: batch.expiryDate,
        isRecalled: batch.isRecalled,
        recallReason: batch.recallReason,
      },
      pharmacyVerification,
    });
  });

  app.get('/api/public/stock', (req, res) => {
    const drugGroup = String(req.query.drugGroup ?? 'All').trim();
    const store = loadStore();
    const today = getTodayISODate();

    const pharmacies = store.users.filter((u) => u.role === 'Pharmacy');
    const results: Array<{
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
    }> = [];

    for (const batch of store.batches) {
      if (drugGroup !== 'All' && batch.drugGroup !== drugGroup) continue;
      if (computeBatchStatus(batch, today) !== 'AUTHENTIC') continue;

      for (const pharmacy of pharmacies) {
        const remaining = getPharmacyBatchRemainingQty(
          batch.batchId,
          pharmacy.entityId,
          store.supplies,
          store.sales
        );
        if (remaining > 0) {
          results.push({
            batchId: batch.batchId,
            medicineName: batch.medicineName,
            drugGroup: batch.drugGroup,
            manufacturerName: batch.manufacturerName,
            unitPrice: batch.unitPrice,
            expiryDate: batch.expiryDate,
            pharmacyId: pharmacy.entityId,
            pharmacyName: pharmacy.organizationName,
            area: pharmacy.area ?? '',
            address: pharmacy.address ?? '',
            contact: pharmacy.contact ?? '',
            availableStock: remaining,
          });
        }
      }
    }

    res.json({ items: results });
  });

  app.get('/api/public/pharmacies', (req, res) => {
    const area = String(req.query.area ?? 'All').trim();
    const store = loadStore();

    const pharmacies = store.users
      .filter((u) => u.role === 'Pharmacy' && (area === 'All' || u.area === area))
      .map((u) => ({
        entityId: u.entityId,
        organizationName: u.organizationName,
        ownerName: u.ownerName ?? u.organizationName,
        area: u.area ?? '',
        address: u.address ?? '',
        contact: u.contact ?? '',
        googleMapsUrl:
          u.googleMapsUrl ??
          buildDefaultMapsUrl(u.organizationName, u.address ?? '', u.area ?? ''),
        createdAt: u.createdAt,
      }));

    res.json({ pharmacies });
  });

  app.post('/api/public/complaints', (req, res) => {
    const body = req.body ?? {};
    const pharmacyId = String(body.pharmacyId ?? '').trim().toUpperCase();
    const batchId = String(body.batchId ?? '').trim().toUpperCase();
    const customerName = String(body.customerName ?? '').trim();
    const customerContact = String(body.customerContact ?? '').trim();
    const issueType = String(body.issueType ?? '').trim() as ComplaintIssueType;
    const description = String(body.description ?? '').trim();

    if (!pharmacyId) {
      res.status(400).json({ error: 'Pharmacy ID is required.' });
      return;
    }
    if (!customerName || customerName.length < 2) {
      res.status(400).json({ error: 'Your name is required.' });
      return;
    }
    if (!customerContact || customerContact.length < 6) {
      res.status(400).json({ error: 'Valid contact phone or email is required.' });
      return;
    }
    if (!COMPLAINT_ISSUE_TYPES.includes(issueType)) {
      res.status(400).json({ error: 'Please select a valid complaint issue type.' });
      return;
    }
    if (!description || description.length < 5) {
      res.status(400).json({ error: 'Please provide a brief description of the issue.' });
      return;
    }

    const store = loadStore();
    const pharmacy = store.users.find(
      (u) => u.role === 'Pharmacy' && u.entityId.toUpperCase() === pharmacyId
    );
    if (!pharmacy) {
      res.status(404).json({ error: `Registered Pharmacy "${pharmacyId}" not found.` });
      return;
    }

    const complaintId = generateNextSequenceId(
      'CPM',
      store.complaints.map((c) => c.complaintId),
      3
    );

    const complaint = {
      complaintId,
      pharmacyId: pharmacy.entityId,
      pharmacyName: pharmacy.organizationName,
      ...(batchId ? { batchId } : {}),
      customerName,
      customerContact,
      issueType,
      description,
      status: 'Pending' as ComplaintStatus,
      officialRemarks: 'Under DGDA Review',
      createdAt: new Date().toISOString(),
    };

    store.complaints.push(complaint);
    saveStore(store);

    res.status(201).json({ complaint });
  });

  app.get('/api/public/complaints/:complaintId', (req, res) => {
    const complaintId = String(req.params.complaintId ?? '').trim().toUpperCase();
    const store = loadStore();
    const complaint = store.complaints.find(
      (c) => c.complaintId.toUpperCase() === complaintId
    );
    if (!complaint) {
      res.status(404).json({ error: `Complaint "${complaintId}" was not found.` });
      return;
    }
    res.json({ complaint });
  });

  // --- Company (Manufacturer) Portal Endpoints ---
  app.get(
    '/api/manufacturer/dashboard',
    requireAuth(['Company']),
    (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const store = loadStore();
      const today = getTodayISODate();

      const batches = store.batches
        .filter((b) => b.manufacturerId === user.entityId)
        .map((b) => {
          const dispatchedQty = getManufacturerDispatchedQty(b.batchId, store.supplies);
          const remainingQty = getManufacturerRemainingQty(b, store.supplies);
          return {
            ...b,
            status: computeBatchStatus(b, today),
            dispatchedQty,
            remainingQty,
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const dispatches = store.supplies
        .filter((s) => s.manufacturerId === user.entityId)
        .map((s) => {
          const batch = store.batches.find((b) => b.batchId === s.batchId);
          const pharmacyRemaining = getPharmacyBatchRemainingQty(
            s.batchId,
            s.pharmacyId,
            store.supplies,
            store.sales
          );
          return {
            ...s,
            medicineName: batch?.medicineName ?? 'Unknown',
            drugGroup: batch?.drugGroup ?? 'Paracetamol',
            pharmacyRemaining,
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const pharmacies = store.users
        .filter((u) => u.role === 'Pharmacy')
        .map((u) => ({
          entityId: u.entityId,
          organizationName: u.organizationName,
          area: u.area ?? '',
          contact: u.contact ?? '',
        }));

      res.json({ batches, dispatches, pharmacies });
    }
  );

  app.post(
    '/api/manufacturer/batches',
    requireAuth(['Company']),
    (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const body = req.body ?? {};
      const medicineName = String(body.medicineName ?? '').trim();
      const drugGroup = String(body.drugGroup ?? '').trim() as DrugGroup;
      const totalQuantity = Number(body.totalQuantity);
      const unitPrice = Number(body.unitPrice);
      const productionDate = String(body.productionDate ?? '').trim();
      const expiryDate = String(body.expiryDate ?? '').trim();

      if (!medicineName || medicineName.length < 2) {
        res.status(400).json({ error: 'Medicine name is required.' });
        return;
      }
      if (!DRUG_GROUPS.includes(drugGroup)) {
        res.status(400).json({ error: 'Please select a valid drug group.' });
        return;
      }
      if (!Number.isInteger(totalQuantity) || totalQuantity <= 0) {
        res.status(400).json({ error: 'Production quantity must be a positive whole number.' });
        return;
      }
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        res.status(400).json({ error: 'Unit price must be greater than 0.' });
        return;
      }
      const dateCheck = validateBatchDates(productionDate, expiryDate);
      if (!dateCheck.valid) {
        res.status(400).json({ error: dateCheck.error });
        return;
      }

      const store = loadStore();
      const companyUsers = store.users.filter((u) => u.role === 'Company');
      const companyOrdinal = Math.max(
        1,
        companyUsers.findIndex((u) => u.entityId === user.entityId) + 1
      );
      const companyProductionCount = store.batches.filter(
        (b) => b.manufacturerId === user.entityId
      ).length;

      const batchId = generateBatchId({
        entityId: user.entityId,
        drugGroup,
        expiryDate,
        companyProductionCount,
        companyOrdinal,
        customPrefix: user.companyPrefix,
        existingBatchIds: store.batches.map((b) => b.batchId),
      });

      const newBatch: ProductionBatch = {
        batchId,
        medicineName,
        drugGroup,
        manufacturerId: user.entityId,
        manufacturerName: user.organizationName,
        totalQuantity,
        unitPrice: Math.round(unitPrice * 100) / 100,
        productionDate,
        expiryDate,
        isRecalled: false,
        createdAt: new Date().toISOString(),
      };

      store.batches.push(newBatch);
      saveStore(store);

      res.status(201).json({
        batch: {
          ...newBatch,
          status: computeBatchStatus(newBatch, getTodayISODate()),
          dispatchedQty: 0,
          remainingQty: newBatch.totalQuantity,
        },
      });
    }
  );

  app.post(
    '/api/manufacturer/dispatches',
    requireAuth(['Company']),
    (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const body = req.body ?? {};
      const batchId = String(body.batchId ?? '').trim().toUpperCase();
      const pharmacyId = String(body.pharmacyId ?? '').trim().toUpperCase();
      const quantity = Number(body.quantity);
      const supplyDate = String(body.supplyDate ?? getTodayISODate()).trim();

      if (!batchId || !pharmacyId) {
        res.status(400).json({ error: 'Batch ID and Target Pharmacy ID are required.' });
        return;
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        res.status(400).json({ error: 'Dispatch quantity must be a positive whole number.' });
        return;
      }
      if (!isValidISODate(supplyDate)) {
        res.status(400).json({ error: 'Supply date must be a valid YYYY-MM-DD date.' });
        return;
      }

      const store = loadStore();
      const batch = store.batches.find((b) => b.batchId.toUpperCase() === batchId);
      if (!batch) {
        res.status(404).json({ error: `Batch "${batchId}" does not exist.` });
        return;
      }
      if (batch.manufacturerId !== user.entityId) {
        res.status(403).json({ error: 'You can only dispatch batches produced by your organization.' });
        return;
      }

      const status = computeBatchStatus(batch, getTodayISODate());
      if (status === 'RECALLED') {
        res.status(400).json({ error: 'Blocked: Cannot dispatch a DGDA-recalled batch.' });
        return;
      }
      if (status === 'EXPIRED') {
        res.status(400).json({ error: 'Blocked: Cannot dispatch an expired medicine batch.' });
        return;
      }
      if (supplyDate < batch.productionDate) {
        res.status(400).json({
          error: `Supply date (${supplyDate}) cannot precede production date (${batch.productionDate}).`,
        });
        return;
      }
      if (supplyDate >= batch.expiryDate) {
        res.status(400).json({
          error: `Supply date (${supplyDate}) must be before expiry date (${batch.expiryDate}).`,
        });
        return;
      }

      const pharmacy = store.users.find(
        (u) => u.role === 'Pharmacy' && u.entityId.toUpperCase() === pharmacyId
      );
      if (!pharmacy) {
        res.status(404).json({ error: `Registered Pharmacy "${pharmacyId}" not found.` });
        return;
      }

      const remaining = getManufacturerRemainingQty(batch, store.supplies);
      if (quantity > remaining) {
        res.status(400).json({
          error: `Insufficient factory stock. Only ${remaining} pcs remaining for ${batch.batchId}.`,
        });
        return;
      }

      const companyUsers = store.users.filter((u) => u.role === 'Company');
      const companyOrdinal = Math.max(
        1,
        companyUsers.findIndex((u) => u.entityId === user.entityId) + 1
      );
      const companySupplyCount = store.supplies.filter(
        (s) => s.manufacturerId === user.entityId
      ).length;

      const supplyId = generateSupplyId({
        entityId: user.entityId,
        companySupplyCount,
        companyOrdinal,
        customPrefix: user.companyPrefix,
        existingSupplyIds: store.supplies.map((s) => s.supplyId),
      });

      const dispatch = {
        supplyId,
        batchId: batch.batchId,
        manufacturerId: user.entityId,
        manufacturerName: user.organizationName,
        pharmacyId: pharmacy.entityId,
        pharmacyName: pharmacy.organizationName,
        quantity,
        supplyDate,
        createdAt: new Date().toISOString(),
      };

      store.supplies.push(dispatch);
      saveStore(store);

      res.status(201).json({ dispatch });
    }
  );

  // --- Pharmacy Portal & POS Endpoints ---
  app.get(
    '/api/pharmacy/dashboard',
    requireAuth(['Pharmacy']),
    (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const store = loadStore();
      const today = getTodayISODate();

      const batchIdsAtPharmacy = Array.from(
        new Set(
          store.supplies
            .filter((s) => s.pharmacyId === user.entityId)
            .map((s) => s.batchId)
        )
      );

      const inventory = batchIdsAtPharmacy
        .map((batchId) => {
          const batch = store.batches.find((b) => b.batchId === batchId);
          if (!batch) return null;
          const receivedQty = getPharmacyBatchReceivedQty(
            batchId,
            user.entityId,
            store.supplies
          );
          const soldQty = getPharmacyBatchSoldQty(batchId, user.entityId, store.sales);
          const remainingStock = Math.max(0, receivedQty - soldQty);
          const status = computeBatchStatus(batch, today);
          return {
            batchId: batch.batchId,
            medicineName: batch.medicineName,
            drugGroup: batch.drugGroup,
            manufacturerName: batch.manufacturerName,
            unitPrice: batch.unitPrice,
            productionDate: batch.productionDate,
            expiryDate: batch.expiryDate,
            status,
            isRecalled: batch.isRecalled,
            recallReason: batch.recallReason,
            receivedQty,
            soldQty,
            remainingStock,
            isLowStock: isLowStock(remainingStock),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      const sales = store.sales
        .filter((s) => s.pharmacyId === user.entityId)
        .sort((a, b) => b.soldAt.localeCompare(a.soldAt));

      const totalRevenue = sales.reduce((sum, s) => sum + s.totalPrice, 0);

      res.json({
        inventory,
        sales,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
      });
    }
  );

  app.post(
    '/api/pharmacy/sales',
    requireAuth(['Pharmacy']),
    (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const body = req.body ?? {};
      const batchId = String(body.batchId ?? '').trim().toUpperCase();
      const quantity = Number(body.quantity);

      if (!batchId) {
        res.status(400).json({ error: 'Batch ID is required.' });
        return;
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        res.status(400).json({ error: 'Sell quantity must be a positive whole number.' });
        return;
      }

      const store = loadStore();
      const batch = store.batches.find((b) => b.batchId.toUpperCase() === batchId);
      if (!batch) {
        res.status(404).json({ error: `Batch "${batchId}" was not found in the registry.` });
        return;
      }

      const status = computeBatchStatus(batch, getTodayISODate());
      if (status === 'RECALLED') {
        res.status(400).json({
          error: `SALE BLOCKED: Batch ${batch.batchId} has been RECALLED by DGDA. Do not dispense.`,
        });
        return;
      }
      if (status === 'EXPIRED') {
        res.status(400).json({
          error: `SALE BLOCKED: Batch ${batch.batchId} expired on ${batch.expiryDate}. Do not dispense.`,
        });
        return;
      }

      const remaining = getPharmacyBatchRemainingQty(
        batch.batchId,
        user.entityId,
        store.supplies,
        store.sales
      );
      if (remaining <= 0) {
        res.status(400).json({ error: `No available stock of ${batch.batchId} at your pharmacy.` });
        return;
      }
      if (quantity > remaining) {
        res.status(400).json({
          error: `Insufficient stock. Only ${remaining} pcs available for ${batch.batchId}.`,
        });
        return;
      }

      const salesId = generatePharmacySalesId(user.entityId, store.sales);
      const totalPrice = Math.round(quantity * batch.unitPrice * 100) / 100;

      const sale = {
        salesId,
        batchId: batch.batchId,
        pharmacyId: user.entityId,
        pharmacyName: user.organizationName,
        medicineName: batch.medicineName,
        drugGroup: batch.drugGroup,
        quantity,
        unitPrice: batch.unitPrice,
        totalPrice,
        soldAt: new Date().toISOString(),
        soldBy: user.username,
      };

      store.sales.push(sale);
      saveStore(store);

      res.status(201).json({
        sale,
        remainingStock: remaining - quantity,
      });
    }
  );

  // --- DGDA Regulator Endpoints ---
  app.get(
    '/api/regulator/dashboard',
    requireAuth(['DGDA Regulator']),
    (_req: AuthenticatedRequest, res) => {
      const store = loadStore();
      const today = getTodayISODate();

      const batches = store.batches
        .map((b) => {
          const dispatchedQty = getManufacturerDispatchedQty(b.batchId, store.supplies);
          const soldQty = store.sales
            .filter((s) => s.batchId === b.batchId)
            .reduce((sum, s) => sum + s.quantity, 0);
          return {
            ...b,
            status: computeBatchStatus(b, today),
            dispatchedQty,
            soldQty,
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const complaints = [...store.complaints].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );

      const summary = {
        totalBatches: batches.length,
        recalledBatches: batches.filter((b) => b.status === 'RECALLED').length,
        pendingComplaints: complaints.filter((c) => c.status === 'Pending').length,
        registeredManufacturers: store.users.filter((u) => u.role === 'Company').length,
        registeredPharmacies: store.users.filter((u) => u.role === 'Pharmacy').length,
      };

      res.json({ batches, complaints, summary });
    }
  );

  app.post(
    '/api/regulator/batches/:batchId/recall',
    requireAuth(['DGDA Regulator']),
    (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const batchId = String(req.params.batchId ?? '').trim().toUpperCase();
      const body = req.body ?? {};
      const recall = Boolean(body.recall);
      const recallReason = String(body.recallReason ?? '').trim();

      const store = loadStore();
      const batch = store.batches.find((b) => b.batchId.toUpperCase() === batchId);
      if (!batch) {
        res.status(404).json({ error: `Batch "${batchId}" not found.` });
        return;
      }

      batch.isRecalled = recall;
      if (recall) {
        batch.recallReason = recallReason || 'Emergency recall issued by DGDA Regulator.';
        batch.recalledBy = `${user.organizationName} (${user.entityId})`;
        batch.recalledAt = new Date().toISOString();
      } else {
        delete batch.recallReason;
        delete batch.recalledBy;
        delete batch.recalledAt;
      }

      saveStore(store);

      res.json({
        batch: {
          ...batch,
          status: computeBatchStatus(batch, getTodayISODate()),
        },
      });
    }
  );

  app.patch(
    '/api/regulator/complaints/:complaintId',
    requireAuth(['DGDA Regulator']),
    (req: AuthenticatedRequest, res) => {
      const complaintId = String(req.params.complaintId ?? '').trim().toUpperCase();
      const body = req.body ?? {};
      const status = String(body.status ?? '').trim() as ComplaintStatus;
      const officialRemarks = String(body.officialRemarks ?? '').trim();

      if (status !== 'Resolved' && status !== 'Dismissed') {
        res.status(400).json({ error: 'Complaint status must be either Resolved or Dismissed.' });
        return;
      }
      if (!officialRemarks) {
        res.status(400).json({ error: 'Official DGDA remarks are required.' });
        return;
      }

      const store = loadStore();
      const complaint = store.complaints.find(
        (c) => c.complaintId.toUpperCase() === complaintId
      );
      if (!complaint) {
        res.status(404).json({ error: `Complaint "${complaintId}" not found.` });
        return;
      }

      complaint.status = status;
      complaint.officialRemarks = officialRemarks;
      complaint.updatedAt = new Date().toISOString();

      saveStore(store);
      res.json({ complaint });
    }
  );

  // --- Embedded Pharma AI Assistant (Server-Side Groq) ---
  app.post('/api/pharma-ai', async (req, res) => {
    const body = req.body ?? {};
    const message = String(body.message ?? '').trim();
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }

    const ai = getGroqClient();
    if (!ai) {
      res.status(503).json({
        error:
          'Pharma AI requires a configured GROQ_API_KEY in the server environment (Settings > Secrets).',
      });
      return;
    }

    const store = loadStore();
    const today = getTodayISODate();

    // Extract any Batch IDs (e.g. CPA-G1-P01A-1028) from current message and recent history
    const combinedText = [
      message,
      ...history.slice(-6).map((h: { text?: string }) => String(h?.text ?? '')),
    ].join(' ');
    const mentionedBatchIds = extractBatchIdsFromText(combinedText);

    const verifiedBatches = mentionedBatchIds.map((batchId) => {
      const batch = store.batches.find((b) => b.batchId.toUpperCase() === batchId);
      const status = computeBatchStatus(batch, today);
      if (!batch) {
        return { batchId, found: false, status };
      }
      const pharmacyStock = store.users
        .filter((u) => u.role === 'Pharmacy')
        .map((p) => ({
          pharmacyId: p.entityId,
          pharmacyName: p.organizationName,
          area: p.area ?? '',
          remainingStock: getPharmacyBatchRemainingQty(
            batch.batchId,
            p.entityId,
            store.supplies,
            store.sales
          ),
        }))
        .filter((p) => p.remainingStock > 0);

      return {
        batchId: batch.batchId,
        found: true,
        status,
        medicineName: batch.medicineName,
        drugGroup: batch.drugGroup,
        manufacturerName: batch.manufacturerName,
        manufacturerId: batch.manufacturerId,
        unitPrice: batch.unitPrice,
        productionDate: batch.productionDate,
        expiryDate: batch.expiryDate,
        isRecalled: batch.isRecalled,
        recallReason: batch.recallReason ?? null,
        pharmacyStock,
      };
    });

    const systemContext = [
      'You are MediNa AI, the official pharmaceutical traceability and DGDA regulatory compliance assistant embedded inside MediNa - PharmaTrack.',
      'Your capabilities and strict safety boundaries:',
      '1. BATCH VERIFICATION: Always verify Batch IDs (format like CPA-G1-P01A-1028) strictly against the LIVE_DATABASE_LOOKUP JSON provided in the prompt. Never guess, fabricate, or assume a batch is authentic if it is UNVERIFIED, EXPIRED, or RECALLED.',
      '2. DGDA COMPLIANCE GUIDANCE: Explain what AUTHENTIC, EXPIRED, RECALLED, and UNVERIFIED statuses mean, how citizens can check pharmacy stock, and how to file a citizen complaint (CPM001, etc.) under Report & Track for suspected counterfeit, expired, or overpriced medicines.',
      '3. STRICT MEDICAL REFUSAL POLICY: You MUST STRICTLY REFUSE to diagnose medical conditions, interpret patient symptoms, recommend treatments, or prescribe/suggest medicine dosages. If a user asks for a diagnosis, treatment plan, or prescription, clearly and politely decline, state that you are a supply-chain and DGDA verification assistant only, and advise consulting a licensed physician or visiting a hospital.',
      '4. Keep answers concise, factual, well-structured, and free of markdown fluff.',
      `Current system date: ${today}.`,
      `Total batches currently registered in live database: ${store.batches.length}.`,
      `Total registered pharmacies: ${store.users.filter((u) => u.role === 'Pharmacy').length}.`,
    ].join('\n');

    const formattedHistory = history
      .slice(-8)
      .map(
        (h: { role?: string; text?: string }) =>
          `${h.role === 'user' ? 'User' : 'Pharma AI'}: ${String(h.text ?? '')}`
      )
      .join('\n');

    const prompt = [
      formattedHistory ? `Conversation History:\n${formattedHistory}\n` : '',
      `LIVE_DATABASE_LOOKUP:\n${JSON.stringify(verifiedBatches, null, 2)}`,
      `\nCurrent User Message:\n${message}`,
    ].join('\n');

    try {
      const response = await ai.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemContext },
          { role: 'user', content: prompt },
        ],
      });
      const reply = (response.choices[0]?.message?.content ?? '').trim();
      if (!reply) {
        res.status(502).json({ error: 'Pharma AI returned an empty response.' });
        return;
      }
      res.json({ reply, verifiedBatches });
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'Unknown Groq API error';
      console.error('Pharma AI error:', err);

      let cleanMsg = rawMsg;
      try {
        const parsed = JSON.parse(rawMsg);
        if (parsed?.error?.message) {
          cleanMsg = String(parsed.error.message);
        }
      } catch {
        // Keep rawMsg if not JSON
      }

      if (
        rawMsg.includes('PERMISSION_DENIED') ||
        rawMsg.includes('API_KEY_INVALID') ||
        rawMsg.includes('403') ||
        rawMsg.includes('400')
      ) {
        res.status(502).json({
          error: `Pharma AI is unavailable: ${cleanMsg} Please check your GROQ_API_KEY and billing tier in Settings > Secrets.`,
        });
        return;
      }

      res.status(502).json({ error: `Pharma AI service error: ${cleanMsg}` });
    }
  });

  // --- Vite Dev Middleware / Production Static Serving ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`MediNa - PharmaTrack listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
