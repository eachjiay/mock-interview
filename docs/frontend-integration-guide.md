# Frontend Integration Guide

This guide describes the recommended frontend integration flow for `D:\mock-interview-backend`.

Recommended production path:

1. Create interview
2. Upload audio
3. Queue Xunfei transcription
4. Poll interview status until `transcribed`
5. Optionally clean transcript for display
6. Queue OpenAI analysis
7. Poll interview status until `analyzed`
8. Render score, summary, strengths, gaps, and mismatches

Base URL example:

```ts
const BASE_URL = "http://8.216.36.217:5050";
```

## 1. Create interview

### Request

```http
POST /api/interviews
Content-Type: application/json
```

```json
{
  "candidateName": "test-user",
  "questionText": "请介绍一下你做过的项目",
  "referenceText": "回答应包含项目背景、技术栈、个人职责、难点和结果。"
}
```

### Key response fields

```json
{
  "id": 2,
  "status": "created",
  "questionText": "请介绍一下你做过的项目",
  "referenceText": "回答应包含项目背景、技术栈、个人职责、难点和结果。"
}
```

Frontend only needs to keep:

- `id`
- `status`
- `questionText`
- `referenceText`

## 2. Upload audio

### Request

```http
POST /api/interviews/:id/audio
Content-Type: multipart/form-data
```

Form field:

- `audio`

### Example

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

### Key response fields

- `id`
- `status` should become `uploaded`
- `audioOriginalName`

## 3. Queue transcription

### Request

```http
POST /api/interviews/:id/transcribe
Content-Type: application/json
```

```json
{
  "providers": ["xunfei"]
}
```

You can also use:

```json
{
  "providers": ["auto"]
}
```

### Key response fields

```json
{
  "interviewId": 2,
  "status": "transcribing",
  "providers": ["xunfei"]
}
```

This endpoint is async. It does not return transcript text immediately.

## 4. Poll interview detail

### Request

```http
GET /api/interviews/:id
```

### Important response fields

```json
{
  "interview": {
    "id": 2,
    "status": "transcribed",
    "activeTranscriptProvider": "xunfei",
    "errorMessage": null
  },
  "transcripts": [
    {
      "createdAt": "2026-05-17T08:57:56.188Z",
      "provider": "xunfei",
      "model": "xfyun-recording-file-llm",
      "text": "..."
    }
  ],
  "analysis": null
}
```

### Frontend polling rule

Poll every `2-3s` and watch:

- `interview.status`
- `interview.errorMessage`

Possible statuses:

- `created`
- `uploaded`
- `transcribing`
- `transcribed`
- `analyzing`
- `analyzed`
- `failed`

Recommended stop conditions:

- stop and show result when `analyzed`
- stop and show error when `failed`

## 5. Optional transcript cleaning

Use this only when the UI wants a polished transcript to show the user.

### Request

```http
POST /api/transcriptions/clean
Content-Type: application/json
```

```json
{
  "transcriptText": "嗯面试官你好，我叫张三，然后我做过一个Java项目，嗯主要用了Spring Boot和MySQL。",
  "keepParagraphs": true
}
```

### Response fields

```json
{
  "cleanedText": "面试官你好，我叫张三。我做过一个Java项目，主要用了Spring Boot和MySQL。",
  "removedFillers": ["嗯"],
  "notes": ["去掉了填充词。", "修正了标点符号。", "句子进行了分段处理。"]
}
```

Notes:

- no `raw` field is returned
- this is optional for frontend display
- OpenAI scoring already auto-cleans internally

## 6. Queue analysis

### Request

```http
POST /api/interviews/:id/analyze
Content-Type: application/json
```

```json
{
  "scoringProvider": "openai"
}
```

### Key response fields

```json
{
  "interviewId": 2,
  "status": "analyzing",
  "provider": "xunfei",
  "scoringProvider": "openai",
  "audioFileUrl": null
}
```

Notes:

- `openai` scoring will auto-clean the latest transcript before scoring
- frontend does not need to call `/api/transcriptions/clean` before this step unless it wants display text

## 7. Poll until analyzed

Call:

```http
GET /api/interviews/:id
```

Expected final shape:

```json
{
  "interview": {
    "id": 2,
    "status": "analyzed",
    "activeTranscriptProvider": "xunfei",
    "errorMessage": null
  },
  "transcripts": [
    {
      "createdAt": "2026-05-17T08:57:56.188Z",
      "provider": "xunfei",
      "model": "xfyun-recording-file-llm",
      "text": "..."
    }
  ],
  "analysis": {
    "interviewId": 2,
    "transcriptProvider": "xunfei",
    "scoringModel": "gpt-4o-mini",
    "createdAt": "2026-05-17T08:59:27.595Z",
    "score": 65,
    "summary": "应聘者具有AI应用和代理系统的项目经验，但回答较为散乱，未能充分展示个人在项目中的具体职责和成果。",
    "strengths": [
      "具备AI和代理系统的专业知识",
      "有具体项目经验，涉及复杂业务场景",
      "表达清晰，逻辑较为连贯"
    ],
    "gaps": [
      "未详细描述项目背景和具体成果",
      "未提及具体技术栈和个人职责",
      "回答显得有些冗长，缺乏重点"
    ],
    "mismatches": [
      "未能完全符合参考文本中对项目介绍的结构要求",
      "对问题的回答较为模糊，缺乏量化结果或反思"
    ]
  }
}
```

Notes:

- `analysis.raw` is stripped from the frontend response
- this makes the payload much smaller and easier to render

## 8. Recommended frontend state machine

