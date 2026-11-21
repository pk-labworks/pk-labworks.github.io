# Swara Live

A local, browser-based singing pitch tracker. It detects a single sung note and displays its Carnatic swara, Hindustani equivalent, Western note, frequency, and tuning relative to a selected Sa. The graph shows a two-second pitch trace scrolling under a fixed playhead at up to 30 frames per second, across one octave from the selected Sa to upper Sa. Pitch readings are shown without smoothing.

## Open the public app

<https://pk-labworks.github.io/swara-live/>

The site uses your browser's microphone permission. Audio is processed on your device and is not uploaded.

## Run locally

```sh
python3 -m http.server 8766 --bind 127.0.0.1
```

Open <http://localhost:8766>, select your Sa, and click **Start listening**. Allow microphone access when prompted.

The detector works best with one clear, sustained voice and a quiet room. It uses equal-tempered semitone positions; it does not identify ragas or interpret expressive intonation.
