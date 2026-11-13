# WAY2CARS release APKs

| File | App | Package |
|---|---|---|
| `way2cars-user-v1.2.4.apk` | Renter app (latest) | `in.way2cars.user` |
| `way2cars-host-v1.2.1.apk` | Host (vendor) app (latest) | `in.way2cars.host` |

Older APKs were removed from this folder; each new version installs over the previous one.

v1.2.4 renter (versionCode 8): pay without an approved driving licence (when admin setting "Require online DL
approval before payment" is off); "Start trip" waits until staff verify the original licence in the admin panel.
Needs the backend from commit 30f9b82 or later.

v1.2.3 renter (versionCode 7): shares the phone's location from pickup to return (needs a backend with `TRACKING_PROVIDER=phone`).
v1.2.2 renter (versionCode 6) / v1.2.1 host (versionCode 5): WhatsApp on/off switch in notification settings
(the backend now sends login OTPs and updates on WhatsApp when configured).
v1.2.1 renter: shows payment adjustments and refunds credited to the WAY2CARS wallet.

v1.2.0 (versionCode 4) — needs the v1.2.0 backend deployed. Renter: BOOKED badge with next available time, support
number on booking errors, unlimited-km option, deposit as money (min ₹15,000) / bike / laptop, pickup & drop-off points
for fleet cars, advance shown in trip list and payments, deposit inspection/refund status, trip rules, app analytics.
Host: catalogue model/variant pickers, unlimited-km price, mark bike/laptop deposit received/returned.
Manual test guide: `docs/WAY2CARS-Manual-Test-Guide-v1.2.2.pdf`.


v1.1.1 (versionCode 3) is v1.1.0 pointed at `https://way2cars.io` (HTTPS only) and installs over earlier versions. v1.1.0 (versionCode 2) changes: Renter: advance payment, pay balance, extension requests with approval, 12-hour rule and late-fee info. Host: own share per booking, works when admins hide renter details/amounts. Needs the matching backend deployed.

Both are signed with the WAY2CARS release key (`~/.way2cars/keys/way2cars-release.jks`, kept outside the repo — back it up; Play Store updates must be signed with the same key) and contain `arm64-v8a` + `armeabi-v7a` code.

The APK files are git-ignored; rebuild them with the commands below.

## API they talk to

Base URL: `https://way2cars.io`. The apps call `/api/v1/...` under it, e.g.

- `https://way2cars.io/api/ready` — readiness check
- `https://way2cars.io/api/v1/auth/user/...`, `/api/v1/auth/vendor/...` — OTP login
- `https://way2cars.io/uploads/...` — public images (cars, banners, cities)

Backend `PUBLIC_MEDIA_BASE_URL` on the server should be `https://way2cars.io/uploads`.

## Rebuilding

```bash
cd apps/user        # or apps/vendor
W2C_API_BASE_URL=https://way2cars.io W2C_ENV=production node scripts/write-env.js
cd android && NODE_OPTIONS=--max-old-space-size=1536 ./gradlew assembleRelease --no-daemon --max-workers=1 -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
# → android/app/build/outputs/apk/release/app-release.apk
```

Build one app at a time on the 7 GB dev machine. For a plain-HTTP API you would also need `W2C_ALLOW_CLEARTEXT=true`; the HTTPS build leaves it off.
