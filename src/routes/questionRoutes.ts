import { Router } from 'express';
import {
  generateQuestionMedia,
  generateQuestionMediaBatch,
  getQuestionMediaBatchStatus,
  getQuestionMedia,
  putQuestionMedia
} from '../controllers/questionMediaController.js';
import { requireAdminToken } from '../middleware/security.js';

const router = Router();

router.get('/media/generate-batch/status', requireAdminToken, getQuestionMediaBatchStatus);
router.post('/media/generate-batch', requireAdminToken, generateQuestionMediaBatch);
router.get('/:id/media', getQuestionMedia);
router.put('/:id/media', requireAdminToken, putQuestionMedia);
router.post('/:id/media/generate', requireAdminToken, generateQuestionMedia);

export default router;
