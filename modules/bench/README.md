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

### Complete runtime measurements

The runtime with font metrics, generated content, container queries and motion retains a direct
path for typed pixel/percentage styles that need no ordered resolution. Context-dependent values,
font features, transforms, motion, sheets and inspector overrides use the full resolver. Both
paths apply the same `Computed` property implementation.

Measured on x86-64 Linux with Silk `0.1.0-dev.74+205aea3f5b2e`, LLVM 22.1.8,
`--release` and Valgrind 3.24.0. Executable SHA-256:
`59c61a512c558b7e1af145cba778364ccb7c47ea4d864b0f02dc5b4f9d5cb18e`.
The runtime changes are in SilkUI `09bac4c8`; local runtime sources were used for all UI and
Loom dependencies in this measurement. The original executable uses SilkUI `9f7ea7e5`; its
benchmark controls are unchanged.

| Style-object control | Original | Complete runtime | Change |
| --- | ---: | ---: | ---: |
| `trees::Lifetime.first_frame[Tiles=2000]` | 457,904,947 | 457,458,253 | -0.10% |
| `layout_subsystem::Invalidation.resize_one_leaf[Leaves=4000]` | 120,463,174 | 120,040,356 | -0.35% |

| Rows | Operation | Inline total | Tailwind total | Registered Tailwind total |
| ---: | --- | ---: | ---: | ---: |
| 1,000 | create | 81,266,414 | 143,628,899 | 148,743,901 |
| 1,000 | idle | 83,061,643 | 145,434,474 | 150,548,606 |
| 1,000 | change_class | 86,964,458 | 149,606,430 | 154,715,369 |
| 1,000 | hover | 84,358,218 | 146,975,031 | 152,117,399 |
| 1,000 | theme | 93,133,768 | 222,107,928 | 231,117,148 |
| 5,000 | idle | 396,356,459 | 697,985,388 | 725,333,043 |
| 5,000 | theme | 446,291,329 | 1,079,852,638 | 1,125,260,826 |

| Rows | Update minus corresponding idle | Inline | Tailwind | Registered Tailwind |
| ---: | --- | ---: | ---: | ---: |
| 1,000 | change_class | 3,902,815 | 4,171,956 | 4,166,763 |
| 1,000 | hover | 1,296,575 | 1,540,557 | 1,568,793 |
| 1,000 | theme | 10,072,125 | 76,673,454 | 80,568,542 |
| 5,000 | theme | 49,934,870 | 381,867,250 | 399,927,783 |

All 21 stylesheet cases pass their computed-result checks. Local class and hover changes keep
the narrow invalidation path. Theme changes still rebuild scopes and cascade results throughout
the tree and cost substantially more than inline updates. These process-count differences include
operation dispatch, verification and reporting; they do not measure selector matching alone or
establish a 16 ms frame budget. The 5,000-row scene has 10,001 total nodes including text and root.

### Retained stylesheet storage

Measured on the same x86-64 layout at runtime revision `514fa523`. After the idle frame,
sum `sizeof(Resolved)` for each resolved node plus the capacities of its declaration,
matched-rule and keyframe arrays multiplied by their element sizes. This is a retained-storage
lower bound, not total heap use or RSS: it excludes nested value allocations, selector identity
and class storage, root caches, allocator headers and the base tree.

| Fixture | Rows | Total nodes | Resolved nodes | Fixed records | Declaration arrays | Matched-rule arrays | Lower bound |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Inline | 1,000 | 2,001 | 0 | 0 | 0 | 0 | 0 B |
| Tailwind | 1,000 | 2,001 | 1,001 | 224,224 | 4,610,304 | 128,064 | 4,962,592 B |
| Tailwind | 5,000 | 10,001 | 5,001 | 1,120,224 | 23,042,304 | 640,064 | 24,802,592 B |
| Registered Tailwind | 1,000 | 2,001 | 1,001 | 224,224 | 4,610,304 | 256,064 | 5,090,592 B |

