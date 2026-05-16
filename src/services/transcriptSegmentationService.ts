import type { SpeakerGuess, TranscriptQaPair, TranscriptSegment, TranscriptSegmentResult } from '../types.js';

interface SegmentTranscriptInput {
  transcriptText: string;
}

const sentenceSplitter = /(?<=[。！？!?])/;
const explicitInterviewerMarkers = [
  '面试官',
  '我们今天',
  '请你',
  '你可以先',
  '你先',
  '说说',
  '讲一讲',
  '介绍一下',
  '我们先看',
  '那我们先',
  '你提到',
  '为什么',
  '怎么实现',
  '如何实现',
  '如果',
  '还有什么',
  '有没有'
];

const explicitCandidateMarkers = [
  '我叫',
  '我在',
  '我会',
  '我做过',
  '我主要',
  '我负责',
  '我使用了',
  '我当时',
  '我的理解',
  '我认为',
  '我这边',
  '我的项目',
  '我觉得'
];

const fillerWords = ['嗯', '啊', '呃', '噢', '就是', '然后', '那个'];

export function segmentTranscript(input: SegmentTranscriptInput): TranscriptSegmentResult {
  const normalizedText = normalizeTranscript(input.transcriptText);
  const sentences = normalizedText
    .split(sentenceSplitter)
    .map((item) => item.trim())
    .filter(Boolean);

  const rawSegments = sentences.map((sentence) => detectSpeaker(sentence));
  const mergedSegments = mergeNeighborSegments(rawSegments);
  const qaPairs = buildQaPairs(mergedSegments);

  return {
    segments: mergedSegments,
    qaPairs,
    notes: buildNotes(mergedSegments, qaPairs)
  };
}

function normalizeTranscript(text: string) {
  let normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const filler of fillerWords) {
    const repeated = new RegExp(`(?:${escapeRegExp(filler)}[，。,！!？?、 ]*){2,}`, 'g');
    normalized = normalized.replace(repeated, `${filler} `);
  }

  return normalized;
}

function detectSpeaker(text: string): TranscriptSegment {
  const reasons: string[] = [];
  const interviewerScore = scoreAgainst(text, explicitInterviewerMarkers, reasons, 'interviewer');
  const candidateScore = scoreAgainst(text, explicitCandidateMarkers, reasons, 'candidate');

  const hasQuestionEnding = /[？?]$/.test(text);
  if (hasQuestionEnding) {
    reasons.push('question-mark');
  }

  let speakerGuess: SpeakerGuess = 'unknown';
  if (interviewerScore > candidateScore || (hasQuestionEnding && interviewerScore === candidateScore)) {
    speakerGuess = 'interviewer';
  } else if (candidateScore > interviewerScore) {
    speakerGuess = 'candidate';
  }

  return {
    speakerGuess,
    text,
    reasons
  };
}

function scoreAgainst(text: string, markers: string[], reasons: string[], label: 'interviewer' | 'candidate') {
  let score = 0;
  for (const marker of markers) {
    if (text.includes(marker)) {
      score += 1;
      reasons.push(`${label}:${marker}`);
    }
  }
  return score;
}

function mergeNeighborSegments(segments: TranscriptSegment[]) {
  const merged: TranscriptSegment[] = [];
  for (const segment of segments) {
    const last = merged.at(-1);
    if (last && shouldMerge(last, segment)) {
      last.text = `${last.text} ${segment.text}`.trim();
      last.reasons = dedupe([...last.reasons, ...segment.reasons]);
      if (last.speakerGuess === 'unknown') {
        last.speakerGuess = segment.speakerGuess;
      }
      continue;
    }
    merged.push({
      speakerGuess: segment.speakerGuess,
      text: segment.text,
      reasons: [...segment.reasons]
    });
  }

  for (let index = 0; index < merged.length; index += 1) {
    const current = merged[index];
    if (!current || current.speakerGuess !== 'unknown') {
      continue;
    }
    const previous = merged[index - 1];
    const next = merged[index + 1];
    if (previous && next && previous.speakerGuess === next.speakerGuess) {
      current.speakerGuess = previous.speakerGuess;
      current.reasons.push('inherited-neighbor-speaker');
    } else if (previous && previous.speakerGuess !== 'unknown') {
      current.speakerGuess = previous.speakerGuess;
      current.reasons.push('inherited-previous-speaker');
    }
  }

  return merged;
}

function shouldMerge(previous: TranscriptSegment, current: TranscriptSegment) {
  if (previous.speakerGuess === current.speakerGuess) {
    return true;
  }
  if (current.speakerGuess === 'unknown' || previous.speakerGuess === 'unknown') {
    return previous.text.length < 40 || current.text.length < 30;
  }
  return false;
}

function buildQaPairs(segments: TranscriptSegment[]): TranscriptQaPair[] {
  const pairs: TranscriptQaPair[] = [];
  let pendingQuestion: TranscriptSegment | null = null;
  let pendingAnswerParts: TranscriptSegment[] = [];

  for (const segment of segments) {
    if (segment.speakerGuess === 'interviewer' && /[？?]$/.test(segment.text)) {
      flushPair();
      pendingQuestion = segment;
      pendingAnswerParts = [];
      continue;
    }

    if (pendingQuestion) {
      pendingAnswerParts.push(segment);
    }
  }

  flushPair();
  return pairs;

  function flushPair() {
    if (!pendingQuestion) {
      return;
    }
    const answerSegments = pendingAnswerParts.filter((segment) => segment.text.trim());
    pairs.push({
      question: pendingQuestion.text,
      answer: answerSegments.map((segment) => segment.text).join(' ').trim(),
      questionSpeaker: pendingQuestion.speakerGuess,
      answerSpeaker: inferAnswerSpeaker(answerSegments)
    });
    pendingQuestion = null;
    pendingAnswerParts = [];
  }
}

function inferAnswerSpeaker(segments: TranscriptSegment[]): SpeakerGuess {
  const candidateCount = segments.filter((item) => item.speakerGuess === 'candidate').length;
  const interviewerCount = segments.filter((item) => item.speakerGuess === 'interviewer').length;
  if (candidateCount > interviewerCount) {
    return 'candidate';
  }
  if (interviewerCount > candidateCount) {
    return 'interviewer';
  }
  return segments[0]?.speakerGuess || 'unknown';
}

function buildNotes(segments: TranscriptSegment[], qaPairs: TranscriptQaPair[]) {
  const notes: string[] = [];
  const unknownCount = segments.filter((segment) => segment.speakerGuess === 'unknown').length;
  if (unknownCount > 0) {
    notes.push(`There are ${unknownCount} segments with uncertain speaker guesses.`);
  }
  notes.push(`Generated ${qaPairs.length} question-answer pairs.`);
  if (qaPairs.some((pair) => !pair.answer)) {
    notes.push('Some question-answer pairs do not have a captured answer segment.');
  }
  return notes;
}

function dedupe(values: string[]) {
  return [...new Set(values)];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
