# mock-interview-backend

Standalone backend for AI mock interviews. It can import interview documents into a question bank, randomly pick questions, accept audio uploads, run one or more transcription providers, and score the transcript against the selected reference answer. Long-running transcription and scoring are handled asynchronously so the frontend can poll status instead of waiting on one request.

## What is included

- `POST /api/documents/upload` upload a `docx`, `txt`, or `md` document and extract questions
- `POST /api/documents/import-local` import a local document path on the server
- `GET /api/documents` list imported documents
- `GET /api/documents/:id` get one document and its extracted questions
- `GET /api/documents/:id/questions/random?count=3` sample random questions from one document
- `POST /api/transcriptions` upload an audio file and transcribe it directly with `openai` or `xunfei`
- `POST /api/transcriptions/clean` clean raw ASR transcript text for display and downstream scoring
- `POST /api/transcriptions/segment` split transcript text into interviewer/candidate-like segments and Q/A pairs
- `POST /api/interviews` create an interview record
- `POST /api/interviews/process` create a record, upload audio, transcribe, and analyze in one call
- `POST /api/interviews/:id/audio` upload an audio file to an existing interview
- `POST /api/interviews/:id/transcribe` run transcription providers such as `openai`
- `POST /api/interviews/:id/segment` segment the latest transcript of an interview into Q/A pairs
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
- [docs/frontend-integration-guide.md](D:\mock-interview-backend\docs\frontend-integration-guide.md)

Required env:

- `OPENAI_API_KEY`
- `XUNFEI_APP_ID` and `XUNFEI_API_SECRET` if you want to use Xunfei
- `PUBLIC_BASE_URL` if you want Xunfei `voice-insight` to fetch uploaded audio files from your server

Recommended defaults:

- `OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe`
- `OPENAI_SCORING_MODEL=gpt-4o-mini`

## Docker deployment

This repo now includes:

- [Dockerfile](D:\mock-interview-backend\Dockerfile)
- [docker-compose.yml](D:\mock-interview-backend\docker-compose.yml)

### 1. Prepare the server

Install Docker and Docker Compose on your Linux server, then clone the repo:

```bash
git clone https://github.com/eachjiay/mock-interview.git
cd mock-interview
cp .env.example .env
```

### 2. Configure `.env`

At minimum, fill:

```env
PORT=5050
PUBLIC_BASE_URL=https://your-domain.com

OPENAI_API_KEY=your-new-openai-key

XUNFEI_ENABLED=true
XUNFEI_API_URL=https://office-api-ist-dx.iflyaisol.com
XUNFEI_APP_ID=your-xunfei-app-id
XUNFEI_API_KEY=your-xunfei-api-key
XUNFEI_API_SECRET=your-xunfei-api-secret
XUNFEI_LANGUAGE=autodialect
XUNFEI_VOICE_INSIGHT_API_URL=https://spark-openapi.cn-huabei-1.xf-yun.com
XUNFEI_VOICE_INSIGHT_MODEL_CODE=4.0ultra
```

Notes:

- `PUBLIC_BASE_URL` must be the public domain that can access `https://your-domain.com/uploads/...`
- `voice-insight` analysis needs a public audio URL, so local `localhost` URLs are not enough
- keep `.env` on the server only, never commit it

### 3. Start the service

```bash
docker compose up -d --build
```

### 4. Check status

```bash
docker compose ps
docker compose logs -f
```

Health check:

```bash
curl http://127.0.0.1:5050/health
```

Expected response:

```json
{"status":"ok"}
```

### 5. Update after new code

```bash
git pull
docker compose up -d --build
```

### 6. Persistent data

The compose file already mounts:

- `./data` -> `/app/data`
- `./uploads` -> `/app/uploads`

So interview records and uploaded audio remain after container restarts.

### 7. Recommended production setup

- Use a real domain such as `api.yourdomain.com`
- Put Nginx or Caddy in front of port `5050`
- Enable HTTPS
- Point `PUBLIC_BASE_URL` to that HTTPS domain

Minimal Nginx reverse proxy example:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    client_max_body_size 200m;

    location / {
        proxy_pass http://127.0.0.1:5050;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

If your audio files are large, increase `client_max_body_size` accordingly.

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

3. Queue transcription

```http
POST /api/interviews/1/transcribe
Content-Type: application/json

{
  "providers": ["auto"]
}
```

The API now returns `202 Accepted` with a task payload like:

```json
{
  "interviewId": 1,
  "status": "transcribing",
  "providers": ["xunfei"]
}
```

4. Poll interview detail

```http
GET /api/interviews/1
```

Watch `interview.status`:

- `uploaded`
- `transcribing`
- `transcribed`
- `analyzing`
- `analyzed`
- `failed`

5. Queue analysis

```http
POST /api/interviews/1/analyze
Content-Type: application/json

{
  "provider": "openai"
}
```

When `provider` / `scoringProvider` is `openai`, the backend auto-cleans the latest transcript before scoring. Call `/api/transcriptions/clean` separately only when you also want to show a polished transcript to the user.

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
- `providers`: optional, for example `openai`, `xunfei`, or `auto`

## Direct transcription flow

```http
POST /api/transcriptions
Content-Type: multipart/form-data
```

Form fields:

- `audio`: required
- `provider`: optional, single provider such as `openai` or `xunfei`
- `providers`: optional, comma-separated or repeated values such as `openai,xunfei`

Responses from this endpoint omit provider-specific `raw` payloads by default so the frontend receives a smaller JSON body.

## Transcript cleaning flow

```http
POST /api/transcriptions/clean
Content-Type: application/json
```

Request body:

```json
{
  "transcriptText": "嗯面试官你好 我叫...",
  "keepParagraphs": true
}
```

Response fields:

- `cleanedText`: cleaned transcript text
- `removedFillers`: filler words removed or normalized
- `notes`: cleanup notes such as obvious ASR noise fixes

This endpoint returns only display-friendly fields and does not expose the underlying model `raw` response by default.

## Transcript segmentation flow

```http
POST /api/transcriptions/segment
Content-Type: application/json
```

Request body:

```json
{
  "transcriptText": "面试官你好，我先做一下自我介绍..."
}
```

Response fields:

- `segments`: ordered transcript segments with `speakerGuess`
- `qaPairs`: question-answer pairs inferred from the transcript
- `notes`: segmentation notes

## Notes

- The upload middleware accepts the union of formats supported by OpenAI and Xunfei. OpenAI itself currently limits uploads to `25 MB`, while Xunfei long-form ASR supports up to `500 MB`.
- `xunfei` and `openai` are wired. `volcengine` is still a placeholder.
- When `providers` is omitted or set to `auto`, the backend now auto-selects `openai` for files within the configured OpenAI size limit and falls back to `xunfei` for larger files.
- The document parser is optimized for interview notes that follow a `question -> answer` structure like your `八股.docx` and `提问文档.docx`.
- OpenAI speech-to-text currently supports `gpt-4o-mini-transcribe`, `gpt-4o-transcribe`, and `gpt-4o-transcribe-diarize`, with `25 MB` file upload limits according to the official docs:
  - [Speech to text guide](https://platform.openai.com/docs/guides/speech-to-text?lang=javascript)
  - [GPT-4o mini Transcribe](https://platform.openai.com/docs/models/gpt-4o-mini-transcribe)
- Xunfei uses the official long-form ASR REST flow: `prepare -> upload -> merge -> getProgress -> getResult`:
  - [讯飞语音转写 API](https://www.xfyun.cn/doc/asr/lfasr/API.html)
