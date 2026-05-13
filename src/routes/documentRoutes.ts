import { Router } from 'express';
import { getDocument, getRandomQuestions, importDocumentByLocalPath, listDocuments, uploadDocument } from '../controllers/documentController.js';
import { documentUpload } from '../middleware/upload.js';

const router = Router();

router.get('/', listDocuments);
router.get('/:id/questions/random', getRandomQuestions);
router.get('/:id', getDocument);
router.post('/upload', documentUpload.single('document'), uploadDocument);
router.post('/import-local', importDocumentByLocalPath);

export default router;
