import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, Store, Trophy, Info } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useLanguage } from '@/hooks/useLanguage';
import { SearchPanel } from '@/components/SearchPanel';
import { SectionHeader, EmptyState } from '@/components/ui';
import {
  fetchComparisonForCrop,
  formatPrice,
  formatDate,
} from '@/services/mandiService';
import { getCrop, getMandi } from '@/data/vidarbha';

export function MandiComparisonPage() {
  const { t, lang } = useLanguage();
  const [params] = useSearchParams();
  const districtId = params.get('district') ?? '';
  const cropId = params.get('crop') ?? '';
  const mandiId = params.get('mandi') ?? '';

  const [records, setRecords] = useState([]);
  const [comparisonDate, setComparisonDate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!districtId || !cropId) {
      setRecords([]);
      setComparisonDate(null);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    fetchComparisonForCrop(districtId, cropId)
      .then(({ records: nextRecords, comparisonDate: nextDate }) => {
        if (!active) return;
        setRecords(nextRecords);
        setComparisonDate(nextDate);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [districtId, cropId]);

  const crop = getCrop(cropId) ?? {
    name: records[0]?.cropName ?? cropId,
    nameMr: records[0]?.cropName ?? cropId,
  };
  const selectedModal = records.find((r) => r.mandiId === mandiId)?.modalPrice ?? null;
  const bestRecord = [...records].filter((record) => record.modalPrice != null).sort(
    (a, b) => (b.modalPrice ?? -1) - (a.modalPrice ?? -1),
  )[0];

  const chartData = records.map((r) => ({
    name: lang === 'mr' ? getMandi(r.mandiId)?.nameMr ?? r.mandiName : r.mandiName,
    modal: r.modalPrice,
    mandiId: r.mandiId,
  }));

  const hasQuery = Boolean(districtId && cropId);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeader
        title={t.comparison.title}
        subtitle={t.comparison.subtitle}
        icon={<BarChart3 className="h-6 w-6" />}
      />

      <SearchPanel
        defaultDistrict={districtId}
        defaultCrop={cropId}
        defaultMandi={mandiId}
        submitTo="/compare-mandis"
  submitLabel={t.search.compare}
        marketRequiredForCrop={true}
      />

      <div className="mt-8">
        {loading && <p className="py-10 text-center text-field-500">{t.common.loading}</p>}
        {error && <EmptyState title={t.common.error} description={error} icon={<Info className="h-10 w-10" />} />}

        {!loading && !error && !hasQuery && (
          <EmptyState
            title={t.comparison.noData}
            description={t.comparison.noDataDesc}
            icon={<Store className="h-10 w-10" />}
          />
        )}

        {!loading && !error && hasQuery && records.length === 0 && (
          <EmptyState
            title={t.comparison.dataUnavailable}
            description={t.comparison.dataUnavailableDesc}
            icon={<Store className="h-10 w-10" />}
          />
        )}

        {!loading && !error && records.length > 0 && crop && (
          <>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <span className="chip bg-mandi-100 text-mandi-700">
                {t.comparison.selectedCrop}: {lang === 'mr' ? crop.nameMr : crop.name}
              </span>
              {comparisonDate && (
                <span className="chip bg-field-100 text-field-700">
                  {t.comparison.comparisonDate}: {formatDate(comparisonDate)}
                </span>
              )}
              {bestRecord && (
                <span className="chip bg-harvest-100 text-harvest-700">
                  <Trophy className="h-3.5 w-3.5" />
                  {t.comparison.bestModal}: {formatPrice(bestRecord.modalPrice)} ·{' '}
                  {lang === 'mr' ? getMandi(bestRecord.mandiId)?.nameMr ?? bestRecord.mandiName : bestRecord.mandiName}
                </span>
              )}
            </div>

            <div className="card mb-8 p-6">
              <h3 className="mb-4 text-lg font-bold text-mandi-900">{t.comparison.chartTitle}</h3>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e9e4d6" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#584d3c' }} interval={0} angle={-15} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11, fill: '#584d3c' }} />
                    <Tooltip
                      formatter={(v) => [formatPrice(typeof v === 'number' ? v : Number(v)), t.prices.table.modal]}
                      contentStyle={{ borderRadius: 12, border: '1px solid #e9e4d6' }}
                    />
                    <Bar dataKey="modal" radius={[6, 6, 0, 0]}>
                      {chartData.map((d) => (
                        <Cell
                          key={d.mandiId}
                          fill={d.mandiId === mandiId ? '#4f8a31' : '#bbdaa6'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="card min-w-full divide-y divide-field-200 text-sm">
                <thead className="bg-field-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-mandi-700">{t.comparison.market}</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-mandi-700">{t.comparison.distance}</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-mandi-700">{t.comparison.min}</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-mandi-700">{t.comparison.max}</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-mandi-700">{t.comparison.modal}</th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-mandi-700">{t.comparison.difference}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-field-100">
                  {records.map((r) => {
                    const mandi = getMandi(r.mandiId);
                    const diff =
                      selectedModal != null && r.modalPrice != null
                        ? r.modalPrice - selectedModal
                        : null;
                    return (
                      <tr key={r.id} className="hover:bg-field-50">
                        <td className="px-4 py-3 font-semibold text-mandi-800">
                          {lang === 'mr' ? mandi?.nameMr ?? r.mandiName : r.mandiName}
                          {r.mandiId === mandiId && (
                            <span className="ml-2 chip bg-mandi-100 text-mandi-700">{t.search.mandi}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-field-500">
                          {mandi ? `${mandi.distanceFromHQ} ${t.comparison.km}` : '—'}
                        </td>
                        <td className="px-4 py-3">{formatPrice(r.minPrice)}</td>
                        <td className="px-4 py-3">{formatPrice(r.maxPrice)}</td>
                        <td className="px-4 py-3 font-semibold">{formatPrice(r.modalPrice)}</td>
                        <td className={`px-4 py-3 font-semibold ${diff != null && diff > 0 ? 'text-mandi-600' : diff != null && diff < 0 ? 'text-harvest-600' : 'text-field-500'}`}>
                          {diff != null ? `${diff > 0 ? '+' : ''}${formatPrice(diff)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

