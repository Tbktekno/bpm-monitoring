# Frontend — BPM & SpO₂ Monitoring Dashboard

Dokumen ini menjelaskan struktur, routing, halaman, services, hooks, dan komponen UI pada frontend React.

---

## Daftar Isi

- [Teknologi](#teknologi)
- [Struktur Direktori](#struktur-direktori)
- [Routing](#routing)
- [Autentikasi & Proteksi Route](#autentikasi--proteksi-route)
- [Halaman (Pages)](#halaman-pages)
- [Services (API Layer)](#services-api-layer)
- [Hooks](#hooks)
- [Komponen UI](#komponen-ui)
- [State Management](#state-management)
- [Constants](#constants)
- [Environment Variables](#environment-variables)

---

## Teknologi

| Kategori | Teknologi |
|----------|-----------|
| Framework | React 19 + TypeScript |
| Build tool | Vite 8 |
| Styling | Tailwind CSS 3, Framer Motion |
| Data fetching | TanStack React Query 5 |
| State client | React Context (`AuthContext`) |
| Routing | React Router DOM 7 |
| Chart | Recharts |
| Form | React Hook Form + Zod |
| Notifikasi | Sonner |
| Real-time | socket.io-client |

---

## Struktur Direktori

```
frontend/
├── .env                         # Environment variables
├── vite.config.ts               # Vite + proxy /api → backend
├── tailwind.config.js
├── tsconfig.json
├── package.json
├── Dockerfile                   # Build production (nginx)
├── nginx.conf                   # Config nginx untuk SPA
└── src/
    ├── main.tsx                 # Entry point
    ├── App.tsx                  # Root component + routing
    ├── index.css                # Global styles
    ├── constants/index.ts       # Threshold, status colors, dll
    ├── contexts/AuthContext.tsx # Auth state (React Context)
    ├── types/index.ts           # TypeScript interfaces
    ├── services/                # API layer (Axios)
    │   ├── api.ts               # Axios instance + interceptors
    │   ├── auth.service.ts
    │   ├── dashboard.service.ts
    │   ├── patients.service.ts
    │   ├── monitoring.service.ts
    │   ├── reports.service.ts
    │   ├── settings.service.ts
    │   ├── devices.service.ts
    │   └── socket.service.ts    # Socket.IO client singleton
    ├── hooks/
    │   ├── useAuth.ts
    │   ├── useDashboard.ts
    │   ├── useMonitoring.ts
    │   ├── usePatients.ts
    │   ├── usePagination.ts
    │   └── useSocket.ts
    ├── layouts/AppLayout.tsx    # Layout utama (sidebar + header)
    ├── components/
    │   ├── PatientFormModal.tsx
    │   └── ui/                  # Komponen UI reusable
    └── pages/                   # Halaman aplikasi
    └── __tests__/               # Unit tests (Vitest)
```

---

## Routing

Definisi route di `src/App.tsx`:

| Path | Halaman | Proteksi |
|------|---------|----------|
| `/login` | Login | PublicRoute (redirect jika sudah login) |
| `/` | Dashboard | ProtectedRoute + AppLayout |
| `/monitoring` | Monitoring | ProtectedRoute + AppLayout |
| `/monitoring/:patientId` | MonitoringDetail | ProtectedRoute + AppLayout |
| `/patients` | PatientList | ProtectedRoute + AppLayout |
| `/patients/:id` | PatientDetail | ProtectedRoute + AppLayout |
| `/history` | History | ProtectedRoute + AppLayout |
| `/reports` | Reports | ProtectedRoute + AppLayout |
| `/settings` | Settings | ProtectedRoute + AppLayout |
| `/devices` | Devices | ProtectedRoute + AppLayout |
| `*` | Redirect ke `/` | - |

**QueryClient** dikonfigurasi di `App.tsx`:
```ts
defaultOptions: {
  queries: {
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 5000,
  },
},
```

---

## Autentikasi & Proteksi Route

### AuthContext (`src/contexts/AuthContext.tsx`)

Menyimpan status autentikasi:
- `token` dan `user` disimpan di `localStorage`.
- `isAuthenticated`, `isLoading`.
- Method: `login(credentials)`, `logout()`, dll.

### ProtectedRoute / PublicRoute (`src/App.tsx`)

- **ProtectedRoute** → jika belum login, redirect ke `/login`.
- **PublicRoute** → jika sudah login, redirect ke `/`.

---

## Halaman (Pages)

### Dashboard (`pages/Dashboard.tsx`)
- Statistik ringkasan (total pasien, distribusi status).
- Rata-rata BPM/SpO₂.
- Grafik BPM & SpO₂ per jam (Recharts).
- 10 pembacaan terbaru.
- Menggunakan `useDashboard()`.

### Monitoring (`pages/Monitoring.tsx`)
- Pilih pasien → mulai sesi monitoring (device hardcode `ESP32-ALPHA-001`).
- Grafik BPM/SpO₂ real-time (subscribe `monitoring:update`).
- Timer sesi berjalan, tombol stop.
- Daftar sesi tersimpan.
- Modal hasil sesi.

### MonitoringDetail (`pages/MonitoringDetail.tsx`)
- Detail monitoring pasien + grafik real-time.
- Subscribe `monitoring:update` → update chart.
- Status klasifikasi terbaru.
- Tabel riwayat monitoring.

### PatientList (`pages/PatientList.tsx`)
- Tabel pasien + pencarian + pagination.
- Tombol tambah/lihat/ubah/hapus.

### PatientDetail (`pages/PatientDetail.tsx`)
- Detail pasien, informasi medis, riwayat readings.

### PatientCreate (`pages/PatientCreate.tsx`)
- Form tambah pasien (React Hook Form + Zod).

### PatientEdit (`pages/PatientEdit.tsx`)
- Form edit pasien.

### History (`pages/History.tsx`)
- Histori pembacaan dengan filter tanggal, status, pasien.
- Pagination.

### Reports (`pages/Reports.tsx`)
- Daftar sesi monitoring COMPLETED + filter pasien/tanggal.
- Modal detail sesi (rata-rata BPM/SpO₂ + **status penyakit dugaan**).
- Ekspor **PDF sesi** dan PDF/Excel laporan harian/bulanan.

### Settings (`pages/Settings.tsx`)
- Ubah ambang batas (threshold) BPM/SpO₂.
- Ubah profil (nama/email) & password.
- Hapus data monitoring.

### Devices (`pages/Devices.tsx`)
- CRUD perangkat ESP32/ESP8266.
- Menampilkan API key (sekali saja saat create).

### Login (`pages/Login.tsx`)
- Form login dengan validasi Zod.
- Opsi "remember me".

---

## Services (API Layer)

`src/services/api.ts` — instance Axios:

```ts
const api = axios.create({
  baseURL: API_BASE_URL,          // dari VITE_API_BASE_URL
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});
```

**Request interceptor:** menambahkan header `Authorization: Bearer <token>` dari `localStorage`.

**Response interceptor:**
- `401` → hapus token/user, redirect ke `/login`, toast "Sesi telah berakhir".
- `403` / `404` / `422` / `>=500` → toast error.
- `ERR_NETWORK` / `ECONNABORTED` → toast error koneksi/timeout.

| Service | Fungsi utama |
|---------|--------------|
| `auth.service.ts` | `login`, `logout`, `getMe` |
| `dashboard.service.ts` | `getDashboard()` |
| `patients.service.ts` | `getAll`, `getById`, `create`, `update`, `remove` |
| `monitoring.service.ts` | `getRealtime`, `getByPatient`, `getHistory`, `startSession`, `stopSession`, `getSessionDetail`, `getSessions` |
| `reports.service.ts` | `getDaily`, `getMonthly`, `exportSessionPdf`, `exportPdf`, `exportExcel`, `downloadBlob` |
| `settings.service.ts` | `getSettings`, `updateProfile`, `updateThresholds`, `changePassword`, `clearData` |
| `devices.service.ts` | `list`, `getById`, `create`, `update`, `toggle`, `remove` |
| `socket.service.ts` | `connect`, `disconnect`, `on`, `off`, `emit`, `isConnected` |

---

## Hooks

| Hook | Fungsi |
|------|--------|
| `useAuth()` | Akses konteks autentikasi |
| `useDashboard()` | Query data dashboard |
| `usePatients()` | Query/list CRUD pasien (`usePatient`, `usePatientsList`, dll) |
| `useMonitoring()` | Query data monitoring (`useMonitoringByPatient`, dll) |
| `usePagination()` | Helper state pagination |
| `useSocket()` | Akses `on`/`off`/`emit` dari `socketService` |

---

## Komponen UI

### `src/components/ui/`

| Komponen | Fungsi |
|----------|--------|
| `Button` | Tombol dengan variant & loading state |
| `Card` | Kartu konten |
| `Modal` | Dialog modal |
| `ConfirmDialog` | Konfirmasi aksi |
| `Input` | Input teks/angka |
| `Select` | Dropdown |
| `DataTable` | Tabel data generic dengan kolom custom |
| `DateRangePicker` | Picker rentang tanggal |
| `EmptyState` | State kosong |
| `ErrorState` | State error + tombol retry |
| `LoadingSpinner` | Indikator loading |
| `Pagination` | Navigasi halaman |
| `SearchInput` | Input pencarian |
| `Skeleton` | Placeholder loading |
| `StatCard` | Kartu statistik |
| `StatusBadge` | Badge status (Normal/Waspada/Darurat/Dugaan) |

### `src/components/PatientFormModal.tsx`
Form pasien dalam modal (dipakai di PatientList).

### `src/layouts/AppLayout.tsx`
Layout utama dengan sidebar navigasi + header.

---

## State Management

| Lapisan | Teknologi | Penggunaan |
|---------|-----------|------------|
| Server state | TanStack React Query | Data dari API (query + cache + invalidate) |
| Client state | React Context | `AuthContext` (auth) |
| Local state | `useState` / `useRef` | State per komponen |

**Pola invalidasi query:**
- Setelah mulai/stop sesi → `invalidateQueries(['monitoring', 'sessions'])`.
- Setelah CRUD pasien → invalidasi query pasien.
- Setelah reading baru (socket) → `invalidateQueries(['monitoring', 'patient', id])`.

---

## Constants

`src/constants/index.ts`:

| Constant | Isi |
|----------|-----|
| `API_BASE_URL` | `VITE_API_BASE_URL` atau `/api/v1` |
| `SOCKET_URL` | `VITE_SOCKET_URL` |
| `BPM_THRESHOLDS` | min 60, max 100, waspada 50/120 |
| `SPO2_THRESHOLDS` | min 95, max 100, waspada 90 |
| `STATUS_COLORS` | Warna badge per status |
| `calculateDiseaseStatus(bpm, spo2)` | Klasifikasi dugaan penyakit |
| `BLOOD_TYPES`, `GENDER_OPTIONS` | Opsi form |
| `STATUS_FILTERS` | Filter status |
| `ITEMS_PER_PAGE` | 10 |
| `REPORT_TYPES` | harian/bulanan |

---

## Environment Variables

| Variabel | Default | Deskripsi |
|----------|---------|-----------|
| `VITE_API_BASE_URL` | `/api/v1` (proxy) / `http://localhost:5000/api/v1` | Base URL API |
| `VITE_SOCKET_URL` | empty (same origin) / `http://localhost:5000` | URL Socket.IO |

---

## Lanjutkan Membaca

- [Overview](overview.md)
- [REST API](api.md)
- [Socket.IO / Real-Time](socketio.md)
- [Setup](setup.md)
- [Testing](testing.md)
