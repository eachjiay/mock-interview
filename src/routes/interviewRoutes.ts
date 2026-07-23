import { Router } from 'express';
import { analyze, createInterview, getInterview, processInterviewUpload, segmentInterview, transcribe, uploadAudio } from '../controllers/interviewController.js';
import { audioUpload } from '../middleware/upload.js';
import { config } from '../config.js';
import { createRateLimiter } from '../middleware/security.js';

const router = Router();
const paidRateLimit = createRateLimiter({
  label: 'paid-interview',
  max: config.paidApiRateLimitMax
});

router.post('/', createInterview);
router.post('/process', paidRateLimit, audioUpload.single('audio'), processInterviewUpload);
router.post('/:id/audio', audioUpload.single('audio'), uploadAudio);
router.post('/:id/transcribe', paidRateLimit, transcribe);
router.post('/:id/analyze', paidRateLimit, analyze);
router.post('/:id/segment', segmentInterview);
router.get('/:id', getInterview);

export default router;
