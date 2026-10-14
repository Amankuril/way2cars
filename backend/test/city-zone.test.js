import { describe, it, expect, beforeAll } from 'vitest';
import { api, auth, useDb, tokenFor } from './helpers.js';
import { AdminUser } from '../src/modules/admin/admin.model.js';
import { insideGeofence } from '../src/integrations/maps.js';

useDb();

// A rough box around central Indore, [lng, lat].
const INDORE_ZONE = [[75.80, 22.66], [75.95, 22.66], [75.95, 22.79], [75.80, 22.79]];

describe('city service zones', () => {
  let token;
  let cityId;
  beforeAll(async () => {
    const admin = await AdminUser.create({ email: 'zones@test.in', name: 'Zones', role: 'super_admin', passwordHash: 'x' });
    token = await tokenFor('admin', admin);
  });

  it('saves a drawn zone and returns it to the admin', async () => {
    const res = await api().post('/api/v1/admin/catalog/cities').set(auth(token))
      .send({ name: 'Indore', slug: 'indore-zone', lat: 22.72, lng: 75.87, geofencePolygon: INDORE_ZONE }).expect(201);
    cityId = res.body.data.id;
    expect(res.body.data.geofencePolygon).toEqual(INDORE_ZONE);
    expect(res.body.data.hasPolygon).toBe(true);
    const list = await api().get('/api/v1/admin/catalog/cities').set(auth(token)).expect(200);
    expect(list.body.data.find((c) => c.id === cityId).geofencePolygon).toEqual(INDORE_ZONE);
  });

  it('rejects points that are not valid coordinates', async () => {
    await api().patch(`/api/v1/admin/catalog/cities/${cityId}`).set(auth(token))
      .send({ geofencePolygon: [[75.8, 22.6], [275.9, 22.6], [75.9, 22.7]] }).expect(422);
  });

  it('removes the zone with null (the radius applies again)', async () => {
    const res = await api().patch(`/api/v1/admin/catalog/cities/${cityId}`).set(auth(token)).send({ geofencePolygon: null }).expect(200);
    expect(res.body.data.geofencePolygon).toBeNull();
    expect(res.body.data.hasPolygon).toBe(false);
  });

  it('accepts pickups inside the zone and rejects ones outside', () => {
    const fence = { polygon: INDORE_ZONE };
    expect(insideGeofence({ lat: 22.724355, lng: 75.8838944 }, fence)).toBe(true); // New Palasia
    expect(insideGeofence({ lat: 23.2599, lng: 77.4126 }, fence)).toBe(false); // Bhopal
  });
});
