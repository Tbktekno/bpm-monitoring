// =============================================================================
// Devices Controller — CRUD + API Key Generation
// =============================================================================
// API Key Flow:
//   1. Admin creates device via POST /api/v1/devices
//   2. Backend generates random 32-byte key → SHA-256 hash → store hash
//   3. Backend returns raw key ONCE in response (admin must save it)
//   4. ESP8266 sends raw key with every reading
//   5. Socket.IO handler hashes incoming key → compares with stored hash
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../../config/database';
import { NotFoundError, ValidationError, ConflictError } from '../../shared/app-error';
import { logger } from '../../server/middleware/request-logger';

// ─── Constants ────────────────────────────────────────────────────────────────

const API_KEY_BYTES = 32;           // 256-bit key → 64 hex chars
const API_KEY_MIN_LENGTH = 16;
const API_KEY_MAX_LENGTH = 128;
const API_KEY_PREFIX = 'bpm-';      // Biar gampang dibedakan
const SEARCHABLE_FIELDS = ['deviceId', 'label'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure random API key.
 * Format: "bpm-" + 48 random hex chars = 52 chars total
 */
function generateApiKey(): string {
  const randomHex = crypto.randomBytes(API_KEY_BYTES).toString('hex');
  return `${API_KEY_PREFIX}${randomHex}`;
}

/**
 * SHA-256 hash of the raw API key.
 */
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey, 'utf8').digest('hex');
}

/**
 * Validate input for create/update.
 */
function validateInput(body: any, isUpdate: boolean = false): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!isUpdate || body.deviceId !== undefined) {
    if (!body.deviceId || typeof body.deviceId !== 'string') {
      errors.deviceId = 'Device ID wajib diisi';
    } else if (body.deviceId.trim().length < 1) {
      errors.deviceId = 'Device ID tidak boleh kosong';
    } else if (body.deviceId.trim().length > 50) {
      errors.deviceId = 'Device ID maksimal 50 karakter';
    }
  }

  if (body.label !== undefined && body.label !== null) {
    if (typeof body.label !== 'string') {
      errors.label = 'Label harus berupa teks';
    } else if (body.label.trim().length > 100) {
      errors.label = 'Label maksimal 100 karakter';
    }
  }

  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    errors.isActive = 'isActive harus boolean (true/false)';
  }

  return errors;
}

/**
 * Build Prisma `where` filter untuk search.
 */
function buildSearchFilter(search?: string): any {
  if (!search || search.trim().length === 0) return {};
  const term = search.trim();
  return {
    OR: [
      { deviceId: { contains: term } },
      { label: { contains: term } },
    ],
  };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/devices
 */
export async function listDevices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
    const skip = (page - 1) * limit;
    const search = String(req.query.search ?? '');

    const where = buildSearchFilter(search);

    const [items, total] = await Promise.all([
      prisma.esp32Device.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          deviceId: true,
          label: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          // Jangan sertakan apiKey (hash) — tidak perlu ditampilkan
        },
      }),
      prisma.esp32Device.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      message: total > 0 ? `${total} device ditemukan` : 'Belum ada device terdaftar',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/devices/:id
 */
