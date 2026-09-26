# Lanternfall perf log

| Date | Build | Where | Room | Sim avg / p95 / max (ms) | Frame p95 | Awake chunks avg/max | Cells scanned avg/p95 | Notes |
|---|---|---|---|---|---|---|---|---|
| 2026-09-26 | M1 | headless Chromium, SwiftShader (software GPU), 1920×1080 | bench_flood (1024×544, 61.6k water) | 1.55 / 4.1 / 18.3 | n/a (software) | 17 / 26 | 29.7k / 64.7k | dam break, fire on scaffold, rime bridge, tide wave, spark, overhang collapse (13 fragments). Water 61,600 → 61,494 (−0.17%: thrown liquid landing on non-air). |
