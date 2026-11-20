import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBatchStatus,
  extractBatchIdsFromText,
  extractMMYYFromDate,
  generateBatchId,
  generateNextSequenceId,
  generatePharmacySalesId,
  generateSupplyId,
  getDrugGroupNumber,
  getManufacturerRemainingQty,
  getPharmacyBatchRemainingQty,
  isLowStock,
  isValidStandardBatchFormat,
  resolveCompanyBatchCodes,
  validateBatchDates,
  type SaleRecord,
  type SupplyDispatch,
} from './pharmaLogic';

test('DRUG_GROUPS numbering matches C++ groupChoice 1..4', () => {
  assert.equal(getDrugGroupNumber('Antibiotics'), 1);
  assert.equal(getDrugGroupNumber('Painkillers'), 2);
  assert.equal(getDrugGroupNumber('Antacids'), 3);
  assert.equal(getDrugGroupNumber('Paracetamol'), 4);
});

test('extractMMYYFromDate extracts MMYY from ISO and DD-MM-YYYY dates', () => {
  assert.equal(extractMMYYFromDate('2028-10-15'), '1028');
  assert.equal(extractMMYYFromDate('15-10-2028'), '1028');
});

test('generateBatchId strictly matches C++ CPA-G1-P01A-1028 formula', () => {
  const batchA1 = generateBatchId({
    entityId: '1',
    drugGroup: 'Antibiotics',
    expiryDate: '2028-10-15',
    companyProductionCount: 0,
  });
  assert.equal(batchA1, 'CPA-G1-P01A-1028');
  assert.equal(isValidStandardBatchFormat(batchA1), true);

  const batchA2 = generateBatchId({
    entityId: '1',
    drugGroup: 'Paracetamol',
    expiryDate: '2028-10-15',
    companyProductionCount: 1,
    existingBatchIds: [batchA1],
  });
  assert.equal(batchA2, 'CPA-G4-P02A-1028');

  const batchB1 = generateBatchId({
    entityId: '2',
    drugGroup: 'Painkillers',
    expiryDate: '2029-03-20',
    companyProductionCount: 0,
  });
  assert.equal(batchB1, 'CPB-G2-P01B-0329');

  const customCompany = generateBatchId({
    entityId: 'MFG-03',
    drugGroup: 'Antacids',
    expiryDate: '2027-12-01',
    companyProductionCount: 0,
    companyOrdinal: 3,
    customPrefix: 'SQP',
  });
  assert.equal(customCompany, 'SQP-G3-P01P-1227');
  assert.deepEqual(resolveCompanyBatchCodes('3', 3), {
    compPrefix: 'CPC',
    companySuffix: 'C',
  });
});

test('generateSupplyId and generatePharmacySalesId match C++ S01A and SL01 formats', () => {
  assert.equal(
    generateSupplyId({ entityId: '1', companySupplyCount: 0 }),
    'S01A'
  );
  assert.equal(
    generateSupplyId({ entityId: '2', companySupplyCount: 3 }),
    'S04B'
  );

  const existingSales: Array<Pick<SaleRecord, 'pharmacyId' | 'salesId'>> = [
    { pharmacyId: 'DSC_01', salesId: 'SL01' },
    { pharmacyId: 'DSC_01', salesId: 'SL02' },
    { pharmacyId: 'MIR_01', salesId: 'SL01' },
  ];
  assert.equal(generatePharmacySalesId('DSC_01', existingSales), 'SL03');
  assert.equal(generatePharmacySalesId('MIR_01', existingSales), 'SL02');
  assert.equal(generatePharmacySalesId('UTT_01', existingSales), 'SL01');
});

test('computeBatchStatus enforces RECALLED > EXPIRED > AUTHENTIC > UNVERIFIED precedence', () => {
  assert.equal(computeBatchStatus(null, '2026-11-20'), 'UNVERIFIED');
  assert.equal(computeBatchStatus(undefined, '2026-11-20'), 'UNVERIFIED');

  assert.equal(
    computeBatchStatus({ isRecalled: true, expiryDate: '2028-01-01' }, '2026-11-20'),
    'RECALLED'
  );
  assert.equal(
    computeBatchStatus({ isRecalled: false, expiryDate: '2026-11-20' }, '2026-11-20'),
    'EXPIRED'
  );
  assert.equal(
    computeBatchStatus({ isRecalled: false, expiryDate: '2026-11-21' }, '2026-11-20'),
    'AUTHENTIC'
  );
});

test('validateBatchDates rejects invalid calendar dates and expiry <= production', () => {
  assert.equal(validateBatchDates('2026-02-30', '2027-01-01').valid, false);
  assert.equal(validateBatchDates('2026-11-20', '2026-11-20').valid, false);
  assert.equal(validateBatchDates('2026-11-20', '2026-11-19').valid, false);
  assert.equal(validateBatchDates('2026-11-20', '2027-11-20').valid, true);
});

test('generateNextSequenceId increments CPM sequence properly', () => {
  assert.equal(generateNextSequenceId('CPM', [], 3), 'CPM001');
  assert.equal(generateNextSequenceId('CPM', ['CPM001', 'CPM002'], 3), 'CPM003');
});

test('stock math and low-stock threshold calculations are accurate', () => {
  const supplies: SupplyDispatch[] = [
    {
      supplyId: 'S01A',
      batchId: 'CPA-G4-P01A-1028',
      manufacturerId: '1',
      manufacturerName: 'Company A',
      pharmacyId: 'DSC_01',
      pharmacyName: 'Daffodil Meds',
      quantity: 30,
      supplyDate: '2026-11-20',
      createdAt: '2026-11-20T08:00:00Z',
    },
    {
      supplyId: 'S02A',
      batchId: 'CPA-G4-P01A-1028',
      manufacturerId: '1',
      manufacturerName: 'Company A',
      pharmacyId: 'MIR_01',
      pharmacyName: 'Mirpur Care',
      quantity: 20,
      supplyDate: '2026-11-20',
      createdAt: '2026-11-20T09:00:00Z',
    },
  ];
  const sales: SaleRecord[] = [
    {
      salesId: 'SL01',
      batchId: 'CPA-G4-P01A-1028',
      pharmacyId: 'DSC_01',
      pharmacyName: 'Daffodil Meds',
      medicineName: 'Napa 500mg',
      drugGroup: 'Paracetamol',
      quantity: 22,
      unitPrice: 1.5,
      totalPrice: 33,
      soldAt: '2026-11-20T10:00:00Z',
      soldBy: 'dsc_user',
    },
  ];

  assert.equal(
    getManufacturerRemainingQty({ batchId: 'CPA-G4-P01A-1028', totalQuantity: 100 }, supplies),
    50
  );
  const dscRemaining = getPharmacyBatchRemainingQty('CPA-G4-P01A-1028', 'DSC_01', supplies, sales);
  assert.equal(dscRemaining, 8);
  assert.equal(isLowStock(dscRemaining), true);
  assert.equal(isLowStock(0), false);
  assert.equal(isLowStock(10), false);
});

test('extractBatchIdsFromText finds C++ batch tokens', () => {
  assert.deepEqual(
    extractBatchIdsFromText('Please verify cpa-g1-p01a-1028 and CPA-G1-P01A-1028 or CPB-G4-P02B-0529.'),
    ['CPA-G1-P01A-1028', 'CPB-G4-P02B-0529']
  );
});