Recommended frontend page states:

1. `idle`
2. `creatingInterview`
3. `uploadingAudio`
4. `transcribing`
5. `transcribed`
6. `cleaningTranscript` optional
7. `analyzing`
8. `done`
9. `failed`

Suggested mapping:

- backend `transcribing` -> UI `transcribing`
- backend `transcribed` -> UI `transcribed`
- backend `analyzing` -> UI `analyzing`
- backend `analyzed` -> UI `done`
- backend `failed` -> UI `failed`

## 9. Minimal frontend code order

```ts
const interview = await createInterview(...);
await uploadInterviewAudio(interview.id, file);
await transcribeInterview(interview.id, ["xunfei"]);

let detail = await pollUntil(interview.id, ["transcribed", "failed"]);
if (detail.interview.status === "failed") throw new Error(detail.interview.errorMessage || "transcription failed");

const cleaned = await cleanTranscriptText(detail.transcripts[0].text, true); // optional for display
await analyzeInterview(detail.interview.id, "openai");

detail = await pollUntil(interview.id, ["analyzed", "failed"]);
if (detail.interview.status === "failed") throw new Error(detail.interview.errorMessage || "analysis failed");

renderResult({
  transcript: cleaned.cleanedText,
  analysis: detail.analysis
});
```

## 10. Helper polling example

```ts
export async function pollUntil(
  interviewId: number,
  targetStatuses: Array<"transcribed" | "analyzed" | "failed">,
  intervalMs = 3000
) {
  while (true) {
    const response = await fetch(`${BASE_URL}/api/interviews/${interviewId}`);
    if (!response.ok) {
      throw new Error(await response.text());
    }

    const detail = await response.json();
    const status = detail.interview.status;

    if (targetStatuses.includes(status)) {
      return detail;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
```

## 11. What frontend should store

Per interview session, frontend usually only needs:

- `interviewId`
- `questionText`
- `referenceText` if needed for internal display
- `audioOriginalName`
- latest `transcript.text`
- optional `cleanedText`
- final `analysis`

No need to keep:

- provider `raw` objects
- full model debug payloads

## 12. Error handling suggestions

If `status === "failed"`:

- show `interview.errorMessage` directly
- provide retry button for:
  - retranscribe
  - reanalyze

Common cases:

- Xunfei config missing
- OpenAI quota issue
- unsupported region for OpenAI
- network timeout

## 13. Fixed question media flow

The backend now supports pre-generated question media for a fixed interviewer avatar experience.

Recommended frontend behavior:

1. After importing a document, call `POST /api/questions/media/generate-batch` once for that document.
2. When fetching question lists, read `question.mediaAsset` directly from the returned question records.
3. If `mediaAsset.status === "ready"`, render:
   - `mediaAsset.imageUrl` or `mediaAsset.videoUrl`
   - `mediaAsset.audioUrl`
4. If `mediaAsset.status` is `missing`, `queued`, or `generating`, show a fallback static avatar and disable the preview player.

### Generate media for one question

```http
POST /api/questions/:id/media/generate
Content-Type: application/json
```

```json
{
  "voice": "cedar",
  "avatarName": "default-interviewer",
  "imageUrl": "https://cdn.example.com/mock-interview/interviewer.png",
  "force": false
}
```

### Generate media for a whole document

```http
POST /api/questions/media/generate-batch
Content-Type: application/json
```

```json
{
  "documentId": 1,
  "voice": "cedar",
  "imageUrl": "https://cdn.example.com/mock-interview/interviewer.png"
}
```

### Query one question media asset

```http
GET /api/questions/:id/media
```

### Manual OSS binding

```http
PUT /api/questions/:id/media
Content-Type: application/json
```

```json
{
  "audioUrl": "https://cdn.example.com/mock-interview/question-media/question-12.mp3",
  "imageUrl": "https://cdn.example.com/mock-interview/interviewer.png",
  "videoUrl": "https://cdn.example.com/mock-interview/question-media/question-12.mp4"
}
```

## 13. Fixed question media flow

The backend now supports pre-generated question media for the interviewer avatar experience.

Recommended frontend behavior:

1. After importing a document, call `POST /api/questions/media/generate-batch` once for that document.
2. When fetching question lists, read `question.mediaAsset` directly from the returned question records.
3. If `mediaAsset.status === "ready"`, render:
   - `mediaAsset.imageUrl` or `mediaAsset.videoUrl`
   - `mediaAsset.audioUrl`
4. If `mediaAsset.status` is `missing`, `queued`, or `generating`, show a fallback static avatar and disable the preview player.

### Generate media for one question

```http
POST /api/questions/:id/media/generate
Content-Type: application/json
```

```json
{
  "voice": "cedar",
  "avatarName": "default-interviewer",
  "imageUrl": "https://oss.example.com/mock-interview/interviewer.png",
  "force": false
}
```

### Generate media for a whole document

```http
POST /api/questions/media/generate-batch
Content-Type: application/json
```

```json
{
  "documentId": 1,
  "voice": "cedar",
  "imageUrl": "https://oss.example.com/mock-interview/interviewer.png"
}
```

### Query one question media asset

```http
GET /api/questions/:id/media
```

### Manual OSS binding

```http
PUT /api/questions/:id/media
Content-Type: application/json
```

```json
{
  "audioUrl": "https://oss.example.com/mock-interview/q12.mp3",
  "imageUrl": "https://oss.example.com/mock-interview/interviewer.png",
  "videoUrl": "https://oss.example.com/mock-interview/q12.mp4"
}
```

