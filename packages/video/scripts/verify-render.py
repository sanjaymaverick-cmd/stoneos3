from pathlib import Path
import subprocess
import sys

video = Path(sys.argv[1]).resolve()
qa_dir = video.parent / "qa-video"
qa_dir.mkdir(exist_ok=True)

repo = Path(__file__).resolve().parents[3]
ffmpeg = repo / "node_modules" / "@remotion" / "compositor-win32-x64-msvc" / "ffmpeg.exe"
for index, second in enumerate((2, 12, 30, 52, 75, 98, 116), start=1):
    path = qa_dir / f"{index:02d}-{second:03d}s.png"
    result = subprocess.run(
        [ffmpeg, "-y", "-ss", str(second), "-i", str(video), "-frames:v", "1", str(path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Could not read frame at {second}s: {result.stderr}")
    print(path)

probe = subprocess.run(
    [ffmpeg, "-hide_banner", "-i", str(video)],
    capture_output=True,
    text=True,
)
stream_info = probe.stderr
if "Video:" not in stream_info or "Audio:" not in stream_info:
    raise RuntimeError("Expected both video and audio streams")
for line in stream_info.splitlines():
    if "Duration:" in line or "Stream #" in line:
        print(line.strip())
