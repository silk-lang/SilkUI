# Comparison page

`index.html` is the page of the xbench results dashboard (https://claude.ai/artifact/5wwahHF5nCLP18xVCr8YnM),
a Claude Data artifact. Its one dataset, `summary`, is `results/summary.json` uploaded as a file.

After a benchmark session:

1. `tools/summarize.py` (rewrites `results/summary.json` from every `results/*.jsonl`).
2. Commit the `.jsonl` files, so the history stays in the repository.
3. Ask Claude to upload the new `summary.json` to the dashboard and point the `summary` dataset at it.
