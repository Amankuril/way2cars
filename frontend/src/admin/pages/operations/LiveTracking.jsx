import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, MapPinned } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { ago, dateTime } from '@shared/lib/format.js';
import { cn } from '@/admin/lib/utils.js';
import { PageHeader } from '@/admin/components/PageHeader.jsx';
import { Panel, KeyValue } from '@/admin/components/Panel.jsx';
import { SearchInput } from '@/admin/components/Filters.jsx';
import { StatusPill } from '@/admin/components/StatusPill.jsx';
import { ErrorState, EmptyState } from '@/admin/components/EmptyState.jsx';
import { loadMaps } from '@/admin/components/ZoneMap.jsx';

const REFRESH_MS = 30_000;
const BRAND = '#1875B9';

/** Marker at the latest position with the trip's route. Recentres only when another car is selected. */
function LiveMap({ vehicleId, latest, route }) {
  const box = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const line = useRef(null);
  const centredOn = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadMaps().then((maps) => {
      if (!alive || !box.current) return;
      map.current = new maps.Map(box.current, { center: latest, zoom: 14, streetViewControl: false, mapTypeControl: false, fullscreenControl: true });
      marker.current = new maps.Marker({ map: map.current, position: latest });
      line.current = new maps.Polyline({ map: map.current, path: route, strokeColor: BRAND, strokeWeight: 4, strokeOpacity: 0.8 });
      centredOn.current = vehicleId;
      setReady(true);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    marker.current.setPosition(latest);
    line.current.setPath(route);
    if (centredOn.current !== vehicleId) {
      map.current.setCenter(latest);
      centredOn.current = vehicleId;
    }
  }, [ready, vehicleId, latest, route]);

  if (failed) return <p className="rounded-lg bg-ink-50 p-4 text-caption text-ink-600">The map could not load. Check the Google Maps browser key. The link below still works.</p>;
  return <div ref={box} className="h-[420px] w-full rounded-lg bg-ink-50" role="img" aria-label="Map of the car’s latest position" />;
}

function Detail({ id }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['tracking-vehicle', id],
    queryFn: () => api.get(`${ADMIN}/tracking/vehicles/${id}`),
    refetchInterval: REFRESH_MS,
  });
  if (isLoading) return <p className="text-caption text-ink-500">Loading location…</p>;
  if (error) return <ErrorState error={error} onRetry={refetch} title="Location unavailable" />;
  const { vehicle, trip, latest, route, signalLost } = data;
  const heading = `${vehicle.title} · ${vehicle.registrationNumber}`;
  if (!latest) {
    return (
      <Panel title={heading}>
        <EmptyState compact icon={MapPinned} title={trip ? 'Waiting for the renter’s phone' : 'No location yet'} description={trip ? 'The trip has started, but the phone has not reported a position yet.' : 'A location appears once this car is on a trip.'} />
      </Panel>
    );
  }
  return (
    <Panel title={heading} actions={trip ? <StatusPill tone={signalLost ? 'danger' : 'success'}>{signalLost ? 'Signal lost' : 'Live'}</StatusPill> : <StatusPill tone="neutral">Not on a trip</StatusPill>}>
      <div className="space-y-3">
        {trip ? null : <p className="text-caption text-ink-600">Last known location, from the end of its most recent trip.</p>}
        <LiveMap vehicleId={id} latest={{ lat: latest.lat, lng: latest.lng }} route={route} />
        <KeyValue
          columns={2}
          items={[
            ['Updated', `${ago(latest.recordedAt)} (${dateTime(latest.recordedAt)})`],
            ['Speed', latest.speedKmh !== undefined && latest.speedKmh !== null ? `${Math.round(latest.speedKmh)} km/h` : '—'],
            ...(trip ? [
              ['Renter', trip.renterPhone ? `${trip.renterName || 'Renter'} · ${trip.renterPhone}` : trip.renterName || 'Renter'],
              ['Booking', <Link key="b" className="link" to={`/bookings/${trip.bookingId}`}>{trip.ref}</Link>],
              ['Return due', dateTime(trip.endAt)],
            ] : []),
          ]}
        />
        <a className="link inline-flex items-center gap-1 text-caption" href={`https://www.google.com/maps?q=${latest.lat},${latest.lng}`} target="_blank" rel="noreferrer">
          Open in Google Maps <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <p className="text-caption text-ink-500">This is the location of the renter’s phone, which may not be with the car.</p>
      </div>
    </Panel>
  );
}

export default function LiveTracking() {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['tracking-vehicles', q],
    queryFn: () => api.get(`${ADMIN}/tracking/vehicles${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    refetchInterval: REFRESH_MS,
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader title="Live tracking" description="Select a car to see its location from the renter’s phone during a trip." />
      {error ? <ErrorState error={error} onRetry={refetch} title="Tracking unavailable" /> : null}
      {data && !data.trackingAvailable ? (
        <EmptyState icon={MapPinned} title="Tracking is turned off" description="Set TRACKING_PROVIDER=phone in the server’s .env and restart the API. Renters need app version 1.2.3 or newer." />
      ) : null}
      {data?.trackingAvailable ? (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Panel title="Cars" bodyClassName="p-0">
            <div className="p-3"><SearchInput value={q} onChange={setQ} placeholder="Search number or model" label="Search cars" /></div>
            <ul className="max-h-[640px] overflow-y-auto">
              {data.vehicles.map((v) => (
                <li key={v.id}>
                  <button type="button" onClick={() => setSelected(v.id)} aria-pressed={selected === v.id} className={cn('flex w-full items-center justify-between gap-2 border-t border-ink-100 px-3 py-2.5 text-left hover:bg-ink-50', selected === v.id && 'bg-brand-50')}>
                    <span className="min-w-0">
                      <span className="block truncate text-bodySm font-semibold text-ink-900">{v.registrationNumber}</span>
                      <span className="block truncate text-caption text-ink-500">{v.title}{v.latest ? ` · ${ago(v.latest.recordedAt)}` : ''}</span>
                    </span>
                    {v.onTrip ? <StatusPill tone={v.signalLost ? 'danger' : 'success'}>{v.signalLost ? 'No signal' : 'On trip'}</StatusPill> : null}
                  </button>
                </li>
              ))}
              {!data.vehicles.length ? <li className="border-t border-ink-100 p-4 text-caption text-ink-500">No cars found.</li> : null}
            </ul>
          </Panel>
          <div>
            {selected ? <Detail key={selected} id={selected} /> : (
              <Panel title="Location"><EmptyState compact icon={MapPinned} title="Select a car" description="Cars on a trip are listed first." /></Panel>
            )}
          </div>
        </div>
      ) : null}
      {isLoading ? <p className="text-caption text-ink-500">Loading cars…</p> : null}
    </>
  );
}
