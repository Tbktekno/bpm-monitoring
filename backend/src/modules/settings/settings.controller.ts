// =============================================================================
// Settings Controller — Key-Value CRUD, Profile, Password
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';
import { ValidationError, UnauthorizedError, NotFoundError } from '../../shared/app-error';
import { logger } from '../../server/middleware/request-logger';

// Valid setting keys
const VALID_KEYS = [
  'min_bpm',
  'max_bpm',
  'min_spo2',
  'max_spo2',
  'alert_bpm_high',
  'alert_bpm_low',
  'alert_spo2_low',
  'monitoring_interval',
  'auto_session_timeout',
];

/**
 * GET /api/v1/settings
 * Returns all settings as key-value pairs.
 */
export async function getSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await prisma.setting.findMany({
      orderBy: { key: 'asc' },
    });

    // Convert to key-value map for convenience
    const settingsMap: Record<string, string> = {};
    const settingsArray = settings.map((s) => {
      settingsMap[s.key] = s.value;
      return {
        id: s.id,
        key: s.key,
        value: s.value,
        description: s.description,
        updatedAt: s.updatedAt,
      };
    });

    res.json({
      success: true,
      data: {
        items: settingsArray,
        map: settingsMap,
      },
      message: 'Settings retrieved',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/settings
 * Updates settings. Accepts an object of key-value pairs.
 */
export async function updateSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const updates = req.body;

    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      throw new ValidationError('Request body must be an object of key-value pairs');
    }

    const errors: Record<string, string> = {};
    const updated: Array<{ key: string; oldValue: string; newValue: string }> = [];

    for (const [key, value] of Object.entries(updates)) {
      // Validate key
      if (!VALID_KEYS.includes(key) && !key.startsWith('custom_')) {
        errors[key] = `Unknown setting key. Valid keys: ${VALID_KEYS.join(', ')}`;
        continue;
      }

      // Validate value
      if (typeof value !== 'string') {
        errors[key] = 'Value must be a string';
        continue;
      }

      // Numeric validation for known numeric settings
      if (['min_bpm', 'max_bpm', 'min_spo2', 'max_spo2', 'alert_bpm_high', 'alert_bpm_low', 'alert_spo2_low', 'monitoring_interval', 'auto_session_timeout'].includes(key)) {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 0) {
          errors[key] = 'Value must be a positive number';
          continue;
        }
        if (key.startsWith('min_') && key.endsWith('bpm') && (num < 30 || num > 200)) {
          errors[key] = 'BPM threshold must be between 30 and 200';
          continue;
        }
        if (key.startsWith('max_') && key.endsWith('bpm') && (num < 30 || num > 250)) {
          errors[key] = 'BPM threshold must be between 30 and 250';
          continue;
        }
        if (key.includes('spo2') && (num < 50 || num > 100)) {
          errors[key] = 'SpO₂ threshold must be between 50 and 100';
          continue;
        }
      }

      // Validate min_bpm < max_bpm
      if (key === 'min_bpm' && updates['max_bpm']) {
        const maxVal = parseInt(updates['max_bpm'] as string, 10);
        if (!isNaN(maxVal) && parseInt(value, 10) >= maxVal) {
          errors[key] = 'min_bpm must be less than max_bpm';
          continue;
        }
      }
      if (key === 'max_bpm' && updates['min_bpm']) {
        const minVal = parseInt(updates['min_bpm'] as string, 10);
        if (!isNaN(minVal) && parseInt(value, 10) <= minVal) {
          errors[key] = 'max_bpm must be greater than min_bpm';
          continue;
        }
      }
      if (key === 'min_spo2' && updates['max_spo2']) {
        const maxVal = parseInt(updates['max_spo2'] as string, 10);
        if (!isNaN(maxVal) && parseInt(value, 10) >= maxVal) {
          errors[key] = 'min_spo2 must be less than max_spo2';
          continue;
        }
      }
      if (key === 'max_spo2' && updates['min_spo2']) {
        const minVal = parseInt(updates['min_spo2'] as string, 10);
        if (!isNaN(minVal) && parseInt(value, 10) <= minVal) {
          errors[key] = 'max_spo2 must be greater than min_spo2';
          continue;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError('Settings validation failed', errors);
    }

    // Apply updates
    for (const [key, value] of Object.entries(updates)) {
      if (!VALID_KEYS.includes(key) && !key.startsWith('custom_')) continue;
      if (typeof value !== 'string') continue;

      const existing = await prisma.setting.findUnique({ where: { key } });

      if (existing) {
        await prisma.setting.update({
          where: { key },
          data: { value },
        });
        updated.push({ key, oldValue: existing.value, newValue: value });
      } else {
        await prisma.setting.create({
          data: { key, value, description: `Custom setting: ${key}` },
        });
        updated.push({ key, oldValue: '', newValue: value });
      }
    }

    // Audit log
    if (req.admin) {
      await prisma.auditLog.create({
        data: {
          adminId: req.admin.id,
          action: 'UPDATE',
          details: `Updated ${updated.length} settings: ${updated.map((u) => `${u.key}: ${u.oldValue} → ${u.newValue}`).join(', ')}`,
          ipAddress: req.ip || req.socket.remoteAddress || undefined,
        },
      });
    }

    logger.info(`Settings updated: ${updated.length} keys`);

    res.json({
      success: true,
      data: {
        updated: updated.length,
        changes: updated,
      },
      message: `${updated.length} setting(s) updated successfully`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/settings/profile
 * Updates admin name and email.
 */
export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email } = req.body;
    const adminId = req.admin?.id;

    if (!adminId) {
      throw new UnauthorizedError('Not authenticated');
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('Name is required');
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw new ValidationError('Valid email is required');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check email uniqueness (exclude current admin)
    const existing = await prisma.admin.findFirst({
      where: { email: normalizedEmail, id: { not: adminId } },
    });
    if (existing) {
      throw new ValidationError('Email already in use by another admin');
    }

    const updated = await prisma.admin.update({
      where: { id: adminId },
      data: { name: name.trim(), email: normalizedEmail },
      select: { id: true, name: true, email: true },
    });

    await prisma.auditLog.create({
      data: {
        adminId,
        action: 'UPDATE',
        details: `Profile updated: name="${updated.name}", email="${updated.email}"`,
        ipAddress: req.ip || req.socket.remoteAddress || undefined,
      },
    });

    logger.info(`Profile updated: adminId=${adminId}`);

    res.json({
      success: true,
      data: {
        id: updated.id,
        adminName: updated.name,
        adminEmail: updated.email,
      },
      message: 'Profile updated successfully',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/settings/thresholds
 * Updates BPM and SpO₂ threshold settings.
 */
export async function updateThresholds(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { minBpm, maxBpm, minSpo2, maxSpo2 } = req.body;
    const adminId = req.admin?.id;

    if (!adminId) {
      throw new UnauthorizedError('Not authenticated');
    }

    // Validate and build updates
    const updates: Array<{ key: string; value: string }> = [];

    if (minBpm !== undefined) {
      const val = parseInt(String(minBpm), 10);
      if (isNaN(val) || val < 30 || val > 200) throw new ValidationError('minBpm must be between 30 and 200');
      updates.push({ key: 'min_bpm', value: String(val) });
    }
    if (maxBpm !== undefined) {
      const val = parseInt(String(maxBpm), 10);
      if (isNaN(val) || val < 30 || val > 250) throw new ValidationError('maxBpm must be between 30 and 250');
      updates.push({ key: 'max_bpm', value: String(val) });
    }
    if (minSpo2 !== undefined) {
      const val = parseInt(String(minSpo2), 10);
      if (isNaN(val) || val < 50 || val > 100) throw new ValidationError('minSpo2 must be between 50 and 100');
      updates.push({ key: 'min_spo2', value: String(val) });
    }
    if (maxSpo2 !== undefined) {
      const val = parseInt(String(maxSpo2), 10);
      if (isNaN(val) || val < 50 || val > 100) throw new ValidationError('maxSpo2 must be between 50 and 100');
      updates.push({ key: 'max_spo2', value: String(val) });
    }

    // Validate min < max
    const getValue = (key: string): number | undefined => {
      const update = updates.find((u) => u.key === key);
      return update ? parseInt(update.value, 10) : undefined;
    };
    const mb = getValue('min_bpm') ?? NaN;
    const Mb = getValue('max_bpm') ?? NaN;
    const ms = getValue('min_spo2') ?? NaN;
    const Ms = getValue('max_spo2') ?? NaN;
    if (!isNaN(mb) && !isNaN(Mb) && mb >= Mb) throw new ValidationError('min_bpm must be less than max_bpm');
    if (!isNaN(ms) && !isNaN(Ms) && ms >= Ms) throw new ValidationError('min_spo2 must be less than max_spo2');

    // Apply updates
    const changed: Array<{ key: string; oldValue: string; newValue: string }> = [];
    for (const { key, value } of updates) {
      const existing = await prisma.setting.findUnique({ where: { key } });
      if (existing) {
        await prisma.setting.update({ where: { key }, data: { value } });
        changed.push({ key, oldValue: existing.value, newValue: value });
      } else {
        await prisma.setting.create({ data: { key, value, description: `Threshold: ${key}` } });
        changed.push({ key, oldValue: '', newValue: value });
      }
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        adminId,
        action: 'UPDATE',
        details: `Thresholds updated: ${changed.map((c) => `${c.key}: ${c.oldValue} → ${c.newValue}`).join(', ')}`,
        ipAddress: req.ip || req.socket.remoteAddress || undefined,
      },
    });

    logger.info(`Thresholds updated: adminId=${adminId}`);

    // Build response (get current values)
    const currentSettings = await prisma.setting.findMany({
      where: { key: { in: ['min_bpm', 'max_bpm', 'min_spo2', 'max_spo2'] } },
    });
    const map: Record<string, string> = {};
    for (const s of currentSettings) map[s.key] = s.value;

    res.json({
      success: true,
      data: {
        id: adminId,
        adminName: req.admin?.name || '',
        adminEmail: req.admin?.email || '',
        minBpm: parseInt(map['min_bpm'] || '60', 10),
        maxBpm: parseInt(map['max_bpm'] || '100', 10),
        minSpo2: parseInt(map['min_spo2'] || '95', 10),
        maxSpo2: parseInt(map['max_spo2'] || '100', 10),
      },
      message: `${changed.length} threshold(s) updated successfully`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/v1/settings/password
 * Changes the admin's password.
 */
export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const adminId = req.admin?.id;

    if (!adminId) {
      throw new UnauthorizedError('Not authenticated');
    }

    // Validate input
    if (!currentPassword || typeof currentPassword !== 'string') {
      throw new ValidationError('Current password is required');
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      throw new ValidationError('New password must be at least 6 characters');
    }
    if (newPassword !== confirmPassword) {
      throw new ValidationError('Passwords do not match');
    }

    // Verify current password
    const admin = await prisma.admin.findUnique({ where: { id: adminId } });
    if (!admin) {
      throw new UnauthorizedError('Admin not found');
    }

    const isValid = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!isValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Hash and update
    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.admin.update({
      where: { id: adminId },
      data: { passwordHash: newHash },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        adminId,
        action: 'UPDATE',
        details: 'Password changed',
        ipAddress: req.ip || req.socket.remoteAddress || undefined,
      },
    });

    logger.info(`Password changed: adminId=${adminId}`);

    res.json({
      success: true,
      data: null,
      message: 'Password changed successfully',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/settings/data
 * Menghapus SEMUA data monitoring (readings, sessions, audit logs)
 * TANPA menghapus device (Esp32Device) dan akun admin.
 */
export async function clearMonitoringData(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Hanya delete dari tabel yang berisi DATA (bukan konfigurasi)
    const deletedReadings = await prisma.reading.deleteMany({});
    const deletedSessions = await prisma.monitoringSession.deleteMany({});
    const deletedAuditLogs = await prisma.auditLog.deleteMany({});

    logger.info(`[CLEAR] Data dihapus: ${deletedReadings.count} readings, ${deletedSessions.count} sessions, ${deletedAuditLogs.count} audit logs`);

    res.json({
      success: true,
      data: {
        deletedReadings: deletedReadings.count,
        deletedSessions: deletedSessions.count,
        deletedAuditLogs: deletedAuditLogs.count,
        keptDevices: await prisma.esp32Device.count(),
        keptAdmins: await prisma.admin.count(),
      },
      message: `Berhasil menghapus ${deletedReadings.count} data monitoring, ${deletedSessions.count} sesi, ${deletedAuditLogs.count} log. Device & Admin tetap aman.`,
    });
  } catch (err) {
    next(err);
  }
}
