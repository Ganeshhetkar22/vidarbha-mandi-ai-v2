import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getDistrict, getMandi, getCrop, getMandisByDistrict, MANDIS, CROPS } from '@/data/vidarbha';

const PAGE_SIZE = 1000;

const mapRow = (r) => ({
  id: r.id,
  districtId: r.district_id,
  mandiId: r.mandi_id,
  mandiName: r.mandi_name,
  cropId: r.crop_id,
  cropName: r.crop_name,
  variety: r.variety,
  minPrice: r.min_price,
  maxPrice: r.max_price,
  modalPrice: r.modal_price,
  priceDate: r.price_date,
  source: r.source,
  sourceUrl: r.source_url,
  fetchedAt: r.fetched_at,
});

async function fetchAllPages(buildQuery) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

const normalizeMandiKey = (value) => String(value ?? '')
  .toLowerCase()
  .trim()
  .replace(/\b(apmc|market committee|market|mandi)\b/g, '')
  .replace(/amrawati/g, 'amravati')
  .replace(/varud/g, 'warud')
  .replace(/[^a-z0-9]+/g, '');

const mandiKeysFor = (mandi) => ([
  normalizeMandiKey(mandi?.id),
  normalizeMandiKey(mandi?.mandiId),
  normalizeMandiKey(mandi?.mandiName),
  normalizeMandiKey(mandi?.name),
].filter(Boolean));

function createMandiLookup(mandis) {
  const lookup = new Map();
  for (const mandi of mandis) {
    for (const key of mandiKeysFor(mandi)) {
      if (!lookup.has(key)) lookup.set(key, mandi);
    }
  }
  return lookup;
}

async function getMandiMatchKeys(districtId, mandiId, mandis) {
  if (!mandiId) return null;

  const selectedKey = normalizeMandiKey(mandiId);
  const districtMandis = mandis ?? (districtId ? await fetchMandiMaster(districtId) : []);
  const selectedMandi = districtMandis.find((mandi) => mandiKeysFor(mandi).includes(selectedKey));

  return new Set([
    selectedKey,
    ...mandiKeysFor(selectedMandi),
  ].filter(Boolean));
}

const matchesMandi = (row, mandiKeys) => {
  if (!mandiKeys) return true;
  return (
    mandiKeys.has(normalizeMandiKey(row.mandi_id)) ||
    mandiKeys.has(normalizeMandiKey(row.mandi_name))
  );
};

async function fetchPriceRows({
  districtId,
  cropId,
  mandiId,
  priceDate,
  dateFrom,
  select = '*',
  orderColumn = 'price_date',
  ascending = false,
  limit,
}) {
  const mandiKeys = await getMandiMatchKeys(districtId, mandiId);
  const rows = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase
      .from('mandi_prices')
      .select(select);

    if (districtId) query = query.eq('district_id', districtId);
    if (cropId) query = query.eq('crop_id', cropId);
    if (priceDate) query = query.eq('price_date', priceDate);
    if (dateFrom) query = query.gte('price_date', dateFrom);

    const { data, error } = await query
      .order(orderColumn, { ascending })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;

    rows.push(...(data ?? []).filter((row) => matchesMandi(row, mandiKeys)));
    if (limit && rows.length >= limit) return rows.slice(0, limit);
    if (!data || data.length < PAGE_SIZE) break;
  }

  return limit ? rows.slice(0, limit) : rows;
}

function withMasterMandi(row, mandiLookup) {
  const mapped = mapRow(row);
  const masterMandi =
    mandiLookup.get(normalizeMandiKey(row.mandi_id)) ??
    mandiLookup.get(normalizeMandiKey(row.mandi_name));

  if (!masterMandi) return mapped;

  return {
    ...mapped,
    mandiId: masterMandi.id,
    mandiName: masterMandi.mandiName ?? masterMandi.name,
  };
}

export async function fetchMandiPrices(query = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return { records: [], requestedDate: query.date || null, usedDate: null, usedFallback: false };
  }

  const queryDate = (date) => {
    return fetchPriceRows({
      districtId: query.districtId,
      cropId: query.cropId,
      mandiId: query.mandiId,
      priceDate: date,
      orderColumn: 'fetched_at',
      ascending: false,
      limit: query.limit ?? 100,
    });
  };

  const requestedDate = query.date || null;
  let data = requestedDate ? await queryDate(requestedDate) : [];

  let usedDate = requestedDate;
  let usedFallback = false;
  if (!data?.length) {
    const [latestRow] = await fetchPriceRows({
      districtId: query.districtId,
      cropId: query.cropId,
      mandiId: query.mandiId,
      select: 'price_date, mandi_id, mandi_name',
      orderColumn: 'price_date',
      ascending: false,
      limit: 1,
    });

    usedDate = latestRow?.price_date ?? null;
    usedFallback = Boolean(requestedDate && usedDate);
    if (usedDate) {
      data = await queryDate(usedDate);
    }
  }

  return {
    records: (data ?? []).map(mapRow),
    requestedDate,
    usedDate,
    usedFallback,
  };
}

