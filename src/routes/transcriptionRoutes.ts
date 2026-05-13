import { Router } from 'express';
import { transcribeAudio } from '../controllers/transcriptionController.js';
import { audioUpload } from '../middleware/upload.js';

const router = Router();

router.post('/', audioUpload.single('audio'), transcribeAudio);

export default router;
