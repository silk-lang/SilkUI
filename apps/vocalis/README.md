# Vocalis

A voice analysis studio written in Silk with Loom and drawn with WebGPU in a native window.

![Vocalis showing the demo voice](docs/screenshot.png)

- **Spectrogram**: scrolling, 0–5 kHz, 2048-point FFT, 512-sample hop, with an inferno-style colour ramp
- **Pitch**: YIN pitch detection drawn as a green track over the spectrogram, with Hz, note name and cents
- **Formants**: F1, F2 and F3 from LPC (order 14), drawn as coloured dots and shown as readouts
- **Spectrum slice**: the current spectrum next to the spectrogram, with the formants marked
- **Level**: RMS in dBFS with a meter

Sources: **Demo voice** (a built-in synthetic singer gliding through a-e-i-o-u with vibrato),
**Open WAV…** (16-bit PCM or 32-bit float, any channel count or rate) and **Microphone**.

| File | What it holds |
| --- | --- |
| `src/vocalis.silk` | the Loom program: model, update, view, drawings, synthetic singer |
| `src/dsp.silk` | FFT, Hann window, dB spectrum, RMS, YIN pitch, LPC formants |
| `src/source.silk` | the `Sound` service the program asks for samples |
| `src/main.silk` | the native window, the machine's `Sound` (WAV decoding, microphone) |

```sh
cd apps/vocalis && silk build && ./build/llvm/x86_64-unknown-linux-gnu/debug/vocalis
```

## Status

It compiles, and runs on Linux (X11, with lavapipe drawing WebGPU on the CPU, as in the screenshot). Known gaps:

- The microphone is stubbed (`startMic` returns false, and the app falls back to the demo
  voice). Silk's standard library has no child-process pipe or audio capture API that the code
  could find yet. The plan is to stream `parec`, `arecord` or `sox` output, or to add a native
  CoreAudio/PulseAudio binding.
- `dsp.silk` defines its own `ln`/`log10`, because no `f32.log` was found.
- History buffers shift on every column. A ring buffer would be cheaper.

It needs the X11, xkbcommon, Wayland and wayland-protocols development packages and LLVM 22 (`SILK_CLANG`), like the other native apps here.
