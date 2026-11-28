import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  COMPLAINT_ISSUE_TYPES,
  DRUG_GROUPS,
  NOTIFICATION_CATEGORIES,
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
  type BatchApprovalStatus,
  type ComplaintIssueType,
  type ComplaintStatus,
  type DrugGroup,
  type NotificationCategory,
  type NotificationRecord,
  type NotificationTargetType,
  type PharmacyApprovalStatus,
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

const VALID_NOTIFICATION_TARGETS: readonly NotificationTargetType[] = [
  'PUBLIC',
  'ALL_COMPANIES',
  'ALL_PHARMACIES',
  'INDIVIDUAL',
  'EVERYONE',
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

// Transliterate Bangla medicine names/queries into Latin phonetic text for database matching
function transliterateBanglaToLatin(text: string): string {
  const commonDrugMap: Record<string, string> = {
    'নাপা': 'napa',
    'পেইনাক্স': 'painax',
    'পেনাক্স': 'painax',
    'পাইনাক্স': 'painax',
    'ই-ক্যাপ': 'e-cap ecap',
    'ই ক্যাপ': 'e-cap ecap',
    'ইক্যাপ': 'e-cap ecap',
    'সেকলো': 'seclo',
    'সার্জেল': 'sergel',
    'মন্টিয়ার': 'montair',
    'মোনাস': 'monas',
    'অ্যালাট্রল': 'alatrol',
    'এলাট্রল': 'alatrol',
    'ফেক্সো': 'fexo',
    'প্যারাসিটামল': 'paracetamol',
    'পেইনকিলার': 'painkillers',
    'অ্যান্টিবায়োটিক': 'antibiotics',
    'অ্যান্টাসিড': 'antacids',
    'ভিটামিন': 'vitamins',
  };

  let mapped = text;
  for (const [bn, en] of Object.entries(commonDrugMap)) {
    mapped = mapped.replaceAll(bn, ` ${en} `);
  }

  // Fallback character-by-character Bangla phonetic transliteration
  const charMap: Record<string, string> = {
    'অ': 'o', 'আ': 'a', 'ই': 'i', 'ঈ': 'i', 'উ': 'u', 'ঊ': 'u', 'এ': 'e', 'ঐ': 'oi', 'ও': 'o', 'ঔ': 'ou',
    'া': 'a', 'ি': 'i', 'ী': 'i', 'ু': 'u', 'ূ': 'u', 'ে': 'e', 'ৈ': 'oi', 'ো': 'o', 'ৌ': 'ou', '্': '',
    'ক': 'k', 'খ': 'kh', 'গ': 'g', 'ঘ': 'gh', 'ঙ': 'ng',
    'চ': 'c', 'ছ': 'ch', 'জ': 'j', 'ঝ': 'jh', 'ঞ': 'n',
    'ট': 't', 'ঠ': 'th', 'ড': 'd', 'ঢ': 'dh', 'ণ': 'n',
    'ত': 't', 'থ': 'th', 'দ': 'd', 'ধ': 'dh', 'ন': 'n',
    'প': 'p', 'ফ': 'f', 'ব': 'b', 'ভ': 'bh', 'ম': 'm',
    'য': 'j', 'র': 'r', 'ল': 'l', 'শ': 's', 'ষ': 's', 'স': 's', 'হ': 'h',
    'ড়': 'r', 'ঢ়': 'rh', 'য়': 'y', 'ং': 'ng', 'ঃ': 'h', 'ঁ': '',
  };

  let phonetic = '';
  for (const ch of mapped) {
    phonetic += charMap[ch] ?? ch;
  }

  return `${mapped} ${phonetic}`.toLowerCase();
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

async function startServer() {
  await initMongoDB();

  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  // --- Ensure Official Pre-seeded DGDA Regulator Account Exists ---
  const initialStore = loadStore();
  if (!initialStore.users.some((u) => u.role === 'DGDA Regulator')) {
    initialStore.users.push({
      id: crypto.randomUUID(),
      organizationName: 'DGDA Bangladesh Headquarters',
      username: process.env.DGDA_ADMIN_USER || 'dgda_admin',
      passwordHash: hashPassword(process.env.DGDA_ADMIN_PASS || 'Dgda@2026'),
      role: 'DGDA Regulator',
      entityId: 'DGDA-HQ',
      approvalStatus: 'APPROVED',
      createdAt: new Date().toISOString(),
    });
    saveStore(initialStore);
    console.log('Pre-seeded official DGDA Regulator account (username: dgda_admin)');
  }

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
    if (role === 'DGDA Regulator') {
      res.status(403).json({
        error: 'Public registration is disabled for DGDA Regulator accounts. Please sign in with official DGDA credentials.',
      });
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

    const isPharmacy = role === 'Pharmacy';
    const newUser = {
      id: crypto.randomUUID(),
      organizationName,
      username,
      passwordHash: hashPassword(password),
      role,
      entityId,
      ...(role === 'Company' && rawCompanyPrefix ? { companyPrefix: rawCompanyPrefix } : {}),
      ...(isPharmacy
        ? {
            ownerName: ownerName || organizationName,
            area,
            address,
            contact,
            googleMapsUrl: resolvedMapsUrl,
            approvalStatus: 'PENDING_APPROVAL' as PharmacyApprovalStatus,
            approvalRemarks:
              'Awaiting DGDA verification of pharmacy license and physical premises.',
          }
        : {
            approvalStatus: 'APPROVED' as PharmacyApprovalStatus,
          }),
      createdAt: new Date().toISOString(),
    };

    store.users.push(newUser);
    saveStore(store);

    const publicUser = toPublicUser(newUser);

    if (isPharmacy) {
      res.status(201).json({
        requiresApproval: true,
        approvalStatus: 'PENDING_APPROVAL',
        message:
          'Pharmacy registration submitted successfully! Your Drug License ID has been forwarded to the DGDA Regulator for verification. You will be able to sign in once DGDA approves your pharmacy.',
        user: publicUser,
      });
      return;
    }

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

    if (user.role === 'Pharmacy') {
      const status = user.approvalStatus || 'PENDING_APPROVAL';
      if (status === 'PENDING_APPROVAL') {
        res.status(403).json({
          error: `Your pharmacy registration and License ID (${user.entityId}) are currently pending DGDA regulatory approval. Please await official DGDA license verification before signing in.`,
        });
        return;
      }
      if (status === 'REJECTED') {
        res.status(403).json({
          error: `Your pharmacy registration was rejected by DGDA Regulator: ${
            user.approvalRemarks || 'License not verified'
          }.`,
        });
        return;
      }
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

  // --- Delete Own Profile (Company & Pharmacy Admins) ---
  app.delete('/api/auth/profile', requireAuth(['Company', 'Pharmacy']), (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const store = loadStore();
    const index = store.users.findIndex((u) => u.id === user.id);

    if (index === -1) {
      res.status(404).json({ error: 'User profile not found.' });
      return;
    }

    store.users.splice(index, 1);
    saveStore(store);

    res.json({ ok: true, message: 'Account and profile permanently deleted.' });
  });

  // --- Notifications Endpoints (Public, Company, Pharmacy) ---
  app.get('/api/notifications', (req, res) => {
    const user = getBearerUser(req);
    const store = loadStore();

    const filtered = store.notifications
      .filter((n) => {
        if (!user) {
          return n.targetType === 'PUBLIC' || n.targetType === 'EVERYONE';
        }
        if (user.role === 'Company') {
          return (
            n.targetType === 'ALL_COMPANIES' ||
            n.targetType === 'EVERYONE' ||
            (n.targetType === 'INDIVIDUAL' &&
              n.targetEntityId?.toUpperCase() === user.entityId.toUpperCase())
          );
        }
        if (user.role === 'Pharmacy') {
          return (
            n.targetType === 'ALL_PHARMACIES' ||
            n.targetType === 'EVERYONE' ||
            (n.targetType === 'INDIVIDUAL' &&
              n.targetEntityId?.toUpperCase() === user.entityId.toUpperCase())
          );
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.json({ notifications: filtered });
  });

  app.post('/api/notifications/read', requireAuth(['Company', 'Pharmacy']), (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const body = req.body ?? {};
    const notificationId = String(body.notificationId ?? '').trim().toUpperCase();

    const store = loadStore();
    let updated = false;

    for (const n of store.notifications) {
      const isVisible =
        n.targetType === 'EVERYONE' ||
        (user.role === 'Company' && n.targetType === 'ALL_COMPANIES') ||
        (user.role === 'Pharmacy' && n.targetType === 'ALL_PHARMACIES') ||
        (n.targetType === 'INDIVIDUAL' &&
          n.targetEntityId?.toUpperCase() === user.entityId.toUpperCase());

      if (!isVisible) continue;
      if (notificationId && n.notificationId.toUpperCase() !== notificationId) continue;

      if (!Array.isArray(n.readBy)) {
        n.readBy = [];
      }
      if (!n.readBy.includes(user.id)) {
        n.readBy.push(user.id);
        updated = true;
      }
    }

    if (updated) {
      saveStore(store);
    }

    res.json({ ok: true });
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
        approvalStatus: batch.approvalStatus || 'PENDING_APPROVAL',
        approvalRemarks: batch.approvalRemarks,
        approvedBy: batch.approvedBy,
        approvedAt: batch.approvedAt,
      },
      pharmacyVerification,
    });
  });

  app.get('/api/public/stock', (req, res) => {
    const drugGroup = String(req.query.drugGroup ?? 'All').trim();
    const medicineName = String(req.query.medicineName ?? '').trim().toLowerCase();
    const store = loadStore();
    const today = getTodayISODate();

    const pharmacies = store.users.filter(
      (u) => u.role === 'Pharmacy' && (u.approvalStatus === 'APPROVED' || !u.approvalStatus)
    );
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
      if (
        medicineName &&
        !batch.medicineName.toLowerCase().includes(medicineName) &&
        !batch.batchId.toLowerCase().includes(medicineName)
      ) {
        continue;
      }
      if (batch.approvalStatus && batch.approvalStatus !== 'APPROVED') continue;
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
      .filter(
        (u) =>
          u.role === 'Pharmacy' &&
          (u.approvalStatus === 'APPROVED' || !u.approvalStatus) &&
          (area === 'All' || u.area === area)
      )
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
            approvalStatus: b.approvalStatus || 'PENDING_APPROVAL',
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
        .filter(
          (u) =>
            u.role === 'Pharmacy' && (u.approvalStatus === 'APPROVED' || !u.approvalStatus)
        )
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
        approvalStatus: 'PENDING_APPROVAL',
        approvalRemarks: 'Awaiting DGDA Regulator review and commercial distribution approval.',
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

      if (batch.approvalStatus !== 'APPROVED') {
        res.status(400).json({
          error: `Blocked: Batch "${batch.batchId}" cannot be dispatched or supplied to pharmacies. Current DGDA status: ${
            batch.approvalStatus === 'REJECTED' ? 'REJECTED by DGDA' : 'PENDING DGDA APPROVAL'
          }. Only DGDA-approved production batches can be distributed.`,
        });
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
      if (pharmacy.approvalStatus && pharmacy.approvalStatus !== 'APPROVED') {
        res.status(400).json({
          error: `Blocked: Pharmacy "${pharmacy.organizationName}" (${pharmacy.entityId}) has not been approved by DGDA Regulator yet. Only DGDA-verified licensed pharmacies can receive medicine stock.`,
        });
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
      if (batch.approvalStatus && batch.approvalStatus !== 'APPROVED') {
        res.status(400).json({
          error: `SALE BLOCKED: Batch ${batch.batchId} has not received DGDA approval for market sale.`,
        });
        return;
      }
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
            approvalStatus: b.approvalStatus || 'PENDING_APPROVAL',
            status: computeBatchStatus(b, today),
            dispatchedQty,
            soldQty,
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const complaints = [...store.complaints].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );

      const companies = store.users
        .filter((u) => u.role === 'Company')
        .map((u) => ({
          id: u.id,
          entityId: u.entityId,
          organizationName: u.organizationName,
          username: u.username,
        }))
        .sort((a, b) => a.organizationName.localeCompare(b.organizationName));

      const pharmacies = store.users
        .filter((u) => u.role === 'Pharmacy')
        .map((u) => ({
          id: u.id,
          entityId: u.entityId,
          organizationName: u.organizationName,
          ownerName: u.ownerName || u.organizationName,
          area: u.area || '',
          address: u.address || '',
          contact: u.contact || '',
          googleMapsUrl: u.googleMapsUrl,
          approvalStatus: (u.approvalStatus || 'PENDING_APPROVAL') as PharmacyApprovalStatus,
          approvalRemarks: u.approvalRemarks,
          approvedBy: u.approvedBy,
          approvedAt: u.approvedAt,
          createdAt: u.createdAt,
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const notifications = [...store.notifications].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );

      const summary = {
        totalBatches: batches.length,
        pendingApprovals: batches.filter(
          (b) => (b.approvalStatus || 'PENDING_APPROVAL') === 'PENDING_APPROVAL'
        ).length,
        approvedBatches: batches.filter((b) => b.approvalStatus === 'APPROVED').length,
        rejectedBatches: batches.filter((b) => b.approvalStatus === 'REJECTED').length,
        recalledBatches: batches.filter((b) => b.status === 'RECALLED').length,
        pendingComplaints: complaints.filter((c) => c.status === 'Pending').length,
        pendingPharmacyApprovals: pharmacies.filter(
          (p) => p.approvalStatus === 'PENDING_APPROVAL'
        ).length,
        approvedPharmacies: pharmacies.filter((p) => p.approvalStatus === 'APPROVED').length,
        rejectedPharmacies: pharmacies.filter((p) => p.approvalStatus === 'REJECTED').length,
        registeredManufacturers: companies.length,
        registeredPharmacies: pharmacies.length,
      };

      res.json({ batches, companies, pharmacies, complaints, notifications, summary });
    }
  );

  app.post(
    '/api/regulator/notifications',
    requireAuth(['DGDA Regulator']),
    (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const body = req.body ?? {};
      const title = String(body.title ?? '').trim();
      const message = String(body.message ?? '').trim();
      const category = String(body.category ?? 'General Notice').trim() as NotificationCategory;
      const targetType = String(body.targetType ?? '').trim() as NotificationTargetType;
      const targetEntityId = String(body.targetEntityId ?? '').trim().toUpperCase();

      if (!title || title.length < 3) {
        res.status(400).json({ error: 'Notification title is required (at least 3 characters).' });
        return;
      }
      if (!message || message.length < 5) {
        res.status(400).json({ error: 'Notification message is required (at least 5 characters).' });
        return;
      }
      if (!NOTIFICATION_CATEGORIES.includes(category)) {
        res.status(400).json({ error: 'Invalid notification category selected.' });
        return;
      }
      if (!VALID_NOTIFICATION_TARGETS.includes(targetType)) {
        res.status(400).json({ error: 'Invalid target audience selected.' });
        return;
      }

      const store = loadStore();
      let targetRole: 'Company' | 'Pharmacy' | undefined;
      let targetEntityName: string | undefined;

      if (targetType === 'INDIVIDUAL') {
        if (!targetEntityId) {
          res.status(400).json({ error: 'Please select or enter a Company or Pharmacy ID.' });
          return;
        }
        const recipient = store.users.find(
          (u) =>
            (u.role === 'Company' || u.role === 'Pharmacy') &&
            u.entityId.toUpperCase() === targetEntityId
        );
        if (!recipient || (recipient.role !== 'Company' && recipient.role !== 'Pharmacy')) {
          res.status(404).json({
            error: `No registered Company or Pharmacy found with ID "${targetEntityId}".`,
          });
          return;
        }
        targetRole = recipient.role;
        targetEntityName = recipient.organizationName;
      }

      const notificationId = generateNextSequenceId(
        'NTF',
        store.notifications.map((n) => n.notificationId),
        3
      );

      const notification: NotificationRecord = {
        notificationId,
        title,
        message,
        category,
        targetType,
        ...(targetType === 'INDIVIDUAL'
          ? {
              targetRole,
              targetEntityId,
              targetEntityName,
            }
          : {}),
        sentBy: `${user.organizationName} (${user.entityId})`,
        readBy: [],
        createdAt: new Date().toISOString(),
      };

      store.notifications.push(notification);
      saveStore(store);

      res.status(201).json({ notification });
    }
  );

  app.patch(
    '/api/regulator/pharmacies/:entityId/approval',
    requireAuth(['DGDA Regulator']),
    (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const entityId = String(req.params.entityId ?? '').trim().toUpperCase();
      const body = req.body ?? {};
      const approvalStatus = String(body.approvalStatus ?? '').trim();
      const remarks = String(body.remarks ?? '').trim();

      if (approvalStatus !== 'APPROVED' && approvalStatus !== 'REJECTED') {
        res.status(400).json({ error: 'Approval status must be either APPROVED or REJECTED.' });
        return;
      }

      const store = loadStore();
      const pharmacy = store.users.find(
        (u) => u.role === 'Pharmacy' && u.entityId.toUpperCase() === entityId
      );
      if (!pharmacy) {
        res.status(404).json({ error: `Pharmacy "${entityId}" not found in registry.` });
        return;
      }

      pharmacy.approvalStatus = approvalStatus as PharmacyApprovalStatus;
      pharmacy.approvalRemarks =
        remarks ||
        (approvalStatus === 'APPROVED'
          ? 'Pharmacy retail license and premises verified & approved by DGDA.'
          : 'Pharmacy registration rejected by DGDA Regulator.');
      pharmacy.approvedBy = `${user.organizationName} (${user.entityId})`;
      pharmacy.approvedAt = new Date().toISOString();

      saveStore(store);

      res.json({
        pharmacy: {
          id: pharmacy.id,
          entityId: pharmacy.entityId,
          organizationName: pharmacy.organizationName,
          ownerName: pharmacy.ownerName || pharmacy.organizationName,
          area: pharmacy.area || '',
          address: pharmacy.address || '',
          contact: pharmacy.contact || '',
          googleMapsUrl: pharmacy.googleMapsUrl,
          approvalStatus: pharmacy.approvalStatus,
          approvalRemarks: pharmacy.approvalRemarks,
          approvedBy: pharmacy.approvedBy,
          approvedAt: pharmacy.approvedAt,
          createdAt: pharmacy.createdAt,
        },
      });
    }
  );

  app.patch(
    '/api/regulator/batches/:batchId/approval',
    requireAuth(['DGDA Regulator']),
    (req: AuthenticatedRequest, res) => {
      const user = req.user!;
      const batchId = String(req.params.batchId ?? '').trim().toUpperCase();
      const body = req.body ?? {};
      const approvalStatus = String(body.approvalStatus ?? '').trim();
      const remarks = String(body.remarks ?? '').trim();

      if (approvalStatus !== 'APPROVED' && approvalStatus !== 'REJECTED') {
        res.status(400).json({ error: 'Approval status must be either APPROVED or REJECTED.' });
        return;
      }

      const store = loadStore();
      const batch = store.batches.find((b) => b.batchId.toUpperCase() === batchId);
      if (!batch) {
        res.status(404).json({ error: `Batch "${batchId}" not found in registry.` });
        return;
      }

      batch.approvalStatus = approvalStatus as BatchApprovalStatus;
      batch.approvalRemarks =
        remarks ||
        (approvalStatus === 'APPROVED'
          ? 'Approved by DGDA for commercial supply and pharmacy distribution.'
          : 'Rejected by DGDA Regulator.');
      batch.approvedBy = `${user.organizationName} (${user.entityId})`;
      batch.approvedAt = new Date().toISOString();

      saveStore(store);

      const today = getTodayISODate();
      const dispatchedQty = getManufacturerDispatchedQty(batch.batchId, store.supplies);
      const soldQty = store.sales
        .filter((s) => s.batchId === batch.batchId)
        .reduce((sum, s) => sum + s.quantity, 0);

      res.json({
        batch: {
          ...batch,
          status: computeBatchStatus(batch, today),
          dispatchedQty,
          soldQty,
        },
      });
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

  // --- Embedded Pharma AI Assistant (Groq API: openai/gpt-oss-120b) ---
  app.post('/api/pharma-ai', async (req, res) => {
    const body = req.body ?? {};
    const message = String(body.message ?? '').trim();
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      res.status(400).json({ error: 'Message cannot be empty.' });
      return;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error: 'MediNa AI requires a configured GROQ_API_KEY in the server environment (.env).',
      });
      return;
    }

    const store = loadStore();
    const today = getTodayISODate();

    // Normalize Bangla & English text for current message and recent history
    const normalizedCurrentMessage = transliterateBanglaToLatin(message);
    const compactCurrentMessage = normalizedCurrentMessage.replace(/[-\s]+/g, '');

    const recentHistorySlice = history.slice(-6);
    const recentContextText = [
      ...recentHistorySlice.map((h: { text?: string }) => String(h?.text ?? '')),
      message,
    ].join(' ');
    const normalizedSearchSpace = transliterateBanglaToLatin(recentContextText);
    const compactSearchSpace = normalizedSearchSpace.replace(/[-\s]+/g, '');

    // Track already-shown batches in recent conversation turns to prevent duplicate UI cards
    const previouslyShownText = recentHistorySlice
      .map((h: { text?: string; verifiedBatches?: Array<{ batchId?: string }> }) => {
        const cardIds = Array.isArray(h?.verifiedBatches)
          ? h.verifiedBatches.map((vb) => vb.batchId ?? '').join(' ')
          : '';
        return `${String(h?.text ?? '')} ${cardIds}`;
      })
      .join(' ');
    const normalizedPreviouslyShown = transliterateBanglaToLatin(previouslyShownText);
    const compactPreviouslyShown = normalizedPreviouslyShown.replace(/[-\s]+/g, '');

    const directMentionedBatchIds = extractBatchIdsFromText(message);
    const contextMentionedBatchIds = extractBatchIdsFromText(recentContextText);

    const directlyMatchedBatchSet = new Set<string>(directMentionedBatchIds);
    const contextMatchedBatchSet = new Set<string>(contextMentionedBatchIds);

    for (const b of store.batches) {
      const batchUpper = b.batchId.toUpperCase();
      const medName = b.medicineName.toLowerCase().trim();
      const compactMedName = medName.replace(/[-\s]+/g, '');
      const medFirstWord = medName.split(/\s+/)[0];
      const compactMedFirstWord = medFirstWord.replace(/[-\s]+/g, '');
      const drugGroupName = b.drugGroup.toLowerCase().trim();

      const matchesCurrent =
        (medName.length >= 3 && normalizedCurrentMessage.includes(medName)) ||
        (compactMedName.length >= 3 && compactCurrentMessage.includes(compactMedName)) ||
        (medFirstWord && medFirstWord.length >= 3 && normalizedCurrentMessage.includes(medFirstWord)) ||
        (compactMedFirstWord && compactMedFirstWord.length >= 3 && compactCurrentMessage.includes(compactMedFirstWord)) ||
        (drugGroupName.length >= 4 && normalizedCurrentMessage.includes(drugGroupName));

      const matchesContext =
        (medName.length >= 3 && normalizedSearchSpace.includes(medName)) ||
        (compactMedName.length >= 3 && compactSearchSpace.includes(compactMedName)) ||
        (medFirstWord && medFirstWord.length >= 3 && normalizedSearchSpace.includes(medFirstWord)) ||
        (compactMedFirstWord && compactMedFirstWord.length >= 3 && compactSearchSpace.includes(compactMedFirstWord)) ||
        (drugGroupName.length >= 4 && normalizedSearchSpace.includes(drugGroupName));

      const alreadyMentionedRecently =
        normalizedPreviouslyShown.includes(batchUpper.toLowerCase()) ||
        (medName.length >= 3 && normalizedPreviouslyShown.includes(medName)) ||
        (compactMedName.length >= 3 && compactPreviouslyShown.includes(compactMedName)) ||
        (medFirstWord && medFirstWord.length >= 3 && normalizedPreviouslyShown.includes(medFirstWord)) ||
        (compactMedFirstWord && compactMedFirstWord.length >= 3 && compactPreviouslyShown.includes(compactMedFirstWord));

      if (matchesContext) {
        contextMatchedBatchSet.add(batchUpper);
      }

      if (matchesCurrent && !alreadyMentionedRecently) {
        directlyMatchedBatchSet.add(batchUpper);
      }
    }

    const approvedPharmacies = store.users.filter(
      (u) => u.role === 'Pharmacy' && (u.approvalStatus === 'APPROVED' || !u.approvalStatus)
    );

    const buildBatchLookupRecord = (batchId: string) => {
      const batch = store.batches.find((b) => b.batchId.toUpperCase() === batchId);
      const status = computeBatchStatus(batch, today);
      if (!batch) {
        return { batchId, found: false, status };
      }
      const pharmacyStock = approvedPharmacies
        .map((p) => ({
          pharmacyId: p.entityId,
          pharmacyName: p.organizationName,
          area: p.area ?? '',
          address: p.address ?? '',
          contact: p.contact ?? '',
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
        approvalStatus: batch.approvalStatus || 'PENDING_APPROVAL',
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
    };

    const contextBatchRecords = Array.from(contextMatchedBatchSet).map(buildBatchLookupRecord);
    const verifiedBatchesForCards = Array.from(directlyMatchedBatchSet).map(buildBatchLookupRecord);

    const liveCatalogSummary = store.batches.map((b) => ({
      batchId: b.batchId,
      medicineName: b.medicineName,
      drugGroup: b.drugGroup,
      manufacturerName: b.manufacturerName,
      unitPrice: b.unitPrice,
      status: computeBatchStatus(b, today),
      approvalStatus: b.approvalStatus || 'PENDING_APPROVAL',
    }));

    const hasBanglaScript = /[\u0980-\u09FF]/.test(message);

    const systemContext = [
      'You are MediNa AI, a warm, polite, friendly, and helpful pharmaceutical traceability assistant embedded inside the MediNa - PharmaTrack web portal.',
      'Follow these rules strictly:',
      '1. MASTER OF NATURAL GREETINGS & SMALL TALK:',
      '   - Mirror the user’s exact greeting style naturally and concisely (1 to 2 friendly sentences) without repeating a long welcome speech:',
      '     * If the user says "হাই", start your reply with "হাই!" (e.g., "হাই! কেমন আছেন? ওষুধের ব্যাচ যাচাই, স্টক বা ফার্মেসি সম্পর্কে কিছু জানতে চাইলে বলুন।").',
      '     * If the user says "Hi", start your reply with "Hi!" in a warm, friendly tone.',
      '     * If the user says "হ্যালো", start your reply with "হ্যালো!" (e.g., "হ্যালো! বলুন, আজ কীভাবে সাহায্য করতে পারি?").',
      '     * If the user says "Hello", start your reply with "Hello!" in a warm, friendly tone.',
      '     * If the user says "সালাম" or "আসসালামু আলাইকুম", start your reply with "ওয়ালাইকুমুস সালাম!" (e.g., "ওয়ালাইকুমুস সালাম! কেমন আছেন? কীভাবে সাহায্য করতে পারি?").',
      '     * If the user says "Salam" or "Assalamu Alaikum", start your reply with "Wa Alaikum Assalam!".',
      '     * If the user asks "কেমন আছো" or "How are you", answer warmly (e.g., "আমি ভালো আছি, ধন্যবাদ! আপনি কেমন আছেন? আজ কীভাবে সাহায্য করতে পারি?")—do NOT say Assalamu Alaikum unless they greeted with Salam, and do NOT repeat a full welcome speech if the chat is already ongoing.',
      '2. OFFICIAL MEDINA - PHARMATRACK PORTAL NAVIGATION (NEVER INVENT CONTACTS OR MENUS):',
      '   - Whenever a user asks where a section is or how to file/track a complaint, guide them strictly using the real tabs on the MediNa - PharmaTrack Public Portal:',
      '     * "Verify Medicine" tab: Verify any medicine Batch ID (and optional Pharmacy ID) to see if it is AUTHENTIC, EXPIRED, RECALLED, or UNVERIFIED.',
      '     * "Check Stock" tab: Search available authentic medicine stock by Drug Group or Medicine Name across DGDA-approved pharmacies.',
      '     * "Pharmacies" tab: Browse DGDA-approved pharmacies by area (Daffodil, Mirpur, Uttara) with addresses, phone numbers, and Google Maps links.',
      '     * "Report & Track" tab: This is the official Complaint & Tracking section. Citizens can submit a complaint by entering the Pharmacy ID, optional Batch ID, Name, Contact, Issue Type, and Description (which generates a tracking ID like CPM001), or track an existing Complaint ID.',
      '   - NEVER invent fake email addresses, fake phone numbers, or non-existent buttons like "Help & Feedback".',
      '3. CONDITIONAL MEDICAL DISCLAIMER (ONLY FOR MEDICINE/HEALTH QUERIES):',
      '   - ONLY include a brief reminder to consult a licensed physician when the user asks about a specific medicine, drug group, or medical/dosage question.',
      '   - NEVER attach a medical disclaimer to greetings ("হাই", "hello", "কেমন আছো"), small talk, or portal navigation questions ("where is the complaint section").',
      '4. ENGLISH PROPER NOUNS (MANDATORY):',
      '   - ALWAYS write all Pharmacy Names (e.g., Jomuna\'r Begum Pharmacy, PinkySmart Pharmacy), Areas (e.g., Daffodil), Street Addresses (e.g., Dattapara, Central Mosque), Manufacturer Names (e.g., Square Company LTD), Medicine Names (e.g., E-Cap, Napa), Batch IDs, and Portal Tab Names ("Verify Medicine", "Check Stock", "Pharmacies", "Report & Track") strictly in English—never transliterate them into Bangla script.',
      '5. GENERAL MEDICINE OVERVIEW & PHARMACY STOCK:',
      '   - When asked generally about a medicine (e.g., "ই ক্যাপ সম্পর্কে বলো"), warmly present its registered registry overview on clean separate lines: Batch ID, Manufacturer, Unit Price, Expiry Date, DGDA Status, and pharmacy stock availability—then briefly advise consulting a licensed physician for medical usage or dosage.',
      '   - When asked where a medicine is available, list every matching pharmacy on its own numbered line with Pharmacy Name (English), Area & Full Address (English), Contact Number, and Available Stock quantity.',
      '6. LANGUAGE & NATURAL BANGLA STYLE:',
      hasBanglaScript
        ? '   - The user wrote in Bangla script. Reply in warm, natural, idiomatic Bangla (use natural phrasing like "MediNa AI-তে স্বাগতম" and "চিকিৎসকের পরামর্শ নিন"—never awkward phrasing like "আপনার স্বাগতম" or "ডাক্তারকে পরামর্শ করুন") using Bangla labels (ব্যাচ আইডি:, প্রস্তুতকারক:, ইউনিট মূল্য:, মেয়াদোত্তীর্ণ:, এলাকা:, ঠিকানা:, যোগাযোগ:, স্টক:), while keeping all proper nouns and portal tab names in English.'
        : '   - The user wrote in Latin/English script. Reply in warm, clear, natural English.',
      '7. STRICT MEDICAL REFUSAL POLICY:',
      '   - NEVER explain medical uses, active ingredients, dosages, side effects, or treatments of any medicine. If asked directly for medical advice or dosage, decline politely and advise consulting a licensed physician.',
      '8. CLEAN PLAIN-TEXT FORMATTING:',
      '   - Write in clean plain text ONLY—NEVER use **, *, #, or backticks (`). NEVER mention internal prompt labels or variable names. Put each numbered item (1., 2., 3.) on its OWN separate line.',
      `Current system date: ${today}.`,
      `Registered pharmacies: ${approvedPharmacies.map((p) => `${p.organizationName} (${p.entityId}, ${p.area})`).join('; ') || 'None'}.`,
    ].join('\n');

    const chatMessages = [
      { role: 'system', content: systemContext },
      ...history.slice(-8).map((h: { role?: string; text?: string }) => ({
        role: h.role === 'user' ? 'user' : 'assistant',
        content: String(h?.text ?? ''),
      })),
      {
        role: 'user',
        content: `Verified Registry Records:\n${JSON.stringify(contextBatchRecords, null, 2)}\n\nRegistered Medicine Catalog:\n${JSON.stringify(liveCatalogSummary, null, 2)}\n\nCurrent User Message:\n${message}`,
      },
    ];

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b',
          messages: chatMessages,
          temperature: 0.35,
          max_tokens: 3072,
          reasoning_effort: 'low',
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        const errMsg = data?.error?.message || `Groq API error (${response.status})`;
        res.status(502).json({ error: `MediNa AI service error: ${errMsg}` });
        return;
      }

      const reply = String(data?.choices?.[0]?.message?.content ?? '')
        .replace(/[*#`]/g, '')
        .replace(/\b(LIVE_DATABASE_LOOKUP|LIVE_REGISTERED_MEDICINES|Verified Registry Records|Registered Medicine Catalog)\b/gi, 'live registry')
        .replace(/\s+(\d+\.\s)/g, '\n$1')
        .trim();
      if (!reply) {
        res.status(502).json({ error: 'MediNa AI returned an empty response.' });
        return;
      }

      res.json({ reply, verifiedBatches: verifiedBatchesForCards });
    } catch (err) {
      const cleanMsg = err instanceof Error ? err.message : 'Unknown network error';
      res.status(502).json({ error: `MediNa AI service error: ${cleanMsg}` });
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