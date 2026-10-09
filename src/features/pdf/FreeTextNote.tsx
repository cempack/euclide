import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  PdfAnnotationSubtype,
  PdfVerticalAlignment,
  standardFontCssProperties,
  textAlignmentToCss,
  type PdfFreeTextAnnoObject,
} from "@embedpdf/models";
import { createRenderer, useAnnotationCapability } from "@embedpdf/plugin-annotation/react";
import { useHistoryCapability } from "@embedpdf/plugin-history/react";

/** The notes written since the document opened: one left empty goes without an undo step. */
export const FreshNotes = createContext<Set<string>>(new Set());

/** A note's lines, as EmbedPDF draws them. */
const LINE_HEIGHT = 1.18;

/**
 * A text note, as EmbedPDF's own with three differences: it grows downward
 * as it is typed (EmbedPDF's kept its first size and hid the rest), the text
 * and the new size are one undo step, and a note left empty goes. A note
 * just written leaves no trace; one the file held is taken away as an undo
 * step.
 */
function Note({
  documentId,
  pageIndex,
  note,
  isSelected,
  isEditing,
  scale,
  onClick,
  hidden,
}: {
  documentId: string;
  pageIndex: number;
  note: PdfFreeTextAnnoObject;
  isSelected: boolean;
  isEditing: boolean;
  scale: number;
  onClick?: (e: React.MouseEvent<Element>) => void;
  hidden: boolean;
}) {
  const { provides: annotations } = useAnnotationCapability();
  const { provides: history } = useHistoryCapability();
  const fresh = useContext(FreshNotes);
  const editor = useRef<HTMLSpanElement>(null);
  const editing = useRef(false);
  const boxHeight = note.rect.size.height * scale;
  /** How tall the text is while it is typed. */
  const [typed, setTyped] = useState(0);
  const height = isEditing ? Math.max(boxHeight, typed) : boxHeight;

  useEffect(() => {
    const el = editor.current;
    if (!isEditing || !el) return;
    editing.current = true;
    el.focus();
    // The caret after the text.
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [isEditing]);

  const grow = () => {
    if (editor.current) setTyped(editor.current.scrollHeight);
  };

  const finish = () => {
    const el = editor.current;
    if (!editing.current || !el || !annotations) return;
    editing.current = false;
    setTyped(0);
    const scope = annotations.forDocument(documentId);
    const contents = el.innerText.replace(/\u00A0/g, " ").replace(/\n+$/, "");
    if (!contents.trim()) {
      scope.deleteAnnotation(pageIndex, note.id);
      if (fresh.has(note.id))
        history
          ?.forDocument(documentId)
          .purgeByMetadata<{ annotationIds?: string[] }>((m) => !!m?.annotationIds?.includes(note.id));
      return;
    }
    const fitted = Math.max(note.fontSize * LINE_HEIGHT + 4, Math.ceil(el.scrollHeight / scale));
    if (contents === note.contents && Math.abs(fitted - note.rect.size.height) < 1) return;
    scope.updateAnnotation(pageIndex, note.id, {
      contents,
      rect: { origin: note.rect.origin, size: { width: note.rect.size.width, height: fitted } },
    });
  };

  return (
    <div
      style={{
        position: "absolute",
        width: note.rect.size.width * scale,
        height,
        cursor: isSelected && !isEditing ? "move" : "default",
        pointerEvents: !onClick ? "none" : isSelected && !isEditing ? "none" : "auto",
        zIndex: 2,
        opacity: hidden ? 0 : 1,
      }}
      onPointerDown={onClick}
    >
      <span
        ref={editor}
        onBlur={finish}
        onInput={grow}
        tabIndex={0}
        contentEditable={isEditing}
        suppressContentEditableWarning
        style={{
          color: note.fontColor,
          fontSize: note.fontSize * scale,
          ...standardFontCssProperties(note.fontFamily),
          textAlign: textAlignmentToCss(note.textAlign),
          display: "flex",
          flexDirection: "column",
          justifyContent:
            note.verticalAlign === PdfVerticalAlignment.Top
              ? "flex-start"
              : note.verticalAlign === PdfVerticalAlignment.Middle
                ? "center"
                : "flex-end",
          backgroundColor: note.color ?? note.backgroundColor,
          opacity: note.opacity,
          width: "100%",
          minHeight: "100%",
          lineHeight: LINE_HEIGHT,
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          cursor: isEditing ? "text" : onClick ? "pointer" : "default",
          outline: "none",
        }}
      >
        {note.contents}
      </span>
    </div>
  );
}

/** Takes EmbedPDF's place for text notes (same id), not for callouts. */
export const freeTextNote = createRenderer<PdfFreeTextAnnoObject>({
  id: "freeText",
  matches: (a): a is PdfFreeTextAnnoObject =>
    a.type === PdfAnnotationSubtype.FREETEXT && a.intent !== "FreeTextCallout",
  render: ({
    currentObject,
    isSelected,
    isEditing,
    scale,
    pageIndex,
    documentId,
    onClick,
    appearanceActive,
  }) => (
    <Note
      documentId={documentId}
      pageIndex={pageIndex}
      note={currentObject}
      isSelected={isSelected}
      isEditing={isEditing}
      scale={scale}
      onClick={onClick}
      hidden={appearanceActive}
    />
  ),
  interactionDefaults: { isDraggable: true, isResizable: true, isRotatable: false },
  isDraggable: (toolDraggable, { isEditing }) => toolDraggable && !isEditing,
  onDoubleClick: (id, setEditingId) => setEditingId(id),
});
