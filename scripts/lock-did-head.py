import argparse
from pathlib import Path

import cv2
import numpy as np


def parse_args():
    parser = argparse.ArgumentParser(
        description="Lock a D-ID presenter's head and preserve only lower-face motion."
    )
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def detect_primary_face(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    detector = cv2.CascadeClassifier(cascade_path)
    faces = detector.detectMultiScale(
        gray,
        scaleFactor=1.08,
        minNeighbors=5,
        minSize=(frame.shape[1] // 7, frame.shape[0] // 7),
    )
    if len(faces) == 0:
        raise RuntimeError("No face detected in the reference frame.")
    return max(faces, key=lambda box: int(box[2]) * int(box[3]))


def reference_features(reference_gray, face_box):
    x, y, width, height = face_box
    mask = np.zeros_like(reference_gray)
    x1 = max(0, int(x + width * 0.12))
    x2 = min(reference_gray.shape[1], int(x + width * 0.88))
    y1 = max(0, int(y + height * 0.08))
    y2 = min(reference_gray.shape[0], int(y + height * 0.58))
    mask[y1:y2, x1:x2] = 255
    points = cv2.goodFeaturesToTrack(
        reference_gray,
        maxCorners=180,
        qualityLevel=0.01,
        minDistance=7,
        blockSize=7,
        mask=mask,
    )
    if points is None or len(points) < 12:
        raise RuntimeError("Not enough stable upper-face features were detected.")
    return points


def estimate_transforms(video_path, reference_gray, points, frame_count):
    capture = cv2.VideoCapture(str(video_path))
    transforms = []
    previous = np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]], dtype=np.float32)

    for _ in range(frame_count):
        ok, frame = capture.read()
        if not ok:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        current_points, status, _ = cv2.calcOpticalFlowPyrLK(
            reference_gray,
            gray,
            points,
            None,
            winSize=(31, 31),
            maxLevel=3,
            criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01),
        )
        valid = status.reshape(-1) == 1 if status is not None else np.zeros(0, dtype=bool)
        matrix = None
        if current_points is not None and int(valid.sum()) >= 8:
            matrix, _ = cv2.estimateAffinePartial2D(
                current_points[valid],
                points[valid],
                method=cv2.RANSAC,
                ransacReprojThreshold=2.5,
                maxIters=2000,
                confidence=0.99,
            )
        if matrix is None:
            matrix = previous.copy()
        matrix = matrix.astype(np.float32)
        transforms.append(matrix)
        previous = matrix

    capture.release()
    return smooth_transforms(np.asarray(transforms, dtype=np.float32))


def smooth_transforms(transforms, radius=4):
    if len(transforms) == 0:
        return transforms
    smoothed = np.empty_like(transforms)
    for index in range(len(transforms)):
        start = max(0, index - radius)
        end = min(len(transforms), index + radius + 1)
        smoothed[index] = np.median(transforms[start:end], axis=0)
    smoothed[0] = np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]], dtype=np.float32)
    return smoothed


def lower_face_mask(frame_shape, face_box):
    x, y, width, height = face_box
    mask = np.zeros(frame_shape[:2], dtype=np.uint8)
    center = (int(x + width * 0.5), int(y + height * 0.72))
    axes = (max(1, int(width * 0.34)), max(1, int(height * 0.25)))
    cv2.ellipse(mask, center, axes, 0, 0, 360, 255, -1)
    blur = max(15, int(width * 0.05))
    blur += 1 - blur % 2
    mask = cv2.GaussianBlur(mask, (blur, blur), 0)
    return (mask.astype(np.float32) / 255.0)[..., None]


def render_locked_video(video_path, output_path, reference, face_box, transforms, fps):
    height, width = reference.shape[:2]
    writer = cv2.VideoWriter(
        str(output_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height),
    )
    if not writer.isOpened():
        raise RuntimeError("Could not open the output video writer.")

    alpha = lower_face_mask(reference.shape, face_box)
    capture = cv2.VideoCapture(str(video_path))
    rendered = 0
    for matrix in transforms:
        ok, frame = capture.read()
        if not ok:
            break
        aligned = cv2.warpAffine(
            frame,
            matrix,
            (width, height),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_REFLECT,
        )
        composed = aligned.astype(np.float32) * alpha + reference.astype(np.float32) * (1.0 - alpha)
        writer.write(np.clip(composed, 0, 255).astype(np.uint8))
        rendered += 1

    capture.release()
    writer.release()
    return rendered


def main():
    args = parse_args()
    video_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError(f"Could not open {video_path}")
    fps = capture.get(cv2.CAP_PROP_FPS) or 25.0
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    ok, reference = capture.read()
    capture.release()
    if not ok:
        raise RuntimeError("Could not read the reference frame.")

    reference_gray = cv2.cvtColor(reference, cv2.COLOR_BGR2GRAY)
    face_box = detect_primary_face(reference)
    points = reference_features(reference_gray, face_box)
    transforms = estimate_transforms(video_path, reference_gray, points, frame_count)
    rendered = render_locked_video(
        video_path,
        output_path,
        reference,
        face_box,
        transforms,
        fps,
    )
    print(f"face_box={tuple(int(value) for value in face_box)}")
    print(f"frames={rendered} fps={fps:.3f} output={output_path}")


if __name__ == "__main__":
    main()
