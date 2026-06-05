# Frontend API Examples

This file shows a practical frontend integration flow for `D:\mock-interview-backend`.

Assume the backend runs at:

```ts
const BASE_URL = "http://8.216.36.217:5050";
```

## 1. Import a document

### fetch

```ts
export async function uploadQuestionDocument(file: File, title?: string) {
  const formData = new FormData();
  formData.append("document", file);
  if (title) {
    formData.append("title", title);
  }

  const response = await fetch(`${BASE_URL}/api/documents/upload`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

### axios

```ts
import axios from "axios";

export async function uploadQuestionDocumentAxios(file: File, title?: string) {
  const formData = new FormData();
  formData.append("document", file);
  if (title) {
    formData.append("title", title);
  }

  const { data } = await axios.post(`${BASE_URL}/api/documents/upload`, formData);
  return data;
}
```

## 2. Import a local server-side document path

Use this only if the backend machine can already access the file path.

### fetch

```ts
export async function importLocalDocument(filePath: string, title?: string) {
  const response = await fetch(`${BASE_URL}/api/documents/import-local`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ filePath, title })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

## 3. Get imported documents

```ts
export async function getDocuments() {
  const response = await fetch(`${BASE_URL}/api/documents`);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}
```

## 4. Get random interview questions from one document

