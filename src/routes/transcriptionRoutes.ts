import { Router } from 'express';
import { cleanTranscriptText } from '../controllers/transcriptCleaningController.js';
import { segmentTranscriptText } from '../controllers/transcriptSegmentationController.js';
import { transcribeAudio } from '../controllers/transcriptionController.js';
import { audioUpload } from '../middleware/upload.js';
import { createRateLimiter, requireAdminToken } from '../middleware/security.js';
import { config } from '../config.js';

const router = Router();

const paidRateLimit = createRateLimiter({
  label: 'paid-transcription',
  max: config.paidApiRateLimitMax
});

router.post('/', requireAdminToken, paidRateLimit, audioUpload.single('audio'), transcribeAudio);
router.post('/clean', requireAdminToken, paidRateLimit, cleanTranscriptText);
router.post('/segment', segmentTranscriptText);

export default router;
