import { useEffect, useRef } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { globalCompletion, localCompletionSource, python } from "@codemirror/lang-python";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { tags } from "@lezer/highlight";
import { api } from "../../lib/api";

/** Atelier colours, read from the app's tokens: the editor follows the theme. */
const theme = EditorView.theme({
  "&": {
    height: "100%",
    color: "rgb(var(--eu-ink))",
    backgroundColor: "rgb(var(--eu-panel))",
    fontSize: "var(--text-code)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.6" },
  ".cm-content": { caretColor: "rgb(var(--eu-ink))", padding: "8px 0" },
  ".cm-cursor": { borderLeftColor: "rgb(var(--eu-ink))", borderLeftWidth: "2px" },
  ".cm-gutters": {
    backgroundColor: "rgb(var(--eu-panel))",
    color: "rgb(var(--eu-ink-faint))",
    border: "none",
    borderRight: "1px solid var(--color-line)",
  },
  ".cm-activeLine": { backgroundColor: "var(--color-hover)" },
  ".cm-activeLineGutter": { backgroundColor: "var(--color-hover)", color: "rgb(var(--eu-ink-muted))" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "rgb(var(--eu-accent) / 0.22) !important",
  },
  ".cm-selectionMatch": { backgroundColor: "rgb(var(--eu-accent) / 0.12)" },
  ".cm-matchingBracket": { backgroundColor: "rgb(var(--eu-accent) / 0.18)", outline: "none" },
  ".cm-tooltip": {
    backgroundColor: "rgb(var(--eu-panel))",
    border: "1px solid var(--color-line)",
    borderRadius: "6px",
    boxShadow: "var(--shadow-pop)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul > li": { padding: "3px 8px", fontFamily: "var(--font-mono)" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "rgb(var(--eu-accent-soft))",
    color: "rgb(var(--eu-ink))",
  },
  ".cm-completionDetail": { color: "rgb(var(--eu-ink-faint))", fontStyle: "normal", marginLeft: "8px" },
  ".cm-completionInfo": { maxWidth: "28rem", padding: "8px 10px", whiteSpace: "pre-wrap" },
  ".cm-panels": {
    backgroundColor: "rgb(var(--eu-chrome))",
    color: "rgb(var(--eu-ink))",
    borderColor: "var(--color-line)",
  },
  ".cm-panel.cm-search": { padding: "6px 8px", fontFamily: "var(--font-sans)" },
  ".cm-panel.cm-search input, .cm-panel.cm-search button": { fontSize: "var(--text-small)" },
  // Fold arrows only when the pointer is in the margin: the code stays quiet.
  ".cm-foldGutter .cm-gutterElement": { opacity: "0", transition: "opacity 120ms" },
  ".cm-gutters:hover .cm-foldGutter .cm-gutterElement": { opacity: "1" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--color-hover)",
    border: "none",
    color: "rgb(var(--eu-ink-muted))",
  },
});

const highlight = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.operatorKeyword],
    color: "rgb(var(--eu-accent))",
    fontWeight: "600",
  },
  { tag: [tags.string, tags.special(tags.string)], color: "rgb(var(--eu-ok))" },
  { tag: [tags.number, tags.bool, tags.null], color: "rgb(var(--eu-warn))" },
  { tag: tags.comment, color: "rgb(var(--eu-ink-faint))", fontStyle: "italic" },
  {
    tag: [tags.function(tags.definition(tags.variableName)), tags.definition(tags.className)],
    color: "rgb(var(--eu-ink))",
    fontWeight: "600",
  },
  { tag: tags.standard(tags.variableName), color: "rgb(var(--eu-accent))" },
  { tag: tags.self, color: "rgb(var(--eu-danger))" },
  { tag: tags.invalid, color: "rgb(var(--eu-danger))" },
]);

/** The search panel and completion labels, in French. */
const phrases = EditorState.phrases.of({
  Find: "Rechercher",
  Replace: "Remplacer",
  next: "suivant",
  previous: "précédent",
  all: "tout",
  "match case": "respecter la casse",
  "by word": "mot entier",
  regexp: "expression régulière",
  replace: "remplacer",
  "replace all": "tout remplacer",
  close: "fermer",
  "current match": "occurrence actuelle",
  "on line": "à la ligne",
  "Go to line": "Aller à la ligne",
  go: "aller",
  "Folded lines": "Lignes repliées",
  "Unfolded lines": "Lignes dépliées",
  "Fold line": "Replier",
  "Unfold line": "Déplier",
  Completions: "Suggestions",
});

const KINDS: Record<string, string> = {
  function: "function",
  class: "class",
  module: "namespace",
  keyword: "keyword",
  instance: "variable",
  statement: "variable",
  param: "variable",
  property: "property",
  path: "text",
};

/**
 * Jedi's suggestions (the sidecar's tools lane). A new keystroke aborts the
 * previous request's use; when Jedi is missing or fails, the names of the
 * script and the builtins still come.
 */
function jediSource(filename: () => string | undefined) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const word = ctx.matchBefore(/[\w.]*/);
    if (!ctx.explicit && (!word || word.from === word.to)) return null;
    const from = word ? word.from + (word.text.lastIndexOf(".") + 1) : ctx.pos;
    const line = ctx.state.doc.lineAt(ctx.pos);
    try {
      const items = await api.pythonComplete(
        ctx.state.doc.toString(),
        line.number,
        ctx.pos - line.from,
        filename(),
      );
      if (ctx.aborted) return null;
      if (items.length) {
        return {
          from,
          options: items.map((c) => ({
            label: c.name,
            type: KINDS[c.type ?? ""] ?? "variable",
            detail: c.signature ?? undefined,
            info: c.doc || undefined,
          })),
          validFor: /^\w*$/,
        };
      }
    } catch {
      // No Jedi (or a script it cannot parse yet): the local names below.
    }
    if (ctx.aborted) return null;
    const local = localCompletionSource(ctx);
    const global = await globalCompletion(ctx);
    if (!local?.options.length) return global;
    if (!global) return local;
    return { from: local.from, options: [...local.options, ...global.options], validFor: /^\w*$/ };
  };
}

/**
 * The Python editor (CodeMirror 6). `docKey` names the script: a new key
 * is a new document, with its own undo history.
 */
export default function PythonEditor({
  docKey,
  value,
  onChange,
  filename,
  label,
}: {
  docKey: string;
  value: string;
  onChange: (value: string) => void;
  filename?: string;
  label: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const filenameRef = useRef(filename);
  useEffect(() => {
    onChangeRef.current = onChange;
    filenameRef.current = filename;
  });

  // One view for the editor's life; a new script swaps its state.
  useEffect(() => {
    const view = new EditorView({ parent: hostRef.current! });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const extensions: Extension[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      indentUnit.of("    "),
      syntaxHighlighting(highlight),
      bracketMatching(),
      closeBrackets(),
      autocompletion({ override: [jediSource(() => filenameRef.current)], icons: false }),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      search({ top: true }),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      python(),
      theme,
      phrases,
      EditorView.contentAttributes.of({ "aria-label": label, spellcheck: "false" }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChangeRef.current(update.state.doc.toString());
      }),
    ];
    view.setState(EditorState.create({ doc: value, extensions }));
    // Only a new script resets the document; typing flows the other way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey, label]);

  // The same script changed from outside (saved under a new name, reverted…).
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={hostRef} className="h-full min-h-0 overflow-hidden selectable" />;
}
