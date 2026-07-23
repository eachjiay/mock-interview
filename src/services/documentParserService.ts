import fs from 'node:fs/promises';
import path from 'node:path';
import mammoth from 'mammoth';
import type { QuestionRecord } from '../types.js';

const questionLinePattern = /[？?]$/;
const promptLeadPattern = /^(问题|题目|面试题|Q|Question)\s*[:：]/i;
const answerLeadPattern = /^(答|回答|参考答案|解析|说明)[:：]\s*/;
const metaPromptPattern = /(辅助记忆|流程记忆方式|备注|思路总结|贡献如下|总结如下)/;
const questionCuePattern = /(怎么|如何|为什么|什么|说说|讲讲|介绍|区别|原理|流程|设计|实现|怎么办|是否|能不能|有没有|哪些|几种|多少|吗|呢)/;
const sectionHeadingPattern = /^(Java|JVM|MySQL|Mysql|Redis|Spring|SpringBoot|Spring Cloud|MQ|RabbitMQ|RocketMQ|Kafka|Linux|Nginx|Docker|Kubernetes|K8s|Netty|ElasticSearch|Elasticsearch|ES|操作系统|计算机网络|数据库|多线程|并发|分布式|微服务|项目|算法|数据结构|设计模式|场景题)$/i;
const memoryBulletPattern = /^[0-9一二三四五六七八九十]+[.、)]\s*\S.{0,80}$/;

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
  let skippingMemoryBlock = false;

  const pushCurrent = () => {
    const referenceAnswer = cleanReferenceAnswer(answerLines);
    if (!currentPrompt || !referenceAnswer) {
      return;
    }
    questions.push({
      prompt: currentPrompt.trim(),
      referenceAnswer,
      keywords: extractKeywords(referenceAnswer)
    });
  };

  for (const line of lines) {
    const looksLikeQuestion = isQuestionLine(line);
    if (looksLikeQuestion) {
      pushCurrent();
      currentPrompt = normalizePrompt(line);
      answerLines = [];
      skippingMemoryBlock = false;
      continue;
    }

    if (!currentPrompt) {
      continue;
    }

    if (isMetaLine(line)) {
      skippingMemoryBlock = true;
      continue;
    }

    if (skippingMemoryBlock) {
      if (isLikelyMemoryBullet(line)) {
        continue;
      }
      skippingMemoryBlock = false;
    }

    if (isSectionHeading(line)) {
      continue;
    }

    const cleanedLine = line.replace(answerLeadPattern, '').trim();
    if (!cleanedLine) {
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
  if (isMetaLine(trimmed) || isSectionHeading(trimmed)) {
    return false;
  }
  if (promptLeadPattern.test(trimmed)) {
    return true;
  }
  if (questionLinePattern.test(trimmed)) {
    return true;
  }
  if (trimmed.length <= 4 || trimmed.length > 80) {
    return false;
  }
  return questionCuePattern.test(trimmed);
}

function normalizePrompt(value: string) {
  return value
    .replace(promptLeadPattern, '')
    .replace(/^[0-9一二三四五六七八九十]+[.、)\s]*/, '')
    .trim();
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

function cleanReferenceAnswer(lines: string[]) {
  const cleaned: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || isMetaLine(trimmed) || isSectionHeading(trimmed)) {
      continue;
    }
    cleaned.push(trimmed);
  }

  while (cleaned.length && (isSectionHeading(cleaned[cleaned.length - 1] || '') || isMetaLine(cleaned[cleaned.length - 1] || ''))) {
    cleaned.pop();
  }

  return cleaned.join('\n').trim();
}

function isMetaLine(line: string) {
  return metaPromptPattern.test(line.trim());
}

function isSectionHeading(line: string) {
  const trimmed = line.trim().replace(/[：:]\s*$/, '');
  return sectionHeadingPattern.test(trimmed);
}

function isLikelyMemoryBullet(line: string) {
  const trimmed = line.trim();
  return memoryBulletPattern.test(trimmed) || trimmed.length <= 30;
}
