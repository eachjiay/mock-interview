import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import type { QuestionRecord } from '../types.js';

const questionLinePattern = /[？?：:]$/;
const answerLeadPattern = /^(答|回答|参考答案|解析|说明)[:：]\s*/;
const metaPromptPattern = /(辅助记忆|流程记忆方式|备注|思路总结|贡献如下|总结如下)/;

export async function parseDocumentText(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return normalizeText(result.value);
  }
  const content = await fs.readFile(filePath, 'utf8');
  return normalizeText(content);
}

export function extractQuestionsFromText(text: string): Array<Omit<QuestionRecord, 'id' | 'createdAt' | 'documentId'>> {
  const lines = normalizeText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const questions: Array<Omit<QuestionRecord, 'id' | 'createdAt' | 'documentId'>> = [];
  let currentPrompt = '';
  let answerLines: string[] = [];

  const pushCurrent = () => {
    if (!currentPrompt || answerLines.length === 0) {
      return;
    }
    const referenceAnswer = answerLines.join('\n').trim();
    questions.push({
      prompt: currentPrompt.trim(),
      referenceAnswer,
      keywords: extractKeywords(referenceAnswer)
    });
  };

  for (const line of lines) {
    const cleanedLine = line.replace(answerLeadPattern, '').trim();
    const looksLikeQuestion = isQuestionLine(line);
    if (looksLikeQuestion) {
      pushCurrent();
      currentPrompt = normalizePrompt(line);
      answerLines = [];
      continue;
    }

    if (!currentPrompt) {
      continue;
    }

    answerLines.push(cleanedLine);
  }

  pushCurrent();

  if (questions.length > 0) {
    return questions;
  }

  return fallbackParagraphQuestions(lines);
}

function fallbackParagraphQuestions(lines: string[]) {
  const results: Array<Omit<QuestionRecord, 'id' | 'createdAt' | 'documentId'>> = [];
  for (let index = 0; index < lines.length - 1; index += 2) {
    const prompt = lines[index] || '';
    const answer = lines[index + 1] || '';
    if (isQuestionLine(prompt) && answer) {
      results.push({
        prompt: normalizePrompt(prompt),
        referenceAnswer: answer.trim(),
        keywords: extractKeywords(answer)
      });
    }
  }
  return results;
}

function isQuestionLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (metaPromptPattern.test(trimmed)) {
    return false;
  }
  if (trimmed.length <= 4 && !questionLinePattern.test(trimmed)) {
    return false;
  }
  return questionLinePattern.test(trimmed) || trimmed.includes('怎么') || trimmed.includes('如何') || trimmed.includes('为什么') || trimmed.includes('什么') || trimmed.includes('说说');
}

function normalizePrompt(value: string) {
  return value.replace(/^[0-9一二三四五六七八九十]+[.、)\s]*/, '').trim();
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u0007/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractKeywords(text: string) {
  return text
    .replace(/[，。、“”‘’；：？！,.!?:;\-()（）]/g, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 8);
}
