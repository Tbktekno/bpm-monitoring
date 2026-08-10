# Testing & CI/CD — BPM & SpO₂ Monitoring Dashboard

Dokumen ini menjelaskan strategi pengujian, alat yang dipakai, dan pipeline CI/CD.

---

## Daftar Isi

- [Ringkasan](#ringkasan)
- [Alat Pengujian](#alat-pengujian)
- [Unit Test Backend](#unit-test-backend)
- [Unit Test Frontend](#unit-test-frontend)
- [Menjalankan Test](#menjalankan-test)
- [Test Sistem End-to-End](#test-sistem-end-to-end)
- [Pipeline CI/CD](#pipeline-cicd)
- [Praktik Terbaik](#praktik-terbaik)

---

## Ringkasan

| Area | Alat | Lokasi |
|------|------|--------|
| Backend | Vitest | `backend/src/__tests__/*.test.ts` |
| Frontend | Vitest + Testing Library | `frontend/src/__tests__/**/*.test.tsx` |
| Lint (frontend) | oxlint | `npm run lint` |
| Type check | TypeScript `tsc --noEmit` | backend & frontend |
| CI/CD | GitHub Actions | `.github/workflows/ci.yml` |
| Test sistem | Node script | `test-system.mjs` (root) |

---

## Alat Pengujian

### Vitest
Framework test (mirip Jest) untuk backend & frontend.

### Testing Library (React)
`@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` untuk menguji komponen React.

### jsdom
Environment DOM untuk test frontend.

### oxlint
Linter frontend (cepat, Rust-based).

---

## Unit Test Backend

Lokasi: `backend/src/__tests__/`

| File | Yang Diuji |
|------|------------|
| `status-calculator.test.ts` | Logika threshold BPM/SpO₂/status (pure functions) |
| `auth.test.ts` | Autentikasi (login, token, middleware) |
| `patients.test.ts` | Validasi & CRUD pasien |
| `dashboard.test.ts` | Statistik dashboard |

### Contoh pola test (status-calculator)

```ts
import { describe, it, expect } from 'vitest';
import { calculateBpmStatus, calculateSpo2Status, calculateCompositeStatus } from '../shared/status-calculator';

describe('calculateBpmStatus', () => {
  it('returns BRADICARDIA for bpm < 60', () => {
    expect(calculateBpmStatus(55)).toBe('BRADICARDIA');
  });
  it('returns NORMAL for bpm 60-100', () => {
    expect(calculateBpmStatus(75)).toBe('NORMAL');
  });
  // ...
});
```

---

## Unit Test Frontend

Lokasi: `frontend/src/__tests__/`

| File | Yang Diuji |
|------|------------|
| `auth/Login.test.tsx` | Form & alur login |
| `auth/ProtectedRoute.test.tsx` | Proteksi route |
| `components/Button.test.tsx` | Komponen Button |
| `components/Card.test.tsx` | Komponen Card |
| `components/LoadingSpinner.test.tsx` | Komponen LoadingSpinner |
| `components/StatusBadge.test.tsx` | Badge status + klasifikasi |
| `pages/Dashboard.test.tsx` | Halaman Dashboard |
| `pages/PatientList.test.tsx` | Halaman daftar pasien |

### Contoh pola test komponen

```tsx
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '@/components/ui/StatusBadge';

describe('StatusBadge', () => {
  it('menampilkan Dugaan Hipoksemia untuk spo2 < 95', () => {
    render(<StatusBadge bpm={80} spo2={90} />);
    expect(screen.getByText('Dugaan Hipoksemia')).toBeInTheDocument();
  });
});
```

---

## Menjalankan Test

### Backend
```bash
cd backend
npm test                 # vitest run
npm test -- --coverage   # dengan coverage
npm run lint             # lint backend
npx tsc --noEmit         # type check
```

### Frontend
```bash
cd frontend
npm test                 # vitest run
npm test -- --coverage
npm run lint             # oxlint
npx tsc --noEmit         # type check
```

### Root (keduanya)
```bash
npm test
npm run lint
```

---

## Test Sistem End-to-End

Terdapat skrip test sistem di root: `test-system.mjs`.

Skrip ini memverifikasi bahwa seluruh sistem berjalan (backend + frontend + API). Jalankan setelah development server aktif:

```bash
node test-system.mjs
```

Atau gunakan skrip yang tersedia:
- `run-test.bat` (Windows)
- `run-test.sh` (Linux/macOS)

### Simulator Device untuk Uji Ingestion

`simulate-device.mjs` (root) meniru pengiriman data sensor dari ESP8266 ke backend — berguna untuk menguji alur ingestion → sesi → laporan tanpa hardware:

```bash
node simulate-device.mjs
```

Env opsional: `BACKEND_URL` (default `http://localhost:5000`), `DEVICE_ID` (default `ESP8266-ALPHA-001`, harus terdaftar & aktif), `API_KEY`, `INTERVAL_MS` (default 500), `BPM_MIN`/`BPM_MAX`/`SPO2_MIN`/`SPO2_MAX`.

> Mulai sesi monitoring terlebih dahulu di halaman Monitoring agar data otomatis ter-link ke responden.

---

## Pipeline CI/CD

File: `.github/workflows/ci.yml` — trigger pada push/PR ke `main` dan `develop`.

```
push / PR → main, develop
    │
    ├─ Job 1: lint (ubuntu)
    │    • backend: npm ci → prisma generate → tsc --noEmit
    │    • frontend: npm ci → lint → tsc --noEmit
    │
    ├─ Job 2: test (needs: lint)
    │    • backend: npm test -- --coverage (continue-on-error)
    │    • frontend: npm test -- --coverage (continue-on-error)
    │
    ├─ Job 3: build (needs: test)
    │    • backend: build → upload artifact backend/dist
    │    • frontend: build (VITE_API_BASE_URL=/api/v1) → upload artifact frontend/dist
    │
    └─ Job 4: docker (needs: build, hanya pada push)
         • login GHCR → build & push image backend & frontend
```

### Gambar (Images)
- `ghcr.io/{repo}/backend` — tag `sha-{short}`, `{branch}`, `latest` (main)
- `ghcr.io/{repo}/frontend` — tag serupa

### Node Version
`NODE_VERSION: "22"`

---

## Praktik Terbaik

1. **Pure functions dulu** — uji logika threshold (`status-calculator`) secara unit.
2. **Validasi input** — pastikan error validasi dikembalikan dengan field yang benar.
3. **Komponen kecil** — uji komponen UI secara terisolasi.
4. **Jangan lari ke database** — mock Prisma/axios di unit test.
5. **Test kontrak API** — gunakan skrip `test-system.mjs` untuk memastikan integrasi.
6. **CI sebagai gate** — lint/typecheck/test wajib lolos sebelum build & deploy.
7. **Coverage** — targetkan cakupan fungsi kritis (status calculator, auth middleware).

---

## Lanjutkan Membaca

- [Setup](setup.md)
- [Deployment](deployment.md)
- [Arsitektur](architecture.md)
