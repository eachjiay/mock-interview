import type { Request, Response } from 'express';
import { segmentTranscript } from '../services/transcriptSegmentationService.js';

export async function segmentTranscriptText(req: Request, res: Response) {
  try {
    const { transcriptText } = req.body;
    if (!transcriptText || typeof transcriptText !== 'string') {
      return res.status(400).json({ error: 'transcriptText is required.' });
    }

    const result = segmentTranscript({ transcriptText });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
