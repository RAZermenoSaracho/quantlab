import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export default function RichTextEditor({ value, onChange }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link,
      Placeholder.configure({
        placeholder: "Write your strategy notes...",
      }),
    ],
    content: value,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-white">
      <EditorContent editor={editor} />
    </div>
  );
}
