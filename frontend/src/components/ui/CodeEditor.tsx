import Editor from "@monaco-editor/react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  height?: string; // tailwind height class (h-[500px] etc)
};

export default function CodeEditor({
  value,
  onChange,
  disabled = false,
  height = "h-[400px]",
}: Props) {
  return (
    <div
      className={[
        "w-full min-w-0 max-w-full",
        "rounded-xl border border-slate-700",
        "overflow-hidden", // critical: prevents editor internal nodes from pushing layout
        height,
      ].join(" ")}
    >
      <Editor
        height="100%"
        defaultLanguage="python"
        value={value}
        theme="vs-dark"
        onChange={(val) => onChange(val || "")}
        options={{
          readOnly: disabled,
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: "Fira Code, monospace",
          automaticLayout: true,
          scrollBeyondLastLine: false,

          // Critical for horizontal overflow:
          wordWrap: "on",
          wrappingIndent: "indent",

          tabSize: 4,
          insertSpaces: true,

          // Nice-to-have: makes sure long lines don't create weird horizontal behavior
          scrollbar: {
            horizontal: "auto",
            vertical: "auto",
          },

          // Optional: reduces layout quirks
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
        }}
      />
    </div>
  );
}
