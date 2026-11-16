# ui-bench

Benchmarks of the retained tree (`ui-tree`) and the framework (`loom`). The scenarios, their
sizes and their names follow the benchmarks of
[FerroUI](https://github.com/wieslawsoltes/FerroUI/tree/main/tests/FerroUI.Benchmarks)
(`category::Class.benchmark[parameters]`), so the two tables can be read side by side. Only the
scenarios and numbers are taken from there; the code is silkui's own, in CSS terms: a Border is a
box, a StackPanel a flex box, a WrapPanel a wrapping flex box, a Canvas child an absolutely
positioned box, a Grid or UniformGrid a CSS grid, a TextBlock a text node.

```sh
silk build --release --manifest-path modules/bench/silk.toml
build/llvm/<target>/release/ui-bench                  # every benchmark (a few minutes)
build/llvm/<target>/release/ui-bench Propagation Text # names containing either part
build/llvm/<target>/release/ui-bench --quick          # shorter samples
build/llvm/<target>/release/ui-bench --smoke          # each benchmark once, nothing measured
```

Measure an optimized build on a quiet machine, and compare runs of two builds on the same
machine rather than numbers from different machines. The benchmarks are not part of CI: hosted
runners are too noisy for them, and `--smoke` is enough to show that every scenario still builds
and runs.

## The harness

A benchmark is a value with a `prepare` step, not timed, and a `body`, timed. A pilot run finds
how many operations fill a sample (100 ms, 20 ms with `--quick`; at most four times that in wall
time when the prepare step dominates), then two warm-up samples and nine measured ones (one and
five with `--quick`) follow. The table has the median and the least time of one operation, and
the operations of a sample.

## What an operation includes

Where FerroUI's operation leaves work for the layout pass after it, the operation here includes
that layout, so it measures at least as much work:

| Benchmark | Operation |
| --- | --- |
| `trees::Lifetime.build` | Make a detached wall of 2,000 tiles (12,000 nodes) |
| `trees::Lifetime.attach` | Append the built wall under the root |
| `trees::Lifetime.attach_top_down` | Append each tile to an attached canvas, then its parts under it |
| `trees::Lifetime.lay_out` | Resolve styles and lay out a wall that was attached and never laid out |
| `trees::Lifetime.detach` | Remove a laid-out wall from the root, and lay the root out |
| `trees::Lifetime.clear` | Destroy the tiles of a detached wall |
| `trees::Lifetime.first_frame` | Styles, layout and paint of a newly attached wall (no FerroUI counterpart) |
| `trees::Propagation.*` | Change an inherited property (font family, weight, size, colour, `visibility`, `direction`) on the wall's canvas, and lay out |
| `trees::Text.create_and_measure` | Make 2,000 five-digit labels, lay them out and read their widths |
| `trees::Text.change_and_lay_out` | Change the text of each of 2,000 labels in a column, and lay out |
| `trees::Text.narrow_and_lay_out` | Change the width of a wrapping panel of 500 paragraphs by 20 px, and lay out |
| `trees::Text.ellipsis_long_line` | Change one character of a 360 KB one-line text cut with an ellipsis in a 200 px box, and draw a frame (not a FerroUI scenario) |
| `layout_subsystem::PanelMeasureArrange.*` | Forget every kept layout result of a panel of 1,000 leaves and lay it out again |
| `layout_subsystem::Invalidation.resize_one_leaf` | Make one of 4,000 leaves 1 px wider or narrower, and lay out |
| `layout_subsystem::Invalidation.measure_every_leaf` | Forget every kept layout result of the 4,000 leaves and lay out |
| `layout_subsystem::NestedDepth.*` | 200 nested boxes: lay out from scratch, or after the innermost one changed width |
| `layout_subsystem::SizeChange.*` | The root goes from 1,280 to 960 px wide or back, over 1,000 leaves, and lay out |
| `declarative::ViewBenchmark.*` | Model change, `view`, diff and the tree applying the mutations, on 1,000 keyed rows or 2,600 cells (`lazy` for memoized) |

FerroUI's DockPanel, the element-level properties of its property system (bindings, styled and
direct properties, resource dictionaries), XAML parsing and its themes have no silkui counterpart
and are left out.

## Stylesheet rows

`stylesheets::{Inline,Tailwind}.{create,idle,change_class,hover,theme}[Rows=1000]`
compares the same rows expressed through typed style objects and Tailwind classes. Each row
has a box and a text node. A class change changes the first row's padding, hover changes its
background, and a theme switch changes every row's background and text color. The theme and
idle cases also run with 5,000 rows. Each case checks the first and last row's resulting styles.
Frames include style resolution, layout and painting.

`RegisteredTailwind` runs the same seven Tailwind scenarios with a second compiled sheet,
`fixtures/registered.css`. It adds a non-inheriting registered length, declares it on each row,
and reads it for the unchanged 8 px gap. This exercises both registration-default isolation and
repeated custom-property scopes without changing row geometry or visual results. The compiler
script regenerates both binary fixtures.

