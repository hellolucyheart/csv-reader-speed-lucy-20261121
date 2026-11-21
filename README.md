# csv-reader-speed-lucy-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/hellolucyheart/csv-reader-speed-lucy-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/hellolucyheart/csv-reader-speed-lucy-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in for csv-reader 1.0.0: identical answers on every broken row, parsed about 5× faster. `solve.js` reads each CSV text once, left to right, with the reference's own broken-row policy — BOM dropped, stray CRs reported and dropped, unterminated quotes read again as unquoted, quote junk appended, short and long rows padded or cut to the first record's width, every error with its line and row — while cutting fields out with tight scans and slices instead of walking the text one character at a time. Verified against the reference on the kit's practice set (6/6 cases, byte-identical answers), 91 hand-built edge cases, and 12 freshly drawn generator sets.

## Run it

```sh
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=68wvraae&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
