import crypto from 'node:crypto';
import mongoose from 'mongoose';
import type {
  ComplaintRecord,
  PharmacyArea,
  ProductionBatch,
  PublicUser,
  SaleRecord,
  SupplyDispatch,
  UserRole,
} from '../src/lib/pharmaLogic.ts';

export interface StoredUser extends PublicUser {
  passwordHash: string;
}

export interface PharmaStore {
  users: StoredUser[];
  batches: ProductionBatch[];
  supplies: SupplyDispatch[];
  sales: SaleRecord[];
  complaints: ComplaintRecord[];
}

// ==================== MONGODB ATLAS SETUP & IN-MEMORY CACHE ====================
const storeSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: 'main_registry' },
    users: { type: Array, default: [] },
    batches: { type: Array, default: [] },
    supplies: { type: Array, default: [] },
    sales: { type: Array, default: [] },
    complaints: { type: Array, default: [] },
  },
  { minimize: false }
);

const StoreModel =
  mongoose.models.PharmaStore || mongoose.model('PharmaStore', storeSchema);

let cachedStore: PharmaStore = {
  users: [],
  batches: [],
  supplies: [],
  sales: [],
  complaints: [],
};

export async function initMongoDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('⚠️ MONGODB_URI not found in .env — running in memory only.');
    return;
  }
  try {
    await mongoose.connect(uri, { dbName: 'medina_pharmatrack' });
    console.log('✅ Connected to MongoDB Atlas (medina_pharmatrack)');

    let doc = await StoreModel.findOne({ key: 'main_registry' }).lean();
    if (!doc) {
      await StoreModel.create({ key: 'main_registry', ...cachedStore });
    } else {
      cachedStore = {
        users: Array.isArray(doc.users) ? (doc.users as StoredUser[]) : [],
        batches: Array.isArray(doc.batches) ? (doc.batches as ProductionBatch[]) : [],
        supplies: Array.isArray(doc.supplies) ? (doc.supplies as SupplyDispatch[]) : [],
        sales: Array.isArray(doc.sales) ? (doc.sales as SaleRecord[]) : [],
        complaints: Array.isArray(doc.complaints) ? (doc.complaints as ComplaintRecord[]) : [],
      };
    }
  } catch (err) {
    console.error('❌ MongoDB Atlas connection failed:', err);
  }
}

export function createEmptyStore(): PharmaStore {
  return {
    users: [],
    batches: [],
    supplies: [],
    sales: [],
    complaints: [],
  };
}

export function loadStore(): PharmaStore {
  return cachedStore;
}

export function saveStore(store: PharmaStore): void {
  cachedStore = store;
  if (mongoose.connection.readyState === 1) {
    StoreModel.findOneAndUpdate(
      { key: 'main_registry' },
      {
        $set: {
          users: store.users,
          batches: store.batches,
          supplies: store.supplies,
          sales: store.sales,
          complaints: store.complaints,
        },
      },
      { upsert: true }
    ).catch((err) => console.error('Failed to sync store to MongoDB:', err));
  }
}

// ==================== SECURITY & SESSION HELPERS ====================
export function getSessionSecret(): string {
  const jwtSecret = process.env.JWT_SECRET?.trim();
  if (jwtSecret) return jwtSecret;

  const sessionSecret = process.env.SESSION_SECRET?.trim();
  if (sessionSecret) return sessionSecret;

  return 'medina_pharmatrack_national_registry_secret_2026';
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const originalBuf = Buffer.from(originalHex, 'hex');
  if (derived.length !== originalBuf.length) return false;
  return crypto.timingSafeEqual(derived, originalBuf);
}

export interface SessionPayload {
  userId: string;
  username: string;
  role: UserRole;
  entityId: string;
  exp: number;
}

export function signSessionToken(payload: Omit<SessionPayload, 'exp'>): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed || typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function toPublicUser(user: StoredUser): PublicUser {
  const result: PublicUser = {
    id: user.id,
    organizationName: user.organizationName,
    username: user.username,
    role: user.role,
    entityId: user.entityId,
    createdAt: user.createdAt,
  };
  if (user.companyPrefix) result.companyPrefix = user.companyPrefix;
  if (user.ownerName) result.ownerName = user.ownerName;
  if (user.area) result.area = user.area as PharmacyArea;
  if (user.address) result.address = user.address;
  if (user.contact) result.contact = user.contact;
  if (user.googleMapsUrl) result.googleMapsUrl = user.googleMapsUrl;
  return result;
}