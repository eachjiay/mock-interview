# mock-interview-backend

Standalone backend for AI mock interviews. It can import interview documents into a question bank, randomly pick questions, accept audio uploads, run one or more transcription providers, and score the transcript against the selected reference answer.

## What is included

- `POST /api/documents/upload` upload a `docx`, `txt`, or `md` document and extract questions
- `POST /api/documents/import-local` import a local document path on the server
- `GET /api/documents` list imported documents
- `GET /api/documents/:id` get one document and its extracted questions
- `GET /api/documents/:id/questions/random?count=3` sample random questions from one document
- `POST /api/transcriptions` upload an audio file and transcribe it directly with `openai` or `xunfei`
- `POST /api/interviews` create an interview record
- `POST /api/interviews/process` create a record, upload audio, transcribe, and analyze in one call
- `POST /api/interviews/:id/audio` upload an audio file to an existing interview
- `POST /api/interviews/:id/transcribe` run transcription providers such as `openai`
- `POST /api/interviews/:id/analyze` score the transcript against the reference text
- `GET /api/interviews/:id` fetch the interview, transcripts, and latest analysis

## Quick start

```bash
cd D:\mock-interview-backend
copy .env.example .env
npm install
npm run dev
```

Frontend integration examples:

- [examples/frontend-api-examples.md](D:\mock-interview-backend\examples\frontend-api-examples.md)

Required env:

- `OPENAI_API_KEY`
- `XUNFEI_APP_ID` and `XUNFEI_API_SECRET` if you want to use Xunfei

Recommended defaults:

- `OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe`
- `OPENAI_SCORING_MODEL=gpt-4o-mini`

## Document flow

1. Import a document

```http
POST /api/documents/upload
Content-Type: multipart/form-data
```

Form fields:

- `document`: required, `docx`, `txt`, or `md`
- `title`: optional

You can also import an existing local file:

```http
POST /api/documents/import-local
Content-Type: application/json

{
  "filePath": "C:/Users/59293/Documents/xwechat_files/.../提问文档.docx"
}
```

2. Pick random questions

```http
GET /api/documents/1/questions/random?count=3
```

## Interview flow

1. Create interview

```http
POST /api/interviews
Content-Type: application/json

{
  "candidateName": "Alice",
  "documentId": 1
}
```

If you already know the exact question, you can pass `questionId` instead of `documentId`. If you want to bypass the bank entirely, you can still send `questionText` and `referenceText` directly.

2. Upload audio

Field name must be `audio`. The upload layer accepts `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, `webm`, `flac`, and `opus`.

3. Run transcription

```http
POST /api/interviews/1/transcribe
Content-Type: application/json

{
  "providers": ["openai", "xunfei"]
}
```

4. Run analysis

```http
POST /api/interviews/1/analyze
Content-Type: application/json

{
  "provider": "openai"
}
```

## One-shot flow

```http
POST /api/interviews/process
Content-Type: multipart/form-data
```

Form fields:

- `audio`: required
- `referenceText`: optional when `documentId` or `questionId` is provided
- `documentId`: optional
- `questionId`: optional
- `candidateName`: optional
- `questionText`: optional
- `notes`: optional
- `providers`: optional, for example `openai`

## Direct transcription flow

```http
POST /api/transcriptions
Content-Type: multipart/form-data
```

Form fields:

- `audio`: required
- `provider`: optional, single provider such as `openai` or `xunfei`
- `providers`: optional, comma-separated or repeated values such as `openai,xunfei`

## Notes

- The upload middleware accepts the union of formats supported by OpenAI and Xunfei. OpenAI itself currently limits uploads to `25 MB`, while Xunfei long-form ASR supports up to `500 MB`.
- `xunfei` and `openai` are wired. `volcengine` is still a placeholder.
- The document parser is optimized for interview notes that follow a `question -> answer` structure like your `八股.docx` and `提问文档.docx`.
- OpenAI speech-to-text currently supports `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, and `gpt-4o-transcribe-diarize`, with `25 MB` file upload limits according to the official docs:
  - [Speech to text guide](https://platform.openai.com/docs/guides/speech-to-text?lang=javascript)
  - [GPT-4o mini Transcribe](https://platform.openai.com/docs/models/gpt-4o-mini-transcribe)
- Xunfei uses the official long-form ASR REST flow: `prepare -> upload -> merge -> getProgress -> getResult`:
  - [讯飞语音转写 API](https://www.xfyun.cn/doc/asr/lfasr/API.html)
