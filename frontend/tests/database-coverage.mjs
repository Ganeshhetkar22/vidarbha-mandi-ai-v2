import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY'
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

const districts = [
  'nagpur',
  'wardha',
  'bhandara',
  'gondia',
  'chandrapur',
  'gadchiroli',
  'amravati',
  'akola',
  'buldhana',
  'washim',
  'yavatmal'
];

const normalize = value =>
  String(value ?? '')
    .toLowerCase()
    .replace(/^apmc[-_ ]*/i, '')
    .replace(/[^a-z0-9]/g, '');

async function fetchAll(table, select, filters = {}) {
  let from = 0;
  const pageSize = 1000;
  const all = [];

  while (true) {
    let query = supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1);

    for (const [column, value] of Object.entries(filters)) {
      query = query.eq(column, value);
    }

    const { data, error } = await query;

    if (error) throw new Error(`${table}: ${error.message}`);

    all.push(...(data ?? []));

    if (!data || data.length < pageSize) break;

    from += pageSize;
  }

  return all;
}

console.log('Loading mandi master...');

const mandis = await fetchAll(
  'mandi_master',
  'district_id,mandi_id,mandi_name'
);

console.log(`Found ${mandis.length} mandi master records`);

console.log('Loading aliases...');

const aliases = await fetchAll(
  'mandi_aliases',
  'district_id,source_mandi_id,source_mandi_name,canonical_mandi_id'
);

console.log(`Found ${aliases.length} aliases`);

console.log('Loading mandi prices...');

const prices = await fetchAll(
  'mandi_prices',
  'district_id,mandi_id,mandi_name,crop_id,crop_name,price_date'
);

console.log(`Found ${prices.length} price records`);

const results = [];

for (const district of districts) {
  const districtMandis = mandis.filter(
    mandi => normalize(mandi.district_id) === normalize(district)
  );

  console.log(`\n========== ${district} ==========`);

  for (const mandi of districtMandis) {
    const matchingKeys = new Set([
      normalize(mandi.mandi_id),
      normalize(mandi.mandi_name)
    ]);

    for (const alias of aliases) {
      if (
        normalize(alias.district_id) === normalize(mandi.district_id) &&
        normalize(alias.canonical_mandi_id) === normalize(mandi.mandi_id)
      ) {
        matchingKeys.add(normalize(alias.source_mandi_id));
        matchingKeys.add(normalize(alias.source_mandi_name));
      }
    }

    const matchingPrices = prices.filter(row => {
      if (
        normalize(row.district_id) !== normalize(mandi.district_id)
      ) {
        return false;
      }

      return (
        matchingKeys.has(normalize(row.mandi_id)) ||
        matchingKeys.has(normalize(row.mandi_name))
      );
    });

    const cropMap = new Map();

    for (const row of matchingPrices) {
      if (row.crop_id && !cropMap.has(row.crop_id)) {
        cropMap.set(row.crop_id, row.crop_name ?? row.crop_id);
      }
    }

    const status = cropMap.size > 0 ? 'DATA' : 'NO_DATA';

    results.push({
      district: mandi.district_id,
      mandiId: mandi.mandi_id,
      mandi: mandi.mandi_name,
      cropCount: cropMap.size,
      crops: [...cropMap.values()],
      priceRecords: matchingPrices.length,
      status
    });

    console.log(
      `${mandi.mandi_name} | ${status} | crops: ${cropMap.size} | prices: ${matchingPrices.length}`
    );
  }
}

const summary = {
  totalDistricts: districts.length,
  totalMandis: results.length,
  withData: results.filter(r => r.status === 'DATA').length,
  noData: results.filter(r => r.status === 'NO_DATA').length
};

console.log('\n========== FINAL SUMMARY ==========');
console.log(JSON.stringify(summary, null, 2));

fs.mkdirSync('tests/results', { recursive: true });

fs.writeFileSync(
  'tests/results/database-coverage.json',
  JSON.stringify(results, null, 2),
  'utf8'
);

console.log('\nSaved: tests/results/database-coverage.json');
