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
    <div className={`rounded-xl overflow-hidden border border-slate-700 ${height}`}>
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
          wordWrap: "on",
          tabSize: 4,
          insertSpaces: true,
        }}
      />
    </div>
  );
}
