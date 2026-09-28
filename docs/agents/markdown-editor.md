# MarkdownEditor (`frontend/src/components/MarkdownEditor.tsx`)

Obsidian-style *live preview* on `@uiw/react-codemirror` + `@codemirror/lang-markdown` (GFM extensions), used by `SubmodulePage`. Always editable, saves on blur. `sourceMode` (toggled in `SubmodulePage`'s header) just omits the live-preview extensions, leaving plain markdown.

## How live preview works

A `ViewPlugin` walks the Lezer syntax tree on every doc/selection change. Formatting marks (`MARK_NODES`: `HeaderMark`, `EmphasisMark`, `CodeMark`, `StrikethroughMark`, `QuoteMark`) are hidden with `Decoration.replace` on every line **except the cursor's line**; the surrounding node is styled unconditionally with `Decoration.mark`/`Decoration.line`. Every widget below follows the same cursor-line exemption. `basicSetup`'s `syntaxHighlighting` is off (its colors clash with the monochrome theme) in favor of hand-picked classes.

- `HeaderMark`/`QuoteMark` hiding extends through the trailing space too (`MARK_NODES_CONSUME_TRAILING_SPACE` / `skipTrailingSpace`), else "# Heading" renders as " Heading".
- `HorizontalRule` and `Image` become `HorizontalRuleWidget` / `ImageWidget`.
- `FencedCode`/`CodeBlock` get a per-line box (`cm-codeblock`, `-start`/`-end` for rounding) that stays visible regardless of cursor; only the fences hide. `CodeInfo` gets a muted `cm-code-lang` style.
- **Multi-line widgets live in their own `StateField`s, not the `ViewPlugin`**: CodeMirror forbids a `ViewPlugin` from providing block decorations or ones that replace line breaks. Hence `tableDecorations` (GFM `Table` → `TableWidget`) and `mathBlockDecorations` (`$$...$$`).
- `@lezer/common`'s `SyntaxNode` type isn't resolvable under this pnpm layout, so node shapes are typed locally (`WalkableNode`, `TableRowSource`).

### Regex-scanned syntax

Wikilinks and math aren't CommonMark/GFM, so there's no tree node; they're found by regex per visible range, skipping anything inside code (`isInsideCode`).

- **Wikilinks** (`WIKILINK_PATTERN`, `addWikilinkDecorations`): delimiters hide on unfocused lines. Cmd/Ctrl+click (`wikilinkClickHandler`) calls `onNavigateWikilink` → `resolveWikilink` → `GET /submodules/resolve`; unresolved is a silent no-op. `SubmodulePage.handleNavigateWikilink` must `await saveContent()` before `navigate()`: the click never blurs the editor, so unsaved edits would be lost on unmount.
- **Math** (`BLOCK_MATH_PATTERN`, `INLINE_MATH_PATTERN`): rendered with `katex.render` into the widget node (no HTML string to sanitize); falls back to plain text on parse error. Inline matches inside a block-math span are skipped (`findBlockMathRanges`) so `$$x$$` isn't also read as inline. Inline requires non-whitespace just inside both `$` so "$5 and $10" stays text.

## Gotchas

- **Focus is hand-tracked**, because `view.hasFocus`/`.cm-focused` never toggled reliably here (hidden cursor, line 1 marks stuck visible). A `focusedField` `StateField<boolean>` is set by a `StateEffect` from React's `onFocus`/`onBlur`, debounced one tick (a click can fire several focus/blur events, and each dispatch rebuilds decorations). An `editorAttributes` facet adds `cm-live-focused`; `buildDecorations` reads `state.field(focusedField, false)`.
- **Theme rules keyed on a class of the editor root need the `&` prefix** (`'&.cm-live-focused .cm-cursor'`). A bare selector gets an ancestor scope prepended by `EditorView.theme()` and can never match.
- **Never build `EditorView.theme()` per render.** Each new theme object mounts a permanent CSS rule that CodeMirror never removes, so stale rules compete in the cascade. Dynamic values (`fontSize`, `tableAlign` from `AppSettings`) go through `buildDynamicAttributes` as CSS custom properties (`--note-font-size`, `--note-table-margin-x`) in an inline `style` via `EditorView.editorAttributes`, read by the static `editorTheme` with `var(..., fallback)`.
- **The editor grows and the page scrolls.** `.cm-scroller` uses `flex: '1 1 auto'` plus `overflow: 'visible'`. With `flex-basis: 0` the editor resolved to exactly `minHeight` (70vh) and scrolled internally.
- Cursor blink is off (`drawSelection({ cursorBlinkRate: 0 })`; the facet takes `Math.min`, so 0 wins): on a blank line a blinking cursor reads as missing.
- Spellcheck goes through `EditorView.contentAttributes` (the wrapper has no prop reaching `.cm-content`), turned back off per `InlineCode` node and per code-block line.

## Keybinds and slash commands

- `buildFormattingKeymap(keybinds)` (`Prec.highest`) maps `AppSettings.keybind_*` (fallback `DEFAULT_KEYBINDS` in `lib/keybinds.ts`: `Mod-b`/`Mod-i`/`Mod-e`/`Mod-Shift-k`) to `toggleWrapCommand`. Rebuilt per render since bindings are user-configurable; `keymap.of()` has no stylesheet cost. Mod-K is never the wikilink default: browsers eat it.
- Slash commands (`\bold`, `\link`, `\code`, `\codeblock`, `\image`, `\table<N>x<M>`) expand on Space/Enter via `runSlashCommand` in the module-level `slashCommandKeymap` (`Prec.highest`). It matches `SLASH_TRIGGER_PATTERN` before an empty cursor, skips code, and deletes+inserts in one dispatch (one undo step). Simple ones are table-driven (`SIMPLE_SLASH_COMMANDS`, `{before, after}`). `\table` (`TABLE_SLASH_PATTERN`, max `MAX_TABLE_DIMENSION` = 12) builds N columns × M data rows plus header via `buildTableMarkdown`, selecting `"Header 1"`.
- Empty table cells must contain `EMPTY_CELL` (U+200B): Lezer emits no `TableCell` for an all-whitespace cell, so rows silently lose their cells. U+200B survives `.trim()`.
