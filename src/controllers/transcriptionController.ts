import type { Request, Response } from 'express';
import { parseProviderList } from '../services/transcription/index.js';
import { transcribeAudioFile } from '../services/transcriptionService.js';

export async function transcribeAudio(req: Request, res: Response) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'audio file is required.' });
    }

    const providers = parseProviderList(req.body.providers || req.body.provider);
    const transcripts = await transcribeAudioFile(file.path, providers);

    res.json({
      fileName: file.originalname,
      storedFileName: file.filename,
      size: file.size,
      transcripts
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
