/**
 * GraphQL query editor — monospace textarea with placeholder.
 *
 * @module CodeEditor
 */

interface CodeEditorProps {
  disabled?: boolean;
  onChange: (text: string) => void;
  queryText: string;
}

/** Simple monospace textarea for editing GraphQL queries. */
export function CodeEditor({ disabled, onChange, queryText }: CodeEditorProps) {
  return (
    <div className="editor-wrap">
      <textarea
        aria-label="GraphQL query editor"
        autoCapitalize="off"
        autoCorrect="off"
        className="lab-editor"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="// Enter a GraphQL query..."
        spellCheck={false}
        value={queryText}
      />
    </div>
  );
}
