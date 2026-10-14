import { useEffect, useRef, useState } from 'react';
import { MapPin, PenLine, Undo2, Check, Trash2, Search, Loader2, AlertTriangle } from 'lucide-react';
import { api, ADMIN } from '@/admin/lib/api.js';
import { Button } from '@/admin/components/Button.jsx';
import { cn } from '@/admin/lib/utils.js';

/**
 * Service-zone editor for a city. Search a place to fly the map there, click points to draw the
 * zone, then drag its corners (or the midpoints, to add corners). Other cities' zones are shown in
 * grey for reference. Zones are [[lng, lat], …] — the shape the API stores and checks pickups against.
 * Google retired the Drawing library, so drawing is done with map clicks + an editable Polygon.
 */

const BRAND = '#1875B9';
let mapsPromise;

/** Loads the Maps JavaScript API once, with the browser key from the public config. */
function loadMaps() {
  if (window.google?.maps?.Polygon) return Promise.resolve(window.google.maps);
  mapsPromise ||= api.get('/api/v1/public/config').then(
    (cfg) =>
      new Promise((resolve, reject) => {
        if (!cfg?.mapsBrowserKey) return reject(new Error('NO_KEY'));
        window.__w2cMapsReady = () => resolve(window.google.maps);
        window.gm_authFailure = () => reject(new Error('AUTH'));
        const s = document.createElement('script');
        s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(cfg.mapsBrowserKey)}&v=weekly&loading=async&callback=__w2cMapsReady`;
        s.async = true;
        s.onerror = () => reject(new Error('LOAD'));
        document.head.appendChild(s);
      }),
  );
  mapsPromise.catch(() => { mapsPromise = undefined; });
  return mapsPromise;
}

const toLatLngs = (poly) => (poly || []).map(([lng, lat]) => ({ lat, lng }));
const toPoly = (path) => path.getArray().map((p) => [Number(p.lng().toFixed(6)), Number(p.lat().toFixed(6))]);

/** Area-weighted centroid of a [[lng, lat]] ring (falls back to the vertex average). */
export function zoneCentre(poly) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x0, y0] = poly[j];
    const [x1, y1] = poly[i];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-12) {
    const n = poly.length;
    return { lat: poly.reduce((s, p) => s + p[1], 0) / n, lng: poly.reduce((s, p) => s + p[0], 0) / n };
  }
  return { lat: Number((cy / (3 * a)).toFixed(6)), lng: Number((cx / (3 * a)).toFixed(6)) };
}

const ERRORS = {
  NO_KEY: 'The map needs GOOGLE_MAPS_BROWSER_KEY in the backend .env.',
  AUTH: 'Google rejected the Maps key. Enable "Maps JavaScript API" for it and allow this site in the key restrictions.',
  LOAD: 'The map could not load. Check your connection.',
};

export function ZoneMap({ centre, polygon, radiusKm, others = [], onChange, onPlace }) {
  const el = useRef(null);
  const g = useRef({}); // google objects: maps, map, zone, draft, marker, circle, listeners
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const picked = useRef(false); // the box shows the chosen place; don't search for it again
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Map + static layers
  useEffect(() => {
    let alive = true;
    loadMaps()
      .then((maps) => {
        if (!alive || !el.current) return;
        const start = centre || (polygon?.length ? zoneCentre(polygon) : { lat: 22.5, lng: 79 }); // India
        const map = new maps.Map(el.current, {
          center: start,
          zoom: centre || polygon?.length ? 11 : 5,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });
        g.current = { maps, map };
        others.forEach((o) => {
          if (o.polygon?.length) {
            new maps.Polygon({ map, paths: toLatLngs(o.polygon), strokeColor: '#728189', strokeOpacity: 0.7, strokeWeight: 1.5, fillColor: '#98A5AC', fillOpacity: 0.15, clickable: false });
          } else if (o.centre) {
            new maps.Circle({ map, center: o.centre, radius: (o.radiusKm || 0) * 1000, strokeColor: '#728189', strokeOpacity: 0.5, strokeWeight: 1, fillColor: '#98A5AC', fillOpacity: 0.08, clickable: false });
          }
        });
        setStatus('ready');
      })
      .catch((e) => {
        if (!alive) return;
        setError(ERRORS[e.message] || ERRORS.LOAD);
        setStatus('error');
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zone polygon (editable), or the radius fallback around the centre
  useEffect(() => {
    const { maps, map } = g.current;
    if (status !== 'ready' || !maps || drawing) return undefined;
    g.current.zone?.setMap(null);
    g.current.circle?.setMap(null);
    g.current.marker?.setMap(null);
    (g.current.listeners || []).forEach((l) => l.remove());
    g.current.listeners = [];
    if (polygon?.length >= 3) {
      const zone = new maps.Polygon({ map, paths: toLatLngs(polygon), editable: true, strokeColor: BRAND, strokeWeight: 2, fillColor: BRAND, fillOpacity: 0.18 });
      const path = zone.getPath();
      const emit = () => {
        const next = toPoly(path);
        if (next.length >= 3) onChangeRef.current({ polygon: next, centre: zoneCentre(next) });
      };
      g.current.listeners = ['set_at', 'insert_at', 'remove_at'].map((ev) => maps.event.addListener(path, ev, emit));
      // Right-click a corner to delete it (keeps at least 3).
      g.current.listeners.push(zone.addListener('contextmenu', (e) => {
        if (e.vertex != null && path.getLength() > 3) path.removeAt(e.vertex);
      }));
      g.current.zone = zone;
    } else if (centre) {
      g.current.marker = new maps.Marker({ map, position: centre, title: 'City centre' });
      g.current.circle = new maps.Circle({ map, center: centre, radius: (Number(radiusKm) || 0) * 1000, strokeColor: BRAND, strokeOpacity: 0.8, strokeWeight: 1.5, fillColor: BRAND, fillOpacity: 0.08, clickable: false });
    }
    return undefined;
  }, [status, polygon, centre, radiusKm, drawing]);

  const fit = (points) => {
    const { maps, map } = g.current;
    if (!maps || !points.length) return;
    const b = new maps.LatLngBounds();
    points.forEach((p) => b.extend(p));
    map.fitBounds(b, 40);
  };

  const startDrawing = () => {
    const { maps, map } = g.current;
    g.current.zone?.setMap(null);
    g.current.circle?.setMap(null);
    g.current.marker?.setMap(null);
    const draft = new maps.Polyline({ map, path: [], strokeColor: BRAND, strokeWeight: 2, clickable: false });
    const dots = [];
    g.current.draft = { line: draft, dots };
    g.current.clickL = map.addListener('click', (e) => {
      draft.getPath().push(e.latLng);
      dots.push(new maps.Marker({ map, position: e.latLng, clickable: false, icon: { path: maps.SymbolPath.CIRCLE, scale: 5, fillColor: '#fff', fillOpacity: 1, strokeColor: BRAND, strokeWeight: 2 } }));
      setDraftCount(draft.getPath().getLength());
    });
    map.setOptions({ draggableCursor: 'crosshair', disableDoubleClickZoom: true });
    setDraftCount(0);
    setDrawing(true);
  };

  const stopDrawing = () => {
    const { map } = g.current;
    g.current.clickL?.remove();
    g.current.draft?.line.setMap(null);
    g.current.draft?.dots.forEach((d) => d.setMap(null));
    g.current.draft = null;
    map?.setOptions({ draggableCursor: null, disableDoubleClickZoom: false });
    setDrawing(false);
    setDraftCount(0);
  };

  const finish = () => {
    const path = g.current.draft?.line.getPath();
    if (!path || path.getLength() < 3) return;
    const next = toPoly(path);
    stopDrawing();
    onChange({ polygon: next, centre: zoneCentre(next) });
    fit(toLatLngs(next));
  };

  const undoPoint = () => {
    const d = g.current.draft;
    if (!d || !d.dots.length) return;
    d.line.getPath().pop();
    d.dots.pop().setMap(null);
    setDraftCount(d.line.getPath().getLength());
  };

  // Place search through our backend (Places API New)
  useEffect(() => {
    const term = q.trim();
    if (picked.current || term.length < 2) { setResults([]); return undefined; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.get(`${ADMIN}/maps/autocomplete`, { q: term });
        setResults(r || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const pick = async (r) => {
    picked.current = true;
    setResults([]);
    setQ(r.description || r.primary);
    try {
      const p = await api.get(`${ADMIN}/maps/place/${encodeURIComponent(r.placeId)}`);
      if (!p) return;
      const at = { lat: p.lat, lng: p.lng };
      g.current.map?.panTo(at);
      g.current.map?.setZoom(11);
      onPlace?.(p);
      if (!polygon?.length) onChange({ polygon: null, centre: at });
    } catch {
      // the search box stays as typed; nothing else to do
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-ink-50 p-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => { picked.current = false; setQ(e.target.value); }}
            placeholder="Search the city or an area…"
            aria-label="Search a place on the map"
            className="h-9 w-full rounded-md border border-line bg-surface pl-8 pr-8 text-bodySm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          {searching ? <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-400" aria-hidden="true" /> : null}
          {results.length ? (
            <ul className="absolute left-0 right-0 top-10 z-20 max-h-64 overflow-auto rounded-md border border-line bg-surface py-1 shadow-pop" role="listbox">
              {results.map((r) => (
                <li key={r.placeId}>
                  <button type="button" onClick={() => pick(r)} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-ink-50">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-bodySm font-semibold text-ink-900">{r.primary}</span>
                      {r.secondary ? <span className="block truncate text-caption text-ink-500">{r.secondary}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {drawing ? (
          <>
            <Button size="sm" icon={Undo2} onClick={undoPoint} disabled={!draftCount}>Undo point</Button>
            <Button size="sm" variant="ghost" onClick={stopDrawing}>Cancel</Button>
            <Button size="sm" variant="primary" icon={Check} onClick={finish} disabled={draftCount < 3}>Finish zone</Button>
          </>
        ) : (
          <>
            <Button size="sm" variant={polygon?.length ? 'secondary' : 'primary'} icon={PenLine} onClick={startDrawing} disabled={status !== 'ready'}>{polygon?.length ? 'Redraw zone' : 'Draw zone'}</Button>
            {polygon?.length ? <Button size="sm" variant="danger-outline" icon={Trash2} onClick={() => onChange({ polygon: null, centre })}>Remove zone</Button> : null}
          </>
        )}
      </div>
      <div className="relative">
        <div ref={el} className={cn('h-[380px] w-full bg-ink-100', status === 'error' && 'hidden')} />
        {status === 'loading' ? <div className="absolute inset-0 flex items-center justify-center text-bodySm text-ink-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Loading map…</div> : null}
        {status === 'error' ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-2 px-6 text-center text-bodySm text-ink-600">
            <AlertTriangle className="h-5 w-5 text-warning-600" aria-hidden="true" />
            {error}
          </div>
        ) : null}
        {drawing ? (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-ink-900/85 px-3 py-1.5 text-caption font-semibold text-white">
            {draftCount < 3 ? `Click the map to add corners (${draftCount}/3 minimum)` : `${draftCount} corners — click "Finish zone" when done`}
          </div>
        ) : null}
      </div>
      <p className="border-t border-line px-3 py-2 text-caption text-ink-500">
        {polygon?.length
          ? 'Drag a corner to move it, drag a midpoint to add a corner, right-click a corner to delete it. Cars can only be listed inside the zone.'
          : 'No zone drawn: the service area is the circle (radius) around the centre. Draw a zone for an exact boundary.'}
      </p>
    </div>
  );
}
