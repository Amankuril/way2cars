# WAY2CARS release APKs

| File | App | Package |
|---|---|---|
| `way2cars-user-v1.0.0.apk` | Renter app | `in.way2cars.user` |
| `way2cars-host-v1.0.0.apk` | Host (vendor) app | `in.way2cars.host` |

Both are signed with the WAY2CARS release key (`~/.way2cars/keys/way2cars-release.jks`, kept outside the repo — back it up; Play Store updates must be signed with the same key) and contain `arm64-v8a` + `armeabi-v7a` code.

The APK files are git-ignored; rebuild them with the commands below.

## API they talk to

Base URL: `http://187.127.170.123:5055`. The apps call `/api/v1/...` under it, e.g.

- `http://187.127.170.123:5055/api/ready` — readiness check
- `http://187.127.170.123:5055/api/v1/auth/user/...`, `/api/v1/auth/vendor/...` — OTP login
- `http://187.127.170.123:5055/uploads/...` — public images (cars, banners, cities)

Backend `.env` on the server must match:

```
PORT=5055
HOST=0.0.0.0
PUBLIC_MEDIA_BASE_URL=http://187.127.170.123:5055/uploads
SERVE_PUBLIC_UPLOADS=true
```

## Rebuilding

```bash
cd apps/user        # or apps/vendor
W2C_API_BASE_URL=http://187.127.170.123:5055 W2C_ENV=staging node scripts/write-env.js
cd android && W2C_ALLOW_CLEARTEXT=true ./gradlew assembleRelease -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
# → android/app/build/outputs/apk/release/app-release.apk
```

Plain HTTP is allowed only because `W2C_ALLOW_CLEARTEXT=true`. Once the API has a domain with HTTPS, rebuild with `W2C_API_BASE_URL=https://…` and without that flag.
