import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEFAULT_RESOURCE_ID = "9ef84268-d588-465a-a308-a864a43d0070";
const BASE_URL = "https://api.data.gov.in/resource";

const DISTRICT_ALIASES: Record<string, string> = {
  nagpur: "nagpur",
  wardha: "wardha",
  bhandara: "bhandara",
  gondia: "gondia",
  gondiya: "gondia",
  chandrapur: "chandrapur",
  chanda: "chandrapur",
  gadchiroli: "gadchiroli",
  amravati: "amravati",
  amrawati: "amravati",
  amarawati: "amravati",
  akola: "akola",
  buldhana: "buldhana",
  washim: "washim",
  yavatmal: "yavatmal",
  yeotmal: "yavatmal",
};

const COMMODITY_ALIASES: Record<string, string> = {
  soybean: "soybean",
  "soya bean": "soybean",
  soyabean: "soybean",

  cotton: "cotton",
  kapas: "cotton",
  rui: "cotton",

  tur: "tur",
  "tur (arhar)": "tur",
  arhar: "tur",
  "red gram": "tur",

  paddy: "paddy",
  "paddy (common)": "paddy",
  rice: "paddy",
  chawal: "paddy",

  wheat: "wheat",
  gehun: "wheat",
  gahu: "wheat",

  gram: "gram",
  chana: "gram",
  "bengal gram": "gram",

  jowar: "jowar",
  jwar: "jowar",
  sorghum: "jowar",

  maize: "maize",
  makka: "maize",
  corn: "maize",

  groundnut: "groundnut",
  "ground nut": "groundnut",

  sunflower: "sunflower",
  surajmukhi: "sunflower",

  moong: "moong",
  mung: "moong",
  "green gram": "moong",

  udid: "udid",
  urad: "udid",
  "black gram": "udid",

  onion: "onion",
  kanda: "onion",

  tomato: "tomato",
  tamatar: "tomato",

  orange: "orange",
  santre: "orange",
  santra: "orange",
};

