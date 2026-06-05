import { Router } from 'express';
import {
  generateQuestionMedia,
  generateQuestionMediaBatch,
  getQuestionMedia,
  putQuestionMedia
} from '../controllers/questionMediaController.js';

const router = Router();

router.post('/media/generate-batch', generateQuestionMediaBatch);
router.get('/:id/media', getQuestionMedia);
router.put('/:id/media', putQuestionMedia);
router.post('/:id/media/generate', generateQuestionMedia);

export default router;
