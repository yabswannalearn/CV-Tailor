# Spot Edits resolve PDF selections to Blocks by text matching, not by coordinates

A Spot Edit starts as a text selection in the rendered PDF and has to end up addressing a **Block** in the LaTeX source. We resolve that by normalising the selected string and fuzzy-matching it against the plain text of the ~20–40 Blocks parsed out of the current LaTeX (`frontend/src/lib/resumeDraft.ts`), using the text layer's page and vertical offset only to break ties between near-identical Blocks. We are not mapping PDF coordinates back to source positions.

## Considered options

**SyncTeX** (`tectonic --synctex`, store the artifact, map click coordinates → `.tex` line → Block) is the textbook answer and was rejected for three reasons. It resolves to a *line*, so it still needs the Block parser afterwards — it is strictly extra infrastructure in front of the same final step. It breaks whenever `apply_single_page_autofit` rewrites the LaTeX after compilation, because the stored artifact then describes a document that no longer exists. And it makes every compile heavier for a feature used on a minority of compiles.

**Rendering the preview as HTML** so each Block is a real DOM element with an id would make selection trivial, but Tectonic is the renderer that defines the **one-page rule**. An HTML preview would disagree with the PDF about where pages break, which is the one thing this product cannot be wrong about.

## Consequences

The matching space is bounded and tiny — this is picking one of ~30 known strings, not searching a document — so accuracy is high and the failure mode is cheap and visible: the wrong Block highlights and the user re-selects. Nothing is silently mis-edited.

The load-bearing consequence is that **Blocks must have a stable address and a single document order**. `parseResumeDraft` today exposes three disjoint address spaces (`bullets[]` by global `\resumeItem` index, `entries[]` by command occurrence, `details[]` by index) with no ordering between them. Multi-Block Spot Edits require flattening these into one ordered list; that flattening is a prerequisite, not an optimisation.

It also means the resolution layer is coupled to `latexText()`'s normalisation. If that function's stripping changes, matching accuracy moves with it.
