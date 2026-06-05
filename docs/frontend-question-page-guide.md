# Frontend Question Page Guide

This guide focuses on the **question asking page** for the mock interview product.

The target experience is:

1. Randomly pick one fixed question from a document.
2. Show a fixed interviewer image or video.
3. Play the pre-generated interviewer audio.
4. Show the question text.
5. Let the user start recording after the prompt finishes.

## 1. Minimal frontend goal

The question page only needs to solve four things:

- fetch one question
- read its `mediaAsset`
- render the fixed interviewer media
- move to answer recording

The backend already supports this pattern.

## 2. Backend API to call

### Random question

```http
GET /api/documents/:id/questions/random?count=1
```

Example:

```http
GET /api/documents/1/questions/random?count=1
```

### Example response

```json
{
  "questions": [
    {
      "id": 1,
      "documentId": 1,
      "prompt": "??????????/????????????",
      "referenceAnswer": "...",
      "keywords": ["..."],
      "createdAt": "2026-06-05T09:13:10.576Z",
      "mediaAsset": {
        "id": 1,
        "questionId": 1,
        "status": "ready",
        "audioUrl": "https://mock-interview-assets.oss-ap-northeast-1.aliyuncs.com/mock-interview/question-media/question-1.mp3",
        "imageUrl": "https://mock-interview-assets.oss-ap-northeast-1.aliyuncs.com/interviewer.png",
        "videoUrl": null,
        "voice": "cedar",
        "avatarName": "default-interviewer"
      }
    }
  ]
}
```

## 3. Frontend only needs these fields

For the question page, focus on:

- `question.id`
- `question.prompt`
- `question.mediaAsset.status`
- `question.mediaAsset.audioUrl`
- `question.mediaAsset.imageUrl`
- `question.mediaAsset.videoUrl`

The frontend does not need:

- `referenceAnswer`
- `keywords`
- media debug metadata

## 4. Recommended page states

Use a very small state machine:

- `loading`
- `ready`
- `mediaGenerating`
- `error`
- `recording`

### Suggested rules

- `loading`: before question API returns
- `ready`: question exists and `mediaAsset.status === "ready"`
- `mediaGenerating`: question exists but media asset status is `missing`, `queued`, or `generating`
- `error`: request failed or payload invalid
- `recording`: user has started the answer flow

## 5. UI layout suggestion

A minimal layout can be:

1. interviewer area
   - image or video
2. question text area
3. audio play / replay button
4. start answer button
5. loading or generating hint

## 6. Rendering rules

### Case A: `mediaAsset.status === "ready"`

- render `videoUrl` if present
- otherwise render `imageUrl`
- autoplay or allow manual play for `audioUrl`
- enable `????`

### Case B: `mediaAsset.status` is `missing`, `queued`, or `generating`

- render a local fallback image
- show `???????`
- keep `????` disabled or hide it until ready

### Case C: `mediaAsset.status === "failed"`

- render fallback image
- show question text
- allow manual retry or refresh

## 7. Minimal fetch example

```ts
const BASE_URL = "http://8.216.36.217:5050";

export async function getRandomQuestion(documentId: number) {
  const response = await fetch(`${BASE_URL}/api/documents/${documentId}/questions/random?count=1`);

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  return data.questions?.[0] ?? null;
}
```

## 8. Minimal React example

```tsx
import { useEffect, useMemo, useRef, useState } from "react";

const BASE_URL = "http://8.216.36.217:5050";
const FALLBACK_IMAGE = "/fallback-interviewer.png";

type QuestionMediaAsset = {
  status: "missing" | "queued" | "generating" | "ready" | "failed";
  audioUrl?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
};

type InterviewQuestion = {
  id: number;
  prompt: string;
  mediaAsset?: QuestionMediaAsset | null;
};

async function getRandomQuestion(documentId: number): Promise<InterviewQuestion | null> {
  const response = await fetch(`${BASE_URL}/api/documents/${documentId}/questions/random?count=1`);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const data = await response.json();
  return data.questions?.[0] ?? null;
}

export function InterviewQuestionPage({ documentId }: { documentId: number }) {
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState<InterviewQuestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const nextQuestion = await getRandomQuestion(documentId);
        if (!cancelled) {
          setQuestion(nextQuestion);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "??????");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const media = question?.mediaAsset ?? null;
  const isReady = media?.status === "ready";
  const isGenerating = media?.status === "queued" || media?.status === "generating" || media?.status === "missing";
  const imageUrl = media?.imageUrl || FALLBACK_IMAGE;
  const videoUrl = media?.videoUrl || null;
  const audioUrl = media?.audioUrl || null;

  const stateText = useMemo(() => {
    if (loading) return "??????...";
    if (error) return error;
    if (!question) return "????";
    if (isGenerating) return "???????...";
    if (media?.status === "failed") return "??????????????";
    return null;
  }, [loading, error, question, isGenerating, media?.status]);

  useEffect(() => {
    if (isReady && audioRef.current && audioUrl) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        return;
      });
    }
  }, [isReady, audioUrl, question?.id]);

  if (loading) return <div>{stateText}</div>;
  if (error) return <div>{stateText}</div>;
  if (!question) return <div>????</div>;

  return (
    <div>
      <div>
        {videoUrl ? (
          <video src={videoUrl} controls playsInline />
        ) : (
          <img src={imageUrl} alt="interviewer" width={320} />
        )}
      </div>

      <div>
        <h2>{question.prompt}</h2>
        {stateText ? <p>{stateText}</p> : null}
      </div>

      <div>
        <audio ref={audioRef} src={audioUrl || undefined} preload="auto" />
        <button onClick={() => audioRef.current?.play()} disabled={!isReady || !audioUrl}>
          ????
        </button>
        <button disabled={!isReady}>
          ????
        </button>
      </div>
    </div>
  );
}
```

## 9. Replay behavior

Recommended replay behavior:

- allow replay before the user starts recording
- disable replay while recording if you want a cleaner interaction
- after recording ends, replay is optional

## 10. Error fallback strategy

### Audio load failure

- keep showing the question text
- keep showing interviewer image
- show `?????????????`
- do not block answering forever if the product wants resilience

### Image load failure

- swap to a local fallback avatar

### Missing media asset

- show the text only
- poll or refresh later if your product requires the fixed prompt media before answering

## 11. Recommended backend preparation flow

For a new document:

1. upload the document
2. extract the questions
3. call `POST /api/questions/media/generate-batch`
4. wait for generation to finish
5. let the frontend start using the random question API

## 12. Helpful backend validation commands

### Query one question media asset

```bash
curl "http://8.216.36.217:5050/api/questions/1/media"
```

### Generate media for a whole document

```bash
curl -X POST "http://8.216.36.217:5050/api/questions/media/generate-batch"   -H "Content-Type: application/json"   -d '{
    "documentId": 1,
    "voice": "cedar"
  }'
```

### Read one random question

```bash
curl "http://8.216.36.217:5050/api/documents/1/questions/random?count=1"
```

## 13. Practical conclusion

For the frontend question page, the real minimal flow is:

1. call the random question API
2. read `prompt + mediaAsset`
3. render interviewer image/video
4. play interviewer audio
5. enter answer recording

That means the frontend no longer needs to generate prompt media in real time.