Keyframe-array capacities are zero in these fixtures. The 64 B per-node target is not met:
the lower bound is about 2,480 B per total node for Tailwind, before identity and class costs.
Each resolved record alone occupies 224 B. At this revision nodes owned cloned winning
declarations; [Shared sibling styles](#shared-sibling-styles) replaces that with shared records. The 1,000-row Tailwind fixture additionally retains 400,000 B
of fixed selector identities and 231,000 B of class string/atom capacity, excluded above.

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

### Registered variable scopes

lib-css `927ddab6` shares immutable variable scopes for identical parent and stylesheet custom-property
inputs, including `inherits: false` registration defaults. The cache holds up to 128 input sets,
resets with scopes, and includes computation limits in its keys. Inline custom properties retain
their own scopes. Shared scope identities allow the cascade-result cache to serve repeated rows.

These measurements use the `RegisteredTailwind` fixture from SilkUI `84113a8`. Before uses
lib-css `78c6b41d` with the cascade cache already enabled; after uses lib-css `927ddab6` through
SilkUI `6d1991cd`. The benchmark source, compiler flags and toolchain are the same.

| Rows | Operation | Before total | After total | Before minus idle | After minus idle | Update reduction |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 | create | 307,967,872 | 142,418,032 | — | — | — |
| 1,000 | idle | 309,770,944 | 144,217,212 | — | — | — |
| 1,000 | change_class | 547,652,811 | 215,762,832 | 237,881,867 | 71,545,620 | 69.9% |
| 1,000 | hover | 544,435,704 | 213,294,310 | 234,664,760 | 69,077,098 | 70.6% |
| 1,000 | theme | 571,532,150 | 218,862,796 | 261,761,206 | 74,645,584 | 71.5% |
| 5,000 | idle | 1,518,218,255 | 692,537,616 | — | — | — |
| 5,000 | theme | 2,818,685,798 | 1,061,913,776 | 1,300,467,543 | 369,376,160 | 71.6% |

The style-object controls are 457,518,423 (-0.08% from the original) and 120,562,315 (+0.08% from the original),
respectively. All 21 stylesheet cases pass their result checks. Full-root matching and per-node
declaration storage remain; narrower invalidation and shared resolved storage are still needed.

### Incremental class and pointer updates

SilkUI `3c71534` with lib-css `9b3915e` uses selector dependency sets to keep ordinary
class changes and pointer states within the affected subtree. Candidate state masks include
rules whose state test failed, so entering a state still invalidates the right nodes. Relational
selectors, variable inputs and display changes retain the full-root fallback. Cached variable
scopes survive partial passes; inline custom properties and cache pressure force a full reset.
Cascade results reset each pass so inherited computed values cannot reuse stale declarations.

Measured with the same optimized toolchain and fixtures as above:

| Rows | Operation | Inline total | Tailwind total | Registered Tailwind total |
| ---: | --- | ---: | ---: | ---: |
| 1,000 | create | 80,959,752 | 136,256,139 | 142,756,062 |
| 1,000 | idle | 82,754,653 | 138,057,521 | 144,556,710 |
| 1,000 | change_class | 86,588,875 | 142,169,607 | 148,656,219 |
| 1,000 | hover | 84,013,294 | 139,544,976 | 146,066,078 |
| 1,000 | theme | 93,190,136 | 209,001,593 | 219,395,985 |
| 5,000 | idle | 394,759,537 | 663,861,058 | 692,442,323 |
| 5,000 | theme | 446,509,267 | 1,017,129,212 | 1,062,871,865 |

Subtracting each build's corresponding idle total gives these update estimates. Before uses
SilkUI `6d1991cd` with scope sharing already enabled; after uses `3c71534`.

| Rows | Operation | Tailwind before | Tailwind after | Reduction | Registered before | Registered after | Reduction |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | change_class | 65,643,322 | 4,112,086 | 93.7% | 71,545,620 | 4,099,509 | 94.3% |
| 1,000 | hover | 62,816,454 | 1,487,455 | 97.6% | 69,077,098 | 1,509,368 | 97.8% |
| 1,000 | theme | 70,726,269 | 70,944,072 | -0.3% | 74,645,584 | 74,839,275 | -0.3% |
| 5,000 | theme | 351,995,000 | 353,268,154 | -0.4% | 369,376,160 | 370,429,542 | -0.3% |

The style-object controls are 457,598,505 (-0.07% from the original) and
120,607,214 (+0.12%), respectively. All 21 stylesheet result checks pass.
Theme changes still traverse the rows, and each node still owns its resolved declarations.
These instruction counts do not establish the frame-time or 64-byte per-node memory budgets.

### Shared sibling styles

Nodes now hold their matched style behind a shared immutable record. The per-pass cascade cache
returns that record instead of cloning its declarations, and a box whose tag, classes,
attributes, states and style objects equal its previous sibling's takes the sibling's record
without matching selectors again. The shortcut is off for a root whose sheets contain a sibling
combinator, a positional pseudo-class, `:empty` or `:has()`, for elements with an id or inline
custom properties, and while `@starting-style` or inspector overrides apply; those elements
still share through the cascade cache after matching.

Measured with the same toolchain, machine and fixtures as above. Executable SHA-256:
`a7b5f9ab456c4f7cf38a253f63fe5cb61f6f470b4bebf4515bf12a770aed3543`; local runtime sources
were used for all UI and Loom dependencies.

| Rows | Operation | Inline total | Tailwind total | Registered Tailwind total |
| ---: | --- | ---: | ---: | ---: |
| 1,000 | create | 81,617,375 | 95,566,305 | 95,279,779 |
| 1,000 | idle | 83,422,892 | 97,382,729 | 97,093,531 |
| 1,000 | change_class | 87,399,257 | 101,609,428 | 101,267,809 |
| 1,000 | hover | 84,729,837 | 98,926,251 | 98,660,257 |
| 1,000 | theme | 93,545,358 | 120,747,588 | 119,997,597 |
| 5,000 | idle | 398,003,617 | 461,305,583 | 458,851,167 |
| 5,000 | theme | 448,183,656 | 576,323,843 | 571,480,301 |

| Rows | Update minus corresponding idle | Inline | Tailwind | Registered Tailwind |
| ---: | --- | ---: | ---: | ---: |
| 1,000 | change_class | 3,976,365 | 4,226,699 | 4,174,278 |
| 1,000 | hover | 1,306,945 | 1,543,522 | 1,566,726 |
| 1,000 | theme | 10,122,466 | 23,364,859 | 22,904,066 |
| 5,000 | theme | 50,180,039 | 115,018,260 | 112,629,134 |

Creating 1,000 Tailwind rows costs 17% more than inline rows (was 77%), and a theme change costs
2.3 times the inline update (was 7.6 times). The style-object controls are 459,216,121 and
120,533,059. All 21 stylesheet result checks pass.

The 1,001 resolved nodes of the 1,000-row fixture now hold two records, one for the root and one
shared by every row, plus one pointer per node. Peak heap for the idle case, from Valgrind Massif,
is 21,386,398 B for Tailwind and 21,450,510 B for inline at 1,000 rows, and 118,940,318 B and
121,060,430 B at 5,000 rows, so the retained-storage difference of the earlier section is gone
for repeated rows. Elements with distinct cascade inputs still own one record each.

What remains of the theme cost is applying each row's roughly 40 winning declarations to its
computed style (about 9,500 instructions per row) and the rest of the per-node style pass; rows
do not share computed values. Unshared elements still pay full selector matching, about 22,000
instructions each in this fixture.