export async function fetchMandiMaster(districtId) {
  if (!isSupabaseConfigured || !supabase) {
    return getMandisByDistrict(districtId).map((mandi) => ({
      ...mandi,
      districtId: mandi.districtId,
      mandiId: mandi.id,
      mandiName: mandi.name,
      isActive: true,
    }));
  }

  const rows = await fetchAllPages(() => supabase
      .from('mandi_master')
      .select('district_id, mandi_id, mandi_name, state, market_type, source, is_active')
      .eq('district_id', districtId)
      .eq('is_active', true)
      .order('mandi_name', { ascending: true }));

  return rows.map((row) => ({
    ...getMandi(row.mandi_id),
    id: row.mandi_id,
    districtId: row.district_id,
    mandiId: row.mandi_id,
    mandiName: row.mandi_name,
    name: row.mandi_name,
    state: row.state,
    marketType: row.market_type,
    source: row.source,
    isActive: row.is_active,
  }));
}

export async function fetchMandiAvailability(districtId, cropId, mandiId) {
  if (!isSupabaseConfigured || !supabase) {
    return {
      crops: [],
      mandis: await fetchMandiMaster(districtId),
    };
  }

  const mandis = await fetchMandiMaster(districtId);

  if (!mandiId) {
    return { crops: [], mandis };
  }

  const { data: aliases, error: aliasError } = await supabase
    .from('mandi_aliases')
    .select('source_mandi_id, source_mandi_name')
    .eq('district_id', districtId)
    .eq('canonical_mandi_id', mandiId);

  if (aliasError) throw new Error(aliasError.message);

  const selectedMandi = mandis.find((m) => m.id === mandiId);

  const normalize = (value) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/^apmc[-_ ]*/i, '')
      .replace(/[^a-z0-9]/g, '');

  const selectedKeys = new Set([
    normalize(mandiId),
    normalize(selectedMandi?.mandiId),
    normalize(selectedMandi?.mandiName),
    normalize(selectedMandi?.name),
    ...(aliases ?? []).flatMap((a) => [
      normalize(a.source_mandi_id),
      normalize(a.source_mandi_name),
    ]),
  ].filter(Boolean));

  const rows = await fetchAllPages(() =>
    supabase
      .from('mandi_prices')
      .select('crop_id, crop_name, mandi_id, mandi_name')
      .eq('district_id', districtId)
  );

  const crops = new Map();

  for (const row of rows) {
    const rowKeys = [
      normalize(row.mandi_id),
      normalize(row.mandi_name),
    ].filter(Boolean);

    if (!rowKeys.some((key) => selectedKeys.has(key))) continue;

    if (row.crop_id && !crops.has(row.crop_id)) {
      const crop = getCrop(row.crop_id);
      crops.set(row.crop_id, {
        ...crop,
        id: row.crop_id,
        name: row.crop_name ?? crop?.name ?? row.crop_id,
      });
    }
  }

  return {
    crops: Array.from(crops.values()),
    mandis,
  };
}
export async function fetchLatestPriceDate() {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from('mandi_prices')
    .select('price_date')
    .order('price_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.price_date ?? null;
}

export async function fetchMandiStats() {
  if (!isSupabaseConfigured || !supabase) {
    return {
      activeMarketCount: MANDIS.length,
      cropCount: CROPS.length,
      latestPriceDate: null,
    };
  }

  const { count: activeMarketCount, error: marketError } = await supabase
    .from('mandi_master')
    .select('mandi_id', { count: 'exact', head: true })
    .eq('is_active', true);
  if (marketError) throw marketError;

  const cropRows = await fetchAllPages(() => supabase
    .from('mandi_prices')
    .select('crop_id'));

  const latestPriceDate = await fetchLatestPriceDate();

  return {
    activeMarketCount: activeMarketCount ?? 0,
    cropCount: new Set(cropRows.map((row) => row.crop_id).filter(Boolean)).size,
    latestPriceDate,
  };
}

export async function fetchLatestSyncStatus() {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from('data_sync_log')
    .select('status, rows_affected, message, started_at, finished_at')
    .eq('entity', 'mandi_prices')
    .eq('status', 'success')
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function fetchPriceHistory(
  districtId,
  mandiId,
  cropId,
  days = 30,
) {
  if (!isSupabaseConfigured || !supabase) return [];
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const data = await fetchPriceRows({
    districtId,
    cropId,
    mandiId,
    dateFrom: sinceStr,
    orderColumn: 'price_date',
    ascending: true,
  });

  return (data ?? []).map(mapRow);
}

export async function fetchComparisonForCrop(
  districtId,
  cropId,
) {
  if (!isSupabaseConfigured || !supabase) return [];

  const mandis = await fetchMandiMaster(districtId);
  const mandiLookup = createMandiLookup(mandis);
  const data = await fetchPriceRows({
    districtId,
    cropId,
    orderColumn: 'price_date',
    ascending: false,
  });

  const rows = (data ?? []).map((row) => withMasterMandi(row, mandiLookup));
  const byDate = new Map();
  for (const row of rows) {
    if (!byDate.has(row.priceDate)) byDate.set(row.priceDate, new Map());
    const recordsByMandi = byDate.get(row.priceDate);
    if (!recordsByMandi.has(row.mandiId)) recordsByMandi.set(row.mandiId, row);
  }

  const comparisonDate = Array.from(byDate.entries())
    .sort((a, b) => b[1].size - a[1].size || b[0].localeCompare(a[0]))[0]?.[0] ?? null;
  const records = comparisonDate ? Array.from(byDate.get(comparisonDate).values()) : [];
  return { records, comparisonDate };
}

export function formatPrice(value) {
  const numeric = Number(value);
  if (value == null || Number.isNaN(numeric)) return 'â€”';
  return `â‚¹${Math.round(numeric).toLocaleString('en-IN')}`;
}

export function formatDate(iso) {
  if (!iso) return 'â€”';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'â€”';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export { getDistrict, getMandi, getCrop };


