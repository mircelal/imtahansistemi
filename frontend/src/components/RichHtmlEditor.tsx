import Gapcursor from "@tiptap/extension-gapcursor";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, type ReactNode } from "react";

export type RichHtmlEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  minHeightClass?: string;
};

function ToolbarButton({
  onClick,
  active,
  disabled,
  children
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "rounded px-2 py-1 text-xs font-medium transition",
        active ? "bg-indigo-100 text-indigo-900" : "bg-white text-slate-700 hover:bg-slate-50",
        disabled ? "cursor-not-allowed opacity-40" : ""
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function RichHtmlEditor({
  value,
  onChange,
  placeholder,
  className,
  disabled,
  minHeightClass = "min-h-[140px]"
}: RichHtmlEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        bulletList: { HTMLAttributes: { class: "list-disc pl-5" } },
        orderedList: { HTMLAttributes: { class: "list-decimal pl-5" } }
      }),
      Underline,
      Superscript,
      Subscript,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-indigo-600 underline", rel: "noopener noreferrer", target: "_blank" }
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: placeholder ?? "Mətn və ya Word-dən yapışdırın…"
      }),
      Gapcursor
    ],
    content: value || "",
    editable: !disabled,
    editorProps: {
      attributes: {
        class: `ProseMirror focus:outline-none px-3 py-2 text-sm text-slate-900 ${minHeightClass}`
      }
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    }
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const cur = editor.getHTML();
    const next = value || "";
    if (next !== cur) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) {
    return (
      <div className={`rounded-lg border border-slate-200 bg-slate-50 ${minHeightClass} animate-pulse`} aria-hidden />
    );
  }

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Keçid ünvanı", prev ?? "https://");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  return (
    <div
      className={[
        "rounded-xl border border-slate-200 bg-white shadow-sm",
        "focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100",
        className ?? ""
      ].join(" ")}
    >
      <div className="flex flex-wrap gap-1 border-b border-slate-100 bg-slate-50/90 px-2 py-1.5">
        <ToolbarButton
          disabled={disabled}
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled}
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          I
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled}
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          U
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled}
          active={editor.isActive("superscript")}
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
        >
          x²
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled}
          active={editor.isActive("subscript")}
          onClick={() => editor.chain().focus().toggleSubscript().run()}
        >
          xₙ
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled}
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • Siyahı
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled}
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. Siyahı
        </ToolbarButton>
        <ToolbarButton disabled={disabled} active={editor.isActive("link")} onClick={setLink}>
          Keçid
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled}
          active={editor.isActive({ textAlign: "left" })}
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
        >
          Sol
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled}
          active={editor.isActive({ textAlign: "center" })}
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
        >
          Mərkəz
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled}
          active={editor.isActive({ textAlign: "right" })}
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
        >
          Sağ
        </ToolbarButton>
        <ToolbarButton
          disabled={disabled}
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 2, cols: 3, withHeaderRow: true }).run()
          }
        >
          Cədvəl 2×3
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
