import { EditorView } from '@codemirror/view'

// No vertical margins anywhere in here (or on widget roots): CodeMirror measures each line and
// block widget by its border box, so a margin is height its height map never sees. Every one
// shifts where clicks and Up/Down land for everything below it, and they add up (a note with a
// few code blocks resolved clicks four lines too low). Use padding, a transparent border with
// `backgroundClip: 'padding-box'`, or a wrapper element instead; theme.test.ts enforces this.
const BLOCK_GAP = '0.4em'
// Horizontal radius / vertical radius (CSS `<h> <v>`): the transparent border eats BLOCK_GAP of
// the vertical one.
const BLOCK_RADIUS = `0.5rem calc(0.5rem + ${BLOCK_GAP})`

export const EDITOR_THEME_SPEC = {
  // @uiw/react-codemirror's own dimension theme sets `min-height` on `&` (.cm-editor) for the
  // `minHeight` prop, but relies on `.cm-scroller { height: 100% }` to fill it — a percentage
  // height can't resolve against an ancestor whose height comes only from min-height (not a
  // definite `height`), so .cm-scroller silently collapses to content size on short documents.
  // That mismatch (a tall .cm-editor, a short .cm-scroller) is what made the cursor-drawing
  // layer compute a degenerate zero-size rect — invisible cursor — reproduced on any line, not
  // just blank ones (blank lines just make an invisible cursor more noticeable, with nothing
  // else on the line to anchor the eye). Flex with an explicit flex-basis sidesteps the
  // percentage-height resolution issue entirely, regardless of how .cm-editor's height was set.
  // Font size is a CSS custom property (set inline per-render via dynamicAttributes below,
  // see the comment there) rather than baked into this rule directly, since this object is a
  // stable module-level singleton shared by every render/instance.
  '&': {
    fontSize: 'var(--note-font-size, 0.9375rem)',
    backgroundColor: 'transparent',
    display: 'flex',
    flexDirection: 'column',
  },
  // flex-basis: 0 (rather than `auto`) tells the browser this item's *hypothetical* size is 0
  // for the purpose of sizing its auto-height flex container — so `.cm-editor` was resolving to
  // exactly `min-height` no matter how tall the actual content was, and `.cm-scroller` (bounded
  // to that same height, with the base theme's default `overflow: auto`) grew its own internal
  // scrollbar instead of the page ever needing to scroll. `flex-basis: auto` makes the
  // hypothetical size track real content height, so `.cm-editor` still gets stretched up to
  // `min-height` by flex-grow on a short document (fixing the bug above), but grows past it on a
  // long one instead of clipping — the page scrolls, not the editor.
  '.cm-scroller': { flex: '1 1 auto', overflow: 'visible' },
  '.cm-content': { padding: 0, fontFamily: 'var(--font-sans)' },
  '.cm-line': { padding: 0 },
  '&.cm-editor.cm-focused': { outline: 'none' },
  '&.cm-live-focused .cm-cursor, &.cm-live-focused .cm-dropCursor': {
    display: 'block',
    // `drawSelection({ cursorBlinkRate: 0 })` sets `animation-duration: 0ms` on the cursor's
    // `cm-blink` keyframe animation (steps(1), infinite) rather than removing it — whether a
    // zero-duration infinite step animation resolves to its visible or invisible keyframe is a
    // browser-specific edge case (`@keyframes cm-blink` toggles opacity at its 50% step), so
    // relying on duration alone was fragile. `animation: none` removes the animation outright,
    // guaranteeing a static, always-visible cursor regardless of that resolution.
    animation: 'none',
    opacity: 1,
    borderLeftColor: 'var(--foreground)',
    borderLeftWidth: '2px',
  },
  // A 1px rule: the background is clipped to the content box, the padding is the spacing.
  '.cm-hr': {
    display: 'block',
    height: '1px',
    padding: '0.6em 0',
    boxSizing: 'content-box',
    backgroundColor: 'var(--border)',
    backgroundClip: 'content-box',
  },
  // The wrapper's padding spaces the image, so its own rounded corners stay intact.
  '.cm-image-wrap': { display: 'block', padding: '0.4em 0' },
  '.cm-image': {
    display: 'block',
    maxWidth: '100%',
    borderRadius: '0.5rem',
  },
  // ![[file]] embeds (markdown-editor/embedWidgets.ts).
  // Heading folds (markdown-editor/folding.ts): the chevron sits in the gutter left of the
  // heading (`.cm-heading` is position: relative below), absolutely positioned so it never shifts
  // the text. Shown on hover, always if folded.
  '.cm-fold-chevron': {
    position: 'absolute',
    left: '-1.4em',
    top: '50%',
    width: '1.2em',
    height: '1.2em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '0.25rem',
    color: 'var(--muted-foreground)',
    fontSize: '1rem',
    fontWeight: 'normal',
    lineHeight: 1,
    cursor: 'pointer',
    opacity: 0,
    transform: 'translateY(-50%) rotate(90deg)',
    transition: 'opacity 120ms ease, transform 120ms ease',
    userSelect: 'none',
  },
  '.cm-heading:hover .cm-fold-chevron, .cm-fold-chevron-folded': { opacity: 1 },
  '.cm-fold-chevron:hover': { backgroundColor: 'var(--muted)', color: 'var(--foreground)' },
  '.cm-fold-chevron-folded': { transform: 'translateY(-50%)' },
  '.cm-foldPlaceholder': {
    display: 'inline-block',
    padding: '0 0.4em',
    marginLeft: '0.4em',
    border: '1px solid var(--border)',
    borderRadius: '0.375rem',
    backgroundColor: 'var(--muted)',
    color: 'var(--muted-foreground)',
    fontSize: '0.75em',
    fontWeight: 'normal',
    verticalAlign: 'middle',
    cursor: 'pointer',
  },
  '.cm-embed-wrap': { padding: '0.6em 0' },
  '.cm-embed': {
    border: '1px solid var(--border)',
    borderRadius: '0.75rem',
    overflow: 'hidden',
    backgroundColor: 'var(--card)',
  },
  '.cm-embed-header': {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.4rem 0.75rem',
    borderBottom: '1px solid var(--border)',
    fontSize: '0.8125rem',
    whiteSpace: 'normal',
  },
  // Collapsible embeds (#38): the chevron points down when open, right when collapsed.
  '.cm-embed-toggle': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '1.25rem',
    height: '1.25rem',
    padding: 0,
    border: 0,
    borderRadius: '0.25rem',
    background: 'transparent',
    color: 'var(--muted-foreground)',
    fontSize: '1rem',
    lineHeight: 1,
    cursor: 'pointer',
    transform: 'rotate(90deg)',
    transition: 'transform 120ms ease',
  },
  '.cm-embed-toggle:hover': { backgroundColor: 'var(--muted)', color: 'var(--foreground)' },
  '.cm-embed-collapsed .cm-embed-toggle': { transform: 'none' },
  '.cm-embed-collapsed .cm-embed-header': { borderBottom: '0' },
  '.cm-embed-name': { flex: '1', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '.cm-embed-header a': { color: 'var(--muted-foreground)', textDecoration: 'underline', textUnderlineOffset: '2px' },
  '.cm-embed-pdf iframe': { display: 'block', width: '100%', height: '70vh', border: '0' },
  '.cm-embed-video video': { display: 'block', width: '100%', maxHeight: '70vh', backgroundColor: 'black' },
  '.cm-embed-audio audio': { display: 'block', width: '100%' },
  '.cm-embed-chip': {
    display: 'inline-block',
    padding: '0 0.45em',
    border: '1px solid var(--border)',
    borderRadius: '0.375rem',
    backgroundColor: 'var(--muted)',
    fontSize: '0.875em',
    color: 'inherit',
    textDecoration: 'none',
  },
  '.cm-embed-missing': { color: 'var(--muted-foreground)', fontStyle: 'italic' },
  '.cm-table-wrap': { padding: '0.4em 0' },
  '.cm-table': {
    borderCollapse: 'collapse',
    // 'auto' (centered) or '0px' (left), set by MarkdownEditor's buildDynamicAttributes.
    margin: '0 var(--note-table-margin-x, 0px)',
    fontSize: '0.9em',
  },
  '.cm-table th, .cm-table td': {
    border: '1px solid var(--border)',
    padding: '0.3em 0.6em',
    textAlign: 'left',
  },
  '.cm-table th': {
    fontWeight: '600',
    backgroundColor: 'var(--muted)',
  },
  '.cm-heading': { fontWeight: '600', position: 'relative' },
  '.cm-h1': { fontSize: '1.6em' },
  '.cm-h2': { fontSize: '1.35em' },
  '.cm-h3': { fontSize: '1.15em' },
  '.cm-h4, .cm-h5, .cm-h6': { fontSize: '1em' },
  '.cm-em': { fontStyle: 'italic' },
  '.cm-strong': { fontWeight: '600' },
  '.cm-strike': { textDecoration: 'line-through' },
  '.cm-inline-code': {
    fontFamily: 'ui-monospace, monospace',
    fontSize: '0.875em',
    backgroundColor: 'var(--muted)',
    borderRadius: '0.25rem',
    padding: '0.05em 0.3em',
  },
  '.cm-codeblock': {
    fontFamily: 'ui-monospace, monospace',
    fontSize: '0.875em',
    backgroundColor: 'var(--muted)',
    backgroundClip: 'padding-box',
    padding: '0 0.75rem',
  },
  // The gap outside the box is a transparent border (inside the measured box, unlike a margin);
  // the vertical corner radius grows by the border so the visible corners stay 0.5rem.
  '.cm-codeblock-start': {
    borderTop: `${BLOCK_GAP} solid transparent`,
    borderTopLeftRadius: BLOCK_RADIUS,
    borderTopRightRadius: BLOCK_RADIUS,
    paddingTop: '0.5rem',
  },
  '.cm-codeblock-end': {
    borderBottom: `${BLOCK_GAP} solid transparent`,
    borderBottomLeftRadius: BLOCK_RADIUS,
    borderBottomRightRadius: BLOCK_RADIUS,
    paddingBottom: '0.5rem',
  },
  '.cm-code-lang': {
    color: 'var(--muted-foreground)',
    fontSize: '0.75em',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  '.cm-quote': {
    borderLeft: '2px solid var(--border)',
    paddingLeft: '0.75rem',
    color: 'var(--muted-foreground)',
  },
  // Callout lines; `--callout-accent` comes from the `callout-<type>` class (index.css), shared
  // with MarkdownView's `.callout`.
  // Same transparent-border gap as code blocks; the accent stripe is an inset shadow so it stays
  // inside the padding box rather than running up into the gap like a left border would.
  '.cm-callout': {
    backgroundColor: 'color-mix(in oklab, var(--callout-accent) 10%, transparent)',
    backgroundClip: 'padding-box',
    boxShadow: 'inset 3px 0 0 var(--callout-accent)',
    padding: '0 0.9rem 0 calc(0.9rem + 3px)',
  },
  '.cm-callout-start': {
    borderTop: `${BLOCK_GAP} solid transparent`,
    borderTopRightRadius: BLOCK_RADIUS,
    borderTopLeftRadius: BLOCK_RADIUS,
    paddingTop: '0.5rem',
  },
  '.cm-callout-end': {
    borderBottom: `${BLOCK_GAP} solid transparent`,
    borderBottomRightRadius: BLOCK_RADIUS,
    borderBottomLeftRadius: BLOCK_RADIUS,
    paddingBottom: '0.5rem',
  },
  '.cm-callout-title': { fontWeight: '600', color: 'var(--callout-accent)' },
  '.cm-callout-marker': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4em',
    marginRight: '0.4em',
    verticalAlign: '-0.125em',
  },
  '.cm-callout-marker svg': { width: '1em', height: '1em' },
  // .cm-content is `white-space: pre-wrap`, which would turn the "\n" text nodes react-markdown
  // emits between elements into blank lines.
  '.cm-columns': { cursor: 'text', whiteSpace: 'normal' },
  '.cm-wikilink': {
    textDecoration: 'underline',
    textDecorationColor: 'var(--border)',
    textUnderlineOffset: '2px',
    cursor: 'pointer',
  },
  '.cm-link': {
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
    color: 'var(--primary)',
    cursor: 'pointer',
  },
  '.cm-highlight': {
    backgroundColor: 'var(--note-highlight)',
    borderRadius: '0.2em',
    padding: '0.05em 0',
  },
  '.cm-list-bullet': { color: 'var(--muted-foreground)' },
  '.cm-list-number': { color: 'var(--muted-foreground)' },
  // Mirrors components/ui/checkbox.tsx (size-4, rounded-[4px], border-input, checked = primary).
  '.cm-task-checkbox': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '1rem',
    height: '1rem',
    marginRight: '0.5em',
    verticalAlign: '-0.15em',
    border: '1px solid var(--input)',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 150ms, border-color 150ms',
  },
  '.cm-task-checkbox[aria-checked="true"]': {
    backgroundColor: 'var(--primary)',
    borderColor: 'var(--primary)',
    color: 'var(--primary-foreground)',
  },
  '.cm-task-checkbox svg': {
    width: '0.875rem',
    height: '0.875rem',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '2',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
  '.cm-task-done': {
    color: 'var(--muted-foreground)',
    textDecoration: 'line-through',
  },
  // The `/` menu, styled like the app's Radix popovers rather than CodeMirror's defaults.
  '.cm-tooltip.cm-tooltip-autocomplete': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
    borderRadius: '0.5rem',
    boxShadow: '0 8px 24px rgb(0 0 0 / 0.12)',
    padding: '0.25rem',
    fontFamily: 'var(--font-sans)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    maxHeight: '18rem',
    minWidth: '14rem',
    fontFamily: 'inherit',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    display: 'flex',
    alignItems: 'baseline',
    padding: '0.3rem 0.5rem',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-foreground)',
  },
  '.cm-completionDetail': {
    marginLeft: 'auto',
    paddingLeft: '1rem',
    fontStyle: 'normal',
    fontSize: '0.75rem',
    color: 'var(--muted-foreground)',
  },
  // KaTeX's own CSS leaves color unset on the base glyphs, so they inherit this — no extra
  // dark-mode handling needed.
  '.cm-math-inline': { padding: '0 0.15em' },
  '.cm-math-block': {
    display: 'flex',
    justifyContent: 'center',
    padding: '0.6em 0',
    overflowX: 'auto',
  },
  '.cm-placeholder': { color: 'var(--muted-foreground)' },
} satisfies Parameters<typeof EditorView.theme>[0]

export const editorTheme = EditorView.theme(EDITOR_THEME_SPEC)
