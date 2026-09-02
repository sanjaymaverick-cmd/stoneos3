from pathlib import Path
import wave

audio_dir = Path(__file__).resolve().parents[1] / "public" / "audio"
for path in sorted(audio_dir.glob("*.wav")):
    with wave.open(str(path), "rb") as wav:
        duration = wav.getnframes() / wav.getframerate()
    print(f"{path.name}: {duration:.2f}s")
