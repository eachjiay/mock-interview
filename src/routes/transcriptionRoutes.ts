import { Router } from 'express';
import { cleanTranscriptText } from '../controllers/transcriptCleaningController.js';
import { segmentTranscriptText } from '../controllers/transcriptSegmentationController.js';
import { transcribeAudio } from '../controllers/transcriptionController.js';
import { audioUpload } from '../middleware/upload.js';

const router = Router();

router.post('/', audioUpload.single('audio'), transcribeAudio);
router.post('/clean', cleanTranscriptText);
router.post('/segment', segmentTranscriptText);

export default router;
