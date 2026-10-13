import { LRUCache } from 'lru-cache';
import { env } from '../config/env.js';
import { badRequest, providerError, unavailable } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { fetchWithRetry } from './http.js';

/**
 * Google Maps Platform — the ONLY module that calls Google Maps APIs.
 *  - Places API (New): autocomplete + place details (session tokens for billing)
 *  - Geocoding API: forward / reverse geocoding
 *  - Routes API: driving distance & duration (+ optional polyline)
 * Pure geometry (haversine, geofence checks) is computed locally — no API cost.
 */

const cache = new LRUCache({ max: 5000, ttl: env.MAPS_CACHE_TTL_SECONDS * 1000 });
const usage = { autocomplete: 0, details: 0, geocode: 0, reverse: 0, routes: 0, cacheHits: 0, errors: 0 };
export const mapsUsage = () => ({ ...usage });
export const mapsConfigured = () => Boolean(env.GOOGLE_MAPS_SERVER_KEY);

function key() {
  if (!env.GOOGLE_MAPS_SERVER_KEY) throw unavailable('Location services are not configured.', 'MAPS_UNAVAILABLE');
  return env.GOOGLE_MAPS_SERVER_KEY;
}

async function cached(cacheKey, kind, fn) {
  const hit = cache.get(cacheKey);
  if (hit) {
    usage.cacheHits++;
    return hit;
  }
  usage[kind]++;
  try {
    const value = await fn();
    cache.set(cacheKey, value);
    return value;
  } catch (err) {
    usage.errors++;
    if (err.expose) throw err;
    logger.error({ kind, err: err.message }, 'maps request failed');
    throw providerError('Location service is temporarily unavailable.', 'MAPS_PROVIDER_ERROR');
  }
}

async function googleJson(url, init) {
  const res = await fetchWithRetry(url, init, { timeoutMs: 6000, retries: 1 });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
  return json;
}

const round = (n, d = 4) => Number(n).toFixed(d);
export const validLatLng = ({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Address suggestions restricted to India, optionally biased around a point. */
export async function autocomplete(input, { sessionToken, near } = {}) {
  const q = String(input || '').trim();
  if (q.length < 2) return [];
  if (q.length > 200) throw badRequest('Search text is too long.');
  const body = { input: q, includedRegionCodes: ['in'], languageCode: 'en' };
  if (sessionToken) body.sessionToken = sessionToken;
  if (near && validLatLng(near)) body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 30000 } };
  return cached(`ac:${q.toLowerCase()}:${near ? `${round(near.lat, 2)},${round(near.lng, 2)}` : ''}`, 'autocomplete', async () => {
    const json = await googleJson('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': key() },
      body: JSON.stringify(body),
    });
    return (json.suggestions || [])
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .map((p) => ({
        placeId: p.placeId,
        primary: p.structuredFormat?.mainText?.text || p.text?.text,
        secondary: p.structuredFormat?.secondaryText?.text || '',
        description: p.text?.text,
      }));
  });
}

function parseComponents(components = [], longKey = 'longText') {
  const get = (type) => components.find((c) => c.types?.includes(type))?.[longKey];
  return {
    city: get('locality') || get('administrative_area_level_2') || get('sublocality'),
    state: get('administrative_area_level_1'),
    pincode: get('postal_code'),
    country: get('country'),
  };
}

/** Resolves a placeId to coordinates and structured address. */
export async function placeDetails(placeId, { sessionToken } = {}) {
  if (!/^[\w-]{10,300}$/.test(String(placeId || ''))) throw badRequest('Invalid place reference.');
  return cached(`pd:${placeId}`, 'details', async () => {
    const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
    if (sessionToken) url.searchParams.set('sessionToken', sessionToken);
    const json = await googleJson(url, {
      headers: { 'X-Goog-Api-Key': key(), 'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents' },
    });
    return {
      placeId: json.id,
      name: json.displayName?.text,
      address: json.formattedAddress,
      lat: json.location?.latitude,
      lng: json.location?.longitude,
      ...parseComponents(json.addressComponents),
    };
  });
}

export async function geocode(address) {
  const q = String(address || '').trim();
  if (!q) throw badRequest('Address is required.');
  return cached(`gc:${q.toLowerCase()}`, 'geocode', async () => {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('address', q);
    url.searchParams.set('region', 'in');
    url.searchParams.set('key', key());
    const json = await googleJson(url);
    const r = json.results?.[0];
    if (!r) return null;
    return { address: r.formatted_address, lat: r.geometry.location.lat, lng: r.geometry.location.lng, placeId: r.place_id, ...parseComponents(r.address_components, 'long_name') };
  });
}

export async function reverseGeocode({ lat, lng }) {
  if (!validLatLng({ lat, lng })) throw badRequest('Invalid coordinates.');
  return cached(`rg:${round(lat)},${round(lng)}`, 'reverse', async () => {
    const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
    url.searchParams.set('latlng', `${lat},${lng}`);
    url.searchParams.set('key', key());
    const json = await googleJson(url);
    const r = json.results?.[0];
    if (!r) return null;
    return { address: r.formatted_address, lat, lng, placeId: r.place_id, ...parseComponents(r.address_components, 'long_name') };
  });
}

/** Driving distance/duration between two points (Routes API). */
export async function drivingRoute(from, to, { polyline = false } = {}) {
  if (!validLatLng(from) || !validLatLng(to)) throw badRequest('Invalid coordinates.');
  return cached(`rt:${round(from.lat)},${round(from.lng)}>${round(to.lat)},${round(to.lng)}:${polyline}`, 'routes', async () => {
    const json = await googleJson('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': key(),
        'X-Goog-FieldMask': `routes.distanceMeters,routes.duration${polyline ? ',routes.polyline.encodedPolyline' : ''}`,
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
      }),
    });
    const r = json.routes?.[0];
    if (!r) return null;
    return { distanceMeters: r.distanceMeters, durationSeconds: parseInt(String(r.duration || '0').replace('s', ''), 10), polyline: r.polyline?.encodedPolyline };
  });
}

// ---------------------------------------------------------------- local geometry (free)
const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineMeters(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Geofence check: circle {center, radiusMeters} or polygon [[lng,lat],...] (ray casting). */
export function insideGeofence(point, fence) {
  if (fence.center && fence.radiusMeters) return haversineMeters(point, fence.center) <= fence.radiusMeters;
  if (Array.isArray(fence.polygon) && fence.polygon.length >= 3) {
    let inside = false;
    const poly = fence.polygon;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  return false;
}

export const toGeoPoint = ({ lat, lng }) => ({ type: 'Point', coordinates: [lng, lat] });
export const fromGeoPoint = (p) => (p?.coordinates ? { lat: p.coordinates[1], lng: p.coordinates[0] } : null);