function normalizeDistrict(raw: string): string | null {
  if (!raw) return null;

  const key = raw
    .toLowerCase()
    .trim()
    .replace(/\bdistrict\b/g, "")
    .replace(/\bcity\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return DISTRICT_ALIASES[key] ?? null;
}

function normalizeNameId(raw: string): string | null {
  if (!raw) return null;
  const id = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || null;
}

function normalizeCommodity(raw: string): string | null {
  if (!raw) return null;

  const key = raw.toLowerCase().trim();

  return COMMODITY_ALIASES[key] ?? normalizeNameId(key);
}

function normalizePrice(value: unknown): number | null {
  if (value == null) return null;

  if (typeof value === "number") {
    return value >= 0 ? value : null;
  }

  const text = String(value)
    .trim()
    .replace(/[₹,\s]/g, "");

  if (!text) return null;

  const number = Number(text);

  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeDate(raw: string): string | null {
  if (!raw) return null;

  const value = raw.trim();

  // YYYY-MM-DD
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  // DD/MM/YYYY
  const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);

  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(
      2,
      "0",
    )}`;
  }

  return null;
}

function normalizeMarketName(raw: string): string {
  if (!raw) return "";

  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*Market Committee\s*$/i, "")
    .replace(/\s*APMC\s*$/i, "")
    .replace(/\s*Market\s*$/i, "")
    .replace(/\s*Mandi\s*$/i, "")
    .trim();
}

function normalizeMarketId(raw: string): string | null {
  return normalizeNameId(normalizeMarketName(raw));
}

async function writeSyncLog(
  supabaseUrl: string,
  serviceKey: string,
  values: { status: string; rowsAffected: number; message: string; startedAt: string },
) {
  await fetch(`${supabaseUrl}/rest/v1/data_sync_log`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Profile": "public",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      source: "data.gov.in / AGMARKNET",
      entity: "mandi_prices",
      status: values.status,
      rows_affected: values.rowsAffected,
      message: values.message,
      started_at: values.startedAt,
      finished_at: new Date().toISOString(),
    }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  const startedAt = new Date().toISOString();

  try {
    // ---------------------------------------------------------
    // 1. Get secrets
    // ---------------------------------------------------------

    const apiKey = Deno.env.get("DATA_GOV_API_KEY");

    const resourceId =
      Deno.env.get("DATA_GOV_RESOURCE_ID") || DEFAULT_RESOURCE_ID;

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          available: false,
          message:
            "DATA_GOV_API_KEY is not configured in Supabase Edge Function Secrets.",
        }),
        {
          status: 503,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({
          available: false,
          message: "Supabase environment variables are missing.",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // ---------------------------------------------------------
    // 2. Fetch Maharashtra records from data.gov.in
    // ---------------------------------------------------------

    const allRecords: unknown[] = [];

    let offset = 0;
    const limit = 1000;
    let total = Infinity;
    let hasReliableTotal = false;
    const pageSignatures = new Set<string>();

    while (offset < total || !hasReliableTotal) {
      const url = new URL(`${BASE_URL}/${resourceId}`);

      url.searchParams.set("api-key", apiKey);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("filters[state]", "Maharashtra");

      let response: Response | null = null;
      let lastError = "";

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          response = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });

          if (response.ok) {
            break;
          }

          lastError = `data.gov.in API returned ${response.status}`;
        } catch (error) {
          lastError =
            error instanceof Error ? error.message : "Network error";
        }

        if (attempt < 3) {
          await new Promise((resolve) =>
            setTimeout(resolve, attempt * 3000),
          );
        }
      }

      if (!response || !response.ok) {
        throw new Error(
          `${lastError}. Failed after 3 attempts.`,
        );
      }

      const data = await response.json();

      if (!data.records || !Array.isArray(data.records)) {
        break;
      }

      if (Number.isFinite(data.total) && data.total >= offset + data.records.length) {
        total = data.total;
        hasReliableTotal = true;
      }

      const pageSignature = `${JSON.stringify(data.records[0] ?? {})}:${data.records.length}`;
      if (pageSignatures.has(pageSignature)) {
        break;
      }
      pageSignatures.add(pageSignature);

      allRecords.push(...data.records);

      offset += limit;

      if (data.records.length === 0 || data.records.length < limit) {
        break;
      }
    }

    // ---------------------------------------------------------
    // 3. Normalize records
    // ---------------------------------------------------------

    const normalized: Record<string, unknown>[] = [];

    const stats = {
      totalFetched: allRecords.length,
      maharashtra: 0,
      vidarbha: 0,
      valid: 0,
      duplicatesRemoved: 0,
      inserted: 0,
      skipped: 0,
    };

    const districtCounts: Record<string, number> = {};

    for (const raw of allRecords) {
      const r = raw as Record<string, unknown>;

      const rawDistrict = String(r.district ?? "").trim();
      if (rawDistrict) {
        districtCounts[rawDistrict] = (districtCounts[rawDistrict] ?? 0) + 1;
      }

      const state = String(r.state ?? "")
        .trim()
        .toLowerCase();

      if (state !== "maharashtra") {
        continue;
      }

      stats.maharashtra++;

      // District
      const districtId = normalizeDistrict(
        String(r.district ?? ""),
      );

      if (!districtId) {
  console.log("Unrecognized government district:", r.district);
}

      if (!districtId) {
        continue;
      }

      stats.vidarbha++;

      // Commodity
      const cropId = normalizeCommodity(
        String(r.commodity ?? ""),
      );

      if (!cropId) {
        continue;
      }

      // Mandi
      const marketName = normalizeMarketName(
        String(r.market ?? ""),
      );

      if (!marketName) {
        continue;
      }

      // Prices
      const modalPrice = normalizePrice(r.modal_price);
      const minPrice = normalizePrice(r.min_price);
      const maxPrice = normalizePrice(r.max_price);

      if (
        modalPrice == null &&
        minPrice == null &&
        maxPrice == null
      ) {
        continue;
      }

      // Date
      const arrivalDate = normalizeDate(
        String(r.arrival_date ?? ""),
      );

      if (!arrivalDate) {
        continue;
      }

      stats.valid++;

      normalized.push({
        district_id: districtId,

        mandi_id: normalizeMarketId(marketName),

        mandi_name: marketName,

        crop_id: cropId,

        crop_name: String(r.commodity ?? "").trim(),

        variety: r.variety
          ? String(r.variety).trim() || null
          : null,

        grade: r.grade
          ? String(r.grade).trim() || null
          : null,

        min_price: minPrice,

        max_price: maxPrice,

        modal_price: modalPrice,

        price_date: arrivalDate,

        source:
          "Government of India — Open Government Data / AGMARKNET",
      });
    }

    // ---------------------------------------------------------
    // 4. REMOVE DUPLICATES
    //
    // Database unique key:
    // district_id + mandi_id + crop_id + variety + grade + price_date
    // ---------------------------------------------------------

    const uniqueRecords = new Map<
      string,
      Record<string, unknown>
    >();

    for (const record of normalized) {
      const uniqueKey = [
        record.district_id,
        record.mandi_id,
        record.crop_id,
        record.variety ?? null,
        record.grade ?? null,
        record.price_date,
      ].join("|");

      // If duplicate exists, keep the latest one.
      uniqueRecords.set(uniqueKey, record);
    }

    stats.duplicatesRemoved =
      normalized.length - uniqueRecords.size;

    const deduplicated = Array.from(uniqueRecords.values());

    // ---------------------------------------------------------
    // 5. Nothing to insert
    // ---------------------------------------------------------

    if (deduplicated.length === 0) {
      await writeSyncLog(supabaseUrl, serviceKey, {
        status: "success",
        rowsAffected: 0,
        message: "No valid Vidarbha records found in the API response.",
        startedAt,
      });
      return new Response(
        JSON.stringify({
          available: true,
          stats,
          message:
            "No valid Vidarbha records found in the API response.",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    // ---------------------------------------------------------
    // 6. Insert into Supabase
    // ---------------------------------------------------------

    const batchSize = 100;

    for (
      let i = 0;
      i < deduplicated.length;
      i += batchSize
    ) {
      const batch = deduplicated.slice(
        i,
        i + batchSize,
      );

      const response = await fetch(
        `${supabaseUrl}/rest/v1/mandi_prices?on_conflict=district_id,mandi_id,crop_id,variety,grade,price_date`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",

            apikey: serviceKey,

            Authorization: `Bearer ${serviceKey}`,

            Prefer: "resolution=merge-duplicates",

            "Content-Profile": "public",

  
          },

          body: JSON.stringify(batch),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();

        stats.skipped += batch.length;

        throw new Error(
          `Database insert failed (${response.status}): ${errorText}`,
        );
      }

      stats.inserted += batch.length;
    }

    await writeSyncLog(supabaseUrl, serviceKey, {
      status: "success",
      rowsAffected: stats.inserted,
      message: `Sync complete. Fetched ${stats.totalFetched}, accepted ${stats.valid}, rejected ${stats.totalFetched - stats.valid}.`,
      startedAt,
    });

    // ---------------------------------------------------------
    // 7. Success response
    // ---------------------------------------------------------

    return new Response(
      JSON.stringify({
        available: true,
        stats,
        districtCounts,
          message: "Sync complete",
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supabaseUrl && serviceKey) {
      await writeSyncLog(supabaseUrl, serviceKey, {
        status: "error",
        rowsAffected: 0,
        message: error instanceof Error ? error.message : "Unknown error",
        startedAt,
      }).catch(() => undefined);
    }
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown error";

    const isGovernmentSourceError =
      errorMessage.includes("data.gov.in API returned") ||
      errorMessage.includes("Failed after 3 attempts");

    return new Response(
      JSON.stringify({
        available: false,
        error: errorMessage,
        source_unavailable: isGovernmentSourceError,
      }),
      {
        status: isGovernmentSourceError ? 503 : 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});