export async function getDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) throw new ValidationError('ID device tidak valid');

    const device = await prisma.esp32Device.findUnique({
      where: { id },
      select: {
        id: true,
        deviceId: true,
        label: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!device) throw new NotFoundError('Device');

    res.json({ success: true, data: device, message: 'Detail device' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/devices
 * 
 * Membuat device baru + generate API key.
 * API key ditampilkan SEKALI SAJA di response.
 */
export async function createDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const errors = validateInput(req.body);
    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Validasi gagal', errors);
    }

    const { deviceId, label, isActive } = req.body;

    // Cek duplikasi deviceId
    const existing = await prisma.esp32Device.findUnique({
      where: { deviceId: deviceId.trim() },
    });
    if (existing) {
      throw new ConflictError(`Device ID "${deviceId.trim()}" sudah terdaftar`);
    }

    // Generate API key
    const rawApiKey = generateApiKey();
    const hashedKey = hashApiKey(rawApiKey);

    // Simpan device dengan hashed key
    const device = await prisma.esp32Device.create({
      data: {
        deviceId: deviceId.trim(),
        apiKey: hashedKey,
        label: label?.trim() || null,
        isActive: isActive !== undefined ? isActive : true,
      },
      select: {
        id: true,
        deviceId: true,
        label: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Audit log
    if (req.admin) {
      await prisma.auditLog.create({
        data: {
          adminId: req.admin.id,
          action: 'CREATE',
          details: `Mendaftarkan device baru: ${deviceId.trim()}`,
          ipAddress: req.ip || req.socket.remoteAddress || undefined,
        },
      });
    }

    logger.info(`[DEVICES] Created: ${deviceId.trim()}`);

    // ⚠ KIRIM RAW API KEY — hanya sekali ini!
    res.status(201).json({
      success: true,
      data: {
        ...device,
        rawApiKey,       // <── INI YANG HARUS DISIMPAN ADMIN!
        warning: 'API Key ini hanya ditampilkan sekali. Simpan dengan aman!',
      },
      message: 'Device berhasil didaftarkan. Salin API Key sekarang!',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/devices/:id
 * 
 * Update device — tidak mengubah API key.
 * Untuk regenerate API key, harus delete + create baru.
 */
export async function updateDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) throw new ValidationError('ID device tidak valid');

    const existing = await prisma.esp32Device.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Device');

    const errors = validateInput(req.body, true);
    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Validasi gagal', errors);
    }

    const { deviceId, label, isActive } = req.body;
    const data: any = {};

    if (deviceId !== undefined) {
      const trimmedId = deviceId.trim();
      // Cek duplikasi (kecuali dirinya sendiri)
      const dup = await prisma.esp32Device.findFirst({
        where: { deviceId: trimmedId, NOT: { id } },
      });
      if (dup) throw new ConflictError(`Device ID "${trimmedId}" sudah digunakan`);
      data.deviceId = trimmedId;
    }

    if (label !== undefined) data.label = label?.trim() || null;
    if (isActive !== undefined) data.isActive = isActive;

    if (Object.keys(data).length === 0) {
      throw new ValidationError('Tidak ada data yang diubah');
    }

    const device = await prisma.esp32Device.update({
      where: { id },
      data,
      select: {
        id: true,
        deviceId: true,
        label: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (req.admin) {
      await prisma.auditLog.create({
        data: {
          adminId: req.admin.id,
          action: 'UPDATE',
          details: `Mengupdate device: ${device.deviceId}`,
          ipAddress: req.ip || req.socket.remoteAddress || undefined,
        },
      });
    }

    logger.info(`[DEVICES] Updated: ${device.deviceId}`);

    res.json({ success: true, data: device, message: 'Device berhasil diupdate' });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/devices/:id/toggle
 * 
 * Aktifkan / nonaktifkan device.
 */
export async function toggleDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) throw new ValidationError('ID device tidak valid');

    const existing = await prisma.esp32Device.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Device');

    const device = await prisma.esp32Device.update({
      where: { id },
      data: { isActive: !existing.isActive },
      select: {
        id: true,
        deviceId: true,
        label: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (req.admin) {
      await prisma.auditLog.create({
        data: {
          adminId: req.admin.id,
          action: 'UPDATE',
          details: `${device.isActive ? 'Mengaktifkan' : 'Menonaktifkan'} device: ${device.deviceId}`,
          ipAddress: req.ip || req.socket.remoteAddress || undefined,
        },
      });
    }

    logger.info(`[DEVICES] Toggled: ${device.deviceId} → ${device.isActive ? 'AKTIF' : 'NONAKTIF'}`);

    res.json({
      success: true,
      data: device,
      message: `Device ${device.isActive ? 'diaktifkan' : 'dinonaktifkan'}`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/devices/:id
 */
export async function deleteDevice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) throw new ValidationError('ID device tidak valid');

    const existing = await prisma.esp32Device.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Device');

    await prisma.esp32Device.delete({ where: { id } });

    if (req.admin) {
      await prisma.auditLog.create({
        data: {
          adminId: req.admin.id,
          action: 'DELETE',
          details: `Menghapus device: ${existing.deviceId}`,
          ipAddress: req.ip || req.socket.remoteAddress || undefined,
        },
      });
    }

    logger.info(`[DEVICES] Deleted: ${existing.deviceId}`);

    res.json({ success: true, data: null, message: 'Device berhasil dihapus' });
  } catch (err) {
    next(err);
  }
}