The Tailwind fixture includes preflight and was generated with `tailwindcss@4.3.5` and
`@tailwindcss/cli@4.3.5` from `fixtures/rows.input.css`. The benchmark embeds `rows.sheet`:
there is no stylesheet compilation in the measured program. To regenerate after a CSS or
compiled-format change, run the pinned Tailwind CLI and the matching Vite compiler from the
repository root:

```sh
tailwindcss -i modules/bench/fixtures/rows.input.css -o modules/bench/fixtures/rows.css
node modules/bench/scripts/compile-stylesheet.mjs
```

The compiler reports unsupported browser-specific preflight form-control rules; these do not
select the benchmark's boxes or text nodes. Keep these diagnostics visible when regenerating.

Use optimized builds and Callgrind instruction counts for comparisons:

```sh
valgrind --tool=callgrind --callgrind-out-file=/dev/null \
  build/llvm/x86_64-unknown-linux-gnu/release/ui-bench --smoke \
  'stylesheets::Tailwind.change_class[Rows=1000]'
```

`--smoke` executes the operation once. Callgrind's process total includes fixture construction,
font loading, sheet decoding/adoption, initial layout and the harness, even though the wall-time
column excludes preparation. Record that total and subtract the corresponding `idle` process
count to estimate an update's additional instructions. Use the same row count, build and machine
for both runs. The difference still includes the operation's dispatch, verification and reporting;
it is not a pure selector-matching measurement.

### Initial instruction counts

Measured on x86-64 Linux with Silk `0.1.0-dev.74+205aea3f5b2e`, LLVM 22.1.8,
`--release`, and Valgrind 3.24.0. The original controls use SilkUI `9f7ea7e5`; the
stylesheet implementation uses `2696d56b`. Counts include the whole process as described above.
The stylesheet benchmark source and compiled fixture are in this directory.

| Style-object control | Original | Stylesheet branch | Change |
| --- | ---: | ---: | ---: |
| `trees::Lifetime.first_frame[Tiles=2000]` | 457,904,947 | 457,511,474 | -0.09% |
| `layout_subsystem::Invalidation.resize_one_leaf[Leaves=4000]` | 120,463,174 | 120,562,986 | +0.08% |

| Rows | Operation | Inline total | Tailwind total | Inline minus idle | Tailwind minus idle |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1,000 | create | 80,912,149 | 279,813,077 | — | — |
| 1,000 | idle | 82,707,013 | 281,611,959 | — | — |
| 1,000 | change_class | 86,589,615 | 491,384,170 | 3,882,602 | 209,772,211 |
| 1,000 | hover | 83,965,580 | 486,524,966 | 1,258,567 | 204,913,007 |
| 1,000 | theme | 93,113,998 | 516,668,084 | 10,406,985 | 235,056,125 |
| 5,000 | idle | 394,602,575 | 1,380,793,199 | — | — |
| 5,000 | theme | 446,210,353 | 2,555,360,736 | 51,607,778 | 1,174,567,537 |

These are the conservative full-root restyle baseline, before style sharing and dependency-based
invalidation. Local class and hover changes currently repeat work across all rows. The results
do not meet the target of similar per-frame cost to inline styles. The 5,000-row theme case
contains 10,000 row/text nodes; instruction counts alone do not establish a 16 ms frame budget.
Creation does not subtract idle because idle includes a separate initial frame.

### Cascade-result cache

SilkUI `8ed26e07` adds a cache of up to 128 repeated cascade results per root style pass.
Keys compare candidate identities and priorities, inline declarations, variable scope and parent.
Hits skip variable substitution and declaration resolution; each node still matches selectors and
receives its own declarations. Starting-style resolution and inspector overrides bypass the cache.
The cache resets with variable scopes. This does not yet share per-node storage or prune restyles.

The same optimized benchmark and toolchain produce these counts:

| Rows | Operation | Inline total | Cached Tailwind total | Inline minus idle | Cached Tailwind minus idle | Reduction in Tailwind update |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 | create | 80,938,152 | 135,848,496 | — | — | — |
| 1,000 | idle | 82,732,956 | 137,649,368 | — | — | — |
| 1,000 | change_class | 86,567,985 | 203,687,217 | 3,835,029 | 66,037,849 | 68.5% |
| 1,000 | hover | 83,991,594 | 200,837,283 | 1,258,638 | 63,187,915 | 69.2% |
| 1,000 | theme | 93,186,788 | 208,470,787 | 10,453,832 | 70,821,419 | 69.9% |
| 5,000 | idle | 394,659,840 | 662,360,199 | — | — | — |
| 5,000 | theme | 446,501,891 | 1,014,881,073 | 51,842,051 | 352,520,874 | 70.0% |

The style-object controls are 457,658,860 (-0.05% from the original) and 120,512,286 (+0.04% from the original),
respectively. Local stylesheet updates still cost substantially more than inline updates.
The next performance work is sharing variable scopes and resolved storage, plus dependency-based
invalidation; these numbers do not establish a frame-time budget.
