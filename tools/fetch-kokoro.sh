#!/usr/bin/env bash
# Download the Kokoro-82M voice model so the Voice Lab loads it from this server instead of Hugging Face.
# Safe to run more than once (skips files already present). Files land in vendor/kokoro/models/ (git-ignored).
# Without these files the Kokoro engine still works — it falls back to downloading from Hugging Face / jsDelivr.
#
#   tools/fetch-kokoro.sh            q8 model (~92 MB) + English voices + ONNX runtime wasm
#   tools/fetch-kokoro.sh fp32       also the full-precision model (~326 MB)
set -euo pipefail
cd "$(dirname "$0")/.."
HF=https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main
DIR=vendor/kokoro/models/onnx-community/Kokoro-82M-v1.0-ONNX
ORT=https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist   # must match the transformers.js inside kokoro.web.js
mkdir -p "$DIR/onnx" "$DIR/voices" vendor/kokoro/models/ort
get() { [ -s "$2" ] && return 0; echo "  $2"; curl -fsSL "$1" -o "$2.part" && mv "$2.part" "$2"; }
for f in config.json tokenizer.json tokenizer_config.json onnx/model_quantized.onnx; do get "$HF/$f" "$DIR/$f"; done
[ "${1:-}" = fp32 ] && get "$HF/onnx/model.onnx" "$DIR/onnx/model.onnx"
for v in af_alloy af_aoede af_bella af_heart af_jessica af_kore af_nicole af_nova af_river af_sarah af_sky \
         am_adam am_echo am_eric am_fenrir am_liam am_michael am_onyx am_puck am_santa \
         bf_alice bf_emma bf_isabella bf_lily bm_daniel bm_fable bm_george bm_lewis; do
  get "$HF/voices/$v.bin" "$DIR/voices/$v.bin"
done
for f in ort-wasm-simd-threaded.jsep.wasm ort-wasm-simd-threaded.jsep.mjs; do get "$ORT/$f" "vendor/kokoro/models/ort/$f"; done
du -sh vendor/kokoro/models
