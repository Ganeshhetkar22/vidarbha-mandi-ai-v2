import { useLanguage } from '@/hooks/useLanguage';
import { DISTRICTS, MANDIS, CROPS, MANDI_NAMES_MR, CROP_NAMES_MR, getCrop, getMandi } from '@/data/vidarbha';

const normalizeCatalogKey = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/^apmc[-_ ]*/i, '')
    .replace(/[^a-z0-9]/g, '');

const getLocalizedCropName = (crop) => {
  if (!crop) return '';
  if (crop.nameMr) return crop.nameMr;

  const direct = getCrop(crop.id);
  if (direct?.nameMr) return direct.nameMr;

  const key = normalizeCatalogKey(crop.id || crop.name);
  const match = CROPS.find(
    (item) =>
      normalizeCatalogKey(item.id) === key ||
      normalizeCatalogKey(item.name) === key
  );

  return CROP_NAMES_MR[crop.id] ??
    match?.nameMr ??
    crop.name;
};

const getLocalizedMandiName = (mandi) => {
  if (!mandi) return '';
  if (mandi.nameMr) return mandi.nameMr;

  const direct = getMandi(mandi.id);
  if (direct?.nameMr) return direct.nameMr;

  const key = normalizeCatalogKey(
    mandi.id || mandi.mandiId || mandi.name || mandi.mandiName
  );

  const match = MANDIS.find(
    (item) =>
      normalizeCatalogKey(item.id) === key ||
      normalizeCatalogKey(item.name) === key
  );

  return MANDI_NAMES_MR[mandi.id] ??
    MANDI_NAMES_MR[mandi.mandiId] ??
    match?.nameMr ??
    mandi.name ??
    mandi.mandiName ??
    '';
};

export function DistrictSelect({ value, onChange, disabled }) {
  const { lang, t } = useLanguage();
  return (
    <div>
      <label className="label" htmlFor="district-select">
        {t.search.district}
      </label>
      <select
        id="district-select"
        className="input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t.search.districtPlaceholder}</option>
        {DISTRICTS.map((d) => (
          <option key={d.id} value={d.id}>
            {lang === 'mr' ? d.nameMr : d.name}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CropSelect({ value, onChange, disabled, options }) {
  const { lang, t } = useLanguage();
  const crops = options ?? CROPS;
  return (
    <div>
      <label className="label" htmlFor="crop-select">
        {t.search.crop}
      </label>
      <select
        id="crop-select"
        className="input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t.search.cropPlaceholder}</option>
        {options && crops.length === 0 && <option value="" disabled>{t.search.noCrops}</option>}
        {crops.map((c) => (
          <option key={c.id} value={c.id}>
            {lang === 'mr' ? getLocalizedCropName(c) : c.name}{c.category ? ` · ${c.category}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

export function MandiSelect({
  value,
  onChange,
  districtId,
  disabled,
  options,
}) {
  const { lang, t } = useLanguage();
  const mandis = options ?? (districtId ? MANDIS.filter((m) => m.districtId === districtId) : MANDIS);
  return (
    <div>
      <label className="label" htmlFor="mandi-select">
        {t.search.mandi}
      </label>
      <select
        id="mandi-select"
        className="input"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t.search.mandiPlaceholder}</option>
        {options && mandis.length === 0 && <option value="" disabled>{t.search.noMandis}</option>}
        {mandis.map((m) => (
          <option key={m.id} value={m.id}>
            {lang === 'mr' ? getLocalizedMandiName(m) : m.name}
          </option>
        ))}
      </select>
    </div>
  );
}