```ts
export async function getRandomQuestions(documentId: number, count = 3) {
  const response = await fetch(
    `${BASE_URL}/api/documents/${documentId}/questions/random?count=${count}`
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

Expected response shape:

```json
{
  "questions": [
    {
      "id": 12,
      "documentId": 1,
      "prompt": "Java中的集合有哪些？",
      "referenceAnswer": "......",
      "keywords": ["Collection", "Map"],
      "createdAt": "2026-05-13T12:00:00.000Z"
    }
  ]
}
```

## 5. Create an interview session from a document

If you want the backend to auto-pick one random question from a document:

```ts
export async function createInterviewFromDocument(documentId: number, candidateName?: string) {
  const response = await fetch(`${BASE_URL}/api/interviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      documentId,
      candidateName
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

If you already selected an exact question:

```ts
export async function createInterviewFromQuestion(questionId: number, candidateName?: string) {
  const response = await fetch(`${BASE_URL}/api/interviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      questionId,
      candidateName
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

## 6. Direct audio transcription without creating an interview

Useful when you only want `speech-to-text`.

### fetch

```ts
export async function transcribeAudio(file: File, providers: string[] = ["openai"]) {
  const formData = new FormData();
  formData.append("audio", file);
  formData.append("providers", providers.join(","));

  const response = await fetch(`${BASE_URL}/api/transcriptions`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

### axios

```ts
import axios from "axios";

export async function transcribeAudioAxios(file: File, providers: string[] = ["openai"]) {
  const formData = new FormData();
  formData.append("audio", file);
  formData.append("providers", providers.join(","));

  const { data } = await axios.post(`${BASE_URL}/api/transcriptions`, formData);
  return data;
}
```

Example response:

```json
{
  "fileName": "answer.mp3",
  "storedFileName": "1747152000000-answer.mp3",
  "size": 182930,
  "transcripts": [
    {
      "provider": "openai",
      "model": "gpt-4o-mini-transcribe",
      "text": "这是转写后的文本"
    }
  ]
}
```

The backend strips provider-specific `raw` payloads from this response so it can be sent straight to the frontend without carrying a huge debug object.

## 6.1 Clean raw transcript text

Useful when you want to turn raw ASR output into a cleaner version before showing it to the user or sending it into scoring.

```ts
export async function cleanTranscriptText(transcriptText: string, keepParagraphs = true) {
  const response = await fetch(`${BASE_URL}/api/transcriptions/clean`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      transcriptText,
      keepParagraphs
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

This response only includes:

- `cleanedText`
- `removedFillers`
- `notes`

## 6.2 Segment transcript into interviewer/candidate blocks

Useful when the uploaded audio contains both the interviewer and the candidate, and the frontend wants a readable conversation view.

```ts
export async function segmentTranscriptText(transcriptText: string) {
  const response = await fetch(`${BASE_URL}/api/transcriptions/segment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ transcriptText })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

Example response shape:

```json
{
  "segments": [
    {
      "speakerGuess": "interviewer",
      "text": "请你先做一个自我介绍？",
      "reasons": ["question-mark", "interviewer:请你"]
    },
    {
      "speakerGuess": "candidate",
      "text": "面试官你好，我叫张三，来自...",
      "reasons": ["candidate:我叫"]
    }
  ],
  "qaPairs": [
    {
      "question": "请你先做一个自我介绍？",
      "answer": "面试官你好，我叫张三，来自...",
      "questionSpeaker": "interviewer",
      "answerSpeaker": "candidate"
    }
  ],
  "notes": ["Generated 1 question-answer pairs."]
}
```

## 7. Full interview flow with separate steps

### Step A: create interview

```ts
const interview = await createInterviewFromQuestion(questionId, "Tom");
```

### Step B: upload audio

```ts
export async function uploadInterviewAudio(interviewId: number, file: File) {
  const formData = new FormData();
  formData.append("audio", file);

  const response = await fetch(`${BASE_URL}/api/interviews/${interviewId}/audio`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

### Step C: queue transcription

```ts
export async function transcribeInterview(interviewId: number, providers: string[] = ["openai"]) {
  const response = await fetch(`${BASE_URL}/api/interviews/${interviewId}/transcribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ providers })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

Recommended usage:

```ts
await transcribeInterview(interview.id, ["auto"]);
```

### Step D: run analysis

```ts
export async function analyzeInterview(interviewId: number, provider = "openai") {
  const response = await fetch(`${BASE_URL}/api/interviews/${interviewId}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ provider })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

If `provider` is `openai`, the backend now auto-cleans the latest transcript before scoring. That means the frontend flow can be:

- want to display a polished transcript: call `/api/transcriptions/clean`
- only want a score: call `/api/interviews/:id/analyze` directly

### Step D.1: segment the latest interview transcript

```ts
export async function segmentInterview(interviewId: number, provider?: string) {
  const response = await fetch(`${BASE_URL}/api/interviews/${interviewId}/segment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(provider ? { provider } : {})
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

### Step E: get interview detail

```ts
export async function getInterviewDetail(interviewId: number) {
  const response = await fetch(`${BASE_URL}/api/interviews/${interviewId}`);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}
```

### Step F: poll status

```ts
export async function pollInterviewUntilDone(interviewId: number) {
  while (true) {
    const detail = await getInterviewDetail(interviewId);
    const status = detail.interview.status;

    if (status === "analyzed" || status === "failed") {
      return detail;
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
```

## 8. One-shot interview processing

If the frontend wants one request from audio upload to task creation:

```ts
export async function processInterviewOnce(params: {
  audio: File;
  documentId?: number;
  questionId?: number;
  questionText?: string;
  referenceText?: string;
  candidateName?: string;
  notes?: string;
  providers?: string[];
}) {
  const formData = new FormData();
  formData.append("audio", params.audio);

  if (params.documentId) {
    formData.append("documentId", String(params.documentId));
  }
  if (params.questionId) {
    formData.append("questionId", String(params.questionId));
  }
  if (params.questionText) {
    formData.append("questionText", params.questionText);
  }
  if (params.referenceText) {
    formData.append("referenceText", params.referenceText);
  }
  if (params.candidateName) {
    formData.append("candidateName", params.candidateName);
  }
  if (params.notes) {
    formData.append("notes", params.notes);
  }
  if (params.providers?.length) {
    formData.append("providers", params.providers.join(","));
  }

  const response = await fetch(`${BASE_URL}/api/interviews/process`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

## 9. Browser recording example

If the frontend records audio in the browser:

```ts
export async function recordAudioBlob(): Promise<File> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
  const chunks: Blob[] = [];

  return new Promise((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = () => reject(new Error("Recording failed"));

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      const file = new File([blob], "interview-answer.webm", { type: "audio/webm" });
      stream.getTracks().forEach((track) => track.stop());
      resolve(file);
    };

    recorder.start();
    setTimeout(() => recorder.stop(), 20_000);
  });
}
```

## 10. Suggested frontend order

Recommended practical flow:

1. Upload the interview document once and keep its `documentId`
2. Before each session, call `GET /api/documents/:id/questions/random`
3. Show one question to the user
4. Record audio
5. Create interview with `questionId`
6. Upload audio
7. Queue transcription with `providers=["auto"]`
8. Poll status until `transcribed`
9. Optionally call `/api/transcriptions/clean` and show the cleaned text
10. Queue analysis
11. Poll status until `analyzed`

If your frontend wants the simplest path:

1. Upload the interview document once
2. Pick a random question
3. Call `POST /api/interviews/process`
4. Poll `GET /api/interviews/:id` until the score is ready

## 10. Fixed question media examples

### Queue media generation for one question

```ts
export async function generateQuestionMedia(questionId: number, payload?: {
  voice?: string;
  avatarName?: string;
  imageUrl?: string;
  videoUrl?: string;
  force?: boolean;
}) {
  const response = await fetch(`${BASE_URL}/api/questions/${questionId}/media/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload || {})
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

### Queue media generation for all questions in one document

```ts
export async function generateDocumentQuestionMedia(documentId: number, imageUrl?: string) {
  const response = await fetch(`${BASE_URL}/api/questions/media/generate-batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      documentId,
      voice: "cedar",
      imageUrl
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

### Read media asset from question list

Question records returned by `GET /api/documents/:id` and `GET /api/documents/:id/questions/random` now include:

```json
{
  "id": 12,
  "prompt": "请介绍一下你做过的项目",
  "mediaAsset": {
    "status": "ready",
    "audioUrl": "http://8.216.36.217:5050/uploads/question-media/question-12.mp3",
    "imageUrl": "https://cdn.example.com/mock-interview/interviewer.png",
    "videoUrl": null
  }
}
```

## 10. Fixed question media examples

### Queue media generation for one question

```ts
export async function generateQuestionMedia(questionId: number, payload?: {
  voice?: string;
  avatarName?: string;
  imageUrl?: string;
  videoUrl?: string;
  force?: boolean;
}) {
  const response = await fetch(`${BASE_URL}/api/questions/${questionId}/media/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload || {})
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

### Queue media generation for all questions in one document

```ts
export async function generateDocumentQuestionMedia(documentId: number, imageUrl?: string) {
  const response = await fetch(`${BASE_URL}/api/questions/media/generate-batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      documentId,
      voice: "cedar",
      imageUrl
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
```

### Read media asset from question list

Question records returned by `GET /api/documents/:id` and `GET /api/documents/:id/questions/random` now include:

```json
{
  "id": 12,
  "prompt": "???????????",
  "mediaAsset": {
    "status": "ready",
    "audioUrl": "http://8.216.36.217:5050/uploads/question-media/question-12.mp3",
    "imageUrl": "https://oss.example.com/mock-interview/interviewer.png",
    "videoUrl": null
  }
}
```

