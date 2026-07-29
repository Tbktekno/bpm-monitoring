// =============================================================================
// Patients Routes
// =============================================================================

import { Router } from 'express';
import {
  listPatients,
  getPatient,
  createPatient,
  updatePatient,
  deletePatient,
} from './patients.controller';
import { authenticate } from '../../server/middleware/auth';

const router = Router();

// All patient routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/patients
 * Query: page, limit, search
 */
router.get('/', listPatients);

/**
 * GET /api/v1/patients/:id
 */
router.get('/:id', getPatient);

/**
 * POST /api/v1/patients
 * Body: { name, nik?, gender, birthDate, address?, phone?, bloodType?, height?, weight?, medicalHistory?, doctorNote? }
 */
router.post('/', createPatient);

/**
 * PUT /api/v1/patients/:id
 * Body: (partial patient fields)
 */
router.put('/:id', updatePatient);

/**
 * DELETE /api/v1/patients/:id
 */
router.delete('/:id', deletePatient);

export default router;
