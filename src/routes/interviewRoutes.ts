import { Router } from 'express';
import { analyze, createInterview, getInterview, processInterviewUpload, segmentInterview, transcribe, uploadAudio } from '../controllers/interviewController.js';
import { audioUpload } from '../middleware/upload.js';

const router = Router();

router.post('/', createInterview);
router.post('/process', audioUpload.single('audio'), processInterviewUpload);
router.post('/:id/audio', audioUpload.single('audio'), uploadAudio);
router.post('/:id/transcribe', transcribe);
router.post('/:id/analyze', analyze);
router.post('/:id/segment', segmentInterview);
router.get('/:id', getInterview);

export default router;
