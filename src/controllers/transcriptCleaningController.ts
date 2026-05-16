import type { Request, Response } from 'express';
import { cleanTranscript } from '../services/transcriptCleaningService.js';

export async function cleanTranscriptText(req: Request, res: Response) {
  try {
    const { transcriptText, keepParagraphs } = req.body;
    if (!transcriptText || typeof transcriptText !== 'string') {
      return res.status(400).json({ error: 'transcriptText is required.' });
    }

    const result = await cleanTranscript({
      transcriptText,
      keepParagraphs: keepParagraphs !== false
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
