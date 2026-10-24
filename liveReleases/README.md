# WAY2CARS release APKs

| File | App | Package |
|---|---|---|
| `way2cars-user-v1.1.1.apk` | Renter app (latest) | `in.way2cars.user` |
| `way2cars-host-v1.1.1.apk` | Host (vendor) app (latest) | `in.way2cars.host` |
| `*-v1.1.0.apk`, `*-v1.0.0.apk` | Older releases (talk to the old IP address) | |

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
