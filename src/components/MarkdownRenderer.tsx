import React from "react";

interface CodeBlock {
  type: "code";
  language: string;
  code: string;
}

interface TableBlock {
  type: "table";
  headers: string[];
  rows: string[][];
}

interface ListBlock {
  type: "list";
  ordered: boolean;
  items: string[];
}

interface ParagraphBlock {
  type: "paragraph";
  text: string;
}

type Block = CodeBlock | TableBlock | ListBlock | ParagraphBlock;

function parseMarkdown(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 1. Code Block
    if (line.trim().startsWith("```")) {
      const language = line.trim().substring(3).trim();
      let code = "";
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code += lines[i] + "\n";
        i++;
      }
      // Trim the last newline from code
      if (code.endsWith("\n")) {
        code = code.slice(0, -1);
      }
      blocks.push({ type: "code", language, code });
      i++; // Skip closing ```
      continue;
    }

    // 2. Table
    // A table has header, separator, and data rows
    if (line.trim().startsWith("|") && i + 1 < lines.length && lines[i+1].trim().startsWith("|") && lines[i+1].includes("-")) {
      const headers = line.split("|").map(s => s.trim()).filter((s, idx, arr) => idx > 0 && idx < arr.length - 1);
      const rows: string[][] = [];
      i += 2; // Skip header and separator line
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = lines[i].split("|").map(s => s.trim()).filter((s, idx, arr) => idx > 0 && idx < arr.length - 1);
        rows.push(row);
        i++;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    // 3. Bullet List
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))) {
        items.push(lines[i].trim().substring(2).trim());
        i++;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    // 4. Numbered List
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const match = lines[i].match(/^\s*\d+\.\s+(.*)/);
        if (match) {
          items.push(match[1].trim());
        }
        i++;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    // 5. Paragraph
    if (line.trim() === "") {
      i++;
      continue;
    }

    let pText = "";
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].trim().startsWith("```") && !lines[i].trim().startsWith("|") && !(lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* ")) && !/^\s*\d+\.\s+/.test(lines[i])) {
      pText += (pText ? "\n" : "") + lines[i];
      i++;
    }
    blocks.push({ type: "paragraph", text: pText });
  }

  return blocks;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const codeRegex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match;

  const parseItalics = (str: string, keyPrefix: string): React.ReactNode[] => {
    const italicParts: React.ReactNode[] = [];
    const italicSegments = str.split(/\*([^*]+)\*/g);
    italicSegments.forEach((seg, sIdx) => {
      if (sIdx % 2 === 1) {
        italicParts.push(<em key={`${keyPrefix}-i-${sIdx}`}>{seg}</em>);
      } else {
        italicParts.push(seg);
      }
    });
    return italicParts;
  };

  const parseBoldItalic = (str: string, keyPrefix: string): React.ReactNode[] => {
    const boldItalicParts: React.ReactNode[] = [];
    const boldSegments = str.split(/\*\*([^*]+)\*\*/g);
    boldSegments.forEach((seg, sIdx) => {
      if (sIdx % 2 === 1) {
        boldItalicParts.push(<strong key={`${keyPrefix}-b-${sIdx}`}>{parseItalics(seg, `${keyPrefix}-b-${sIdx}`)}</strong>);
      } else {
        boldItalicParts.push(...parseItalics(seg, `${keyPrefix}-n-${sIdx}`));
      }
    });
    return boldItalicParts;
  };

  let partIdx = 0;
  while ((match = codeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const normalText = text.substring(lastIndex, match.index);
      parts.push(...parseBoldItalic(normalText, `t-${partIdx}`));
      partIdx++;
    }
    parts.push(
      <code key={`code-${partIdx}`} className="bg-zinc-900 border border-zinc-800 text-red-400 px-1.5 py-0.5 rounded font-mono text-[11px] mx-0.5">
        {match[1]}
      </code>
    );
    partIdx++;
    lastIndex = codeRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(...parseBoldItalic(text.substring(lastIndex), `t-${partIdx}`));
  }

  return parts;
}

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  const blocks = parseMarkdown(content);

  return (
    <div className="markdown-body space-y-3 text-zinc-200">
      {blocks.map((block, idx) => {
        switch (block.type) {
          case "code":
            return (
              <div key={idx} className="my-3 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950 font-mono text-xs">
                {block.language && (
                  <div className="bg-zinc-900 border-b border-zinc-850 px-4 py-1.5 text-[10px] text-zinc-400 flex items-center justify-between select-none font-sans">
                    <span className="uppercase font-bold tracking-wider">{block.language}</span>
                  </div>
                )}
                <pre className="p-4 overflow-x-auto text-zinc-300 whitespace-pre">
                  <code>{block.code}</code>
                </pre>
              </div>
            );
          case "table":
            return (
              <div key={idx} className="my-3 overflow-x-auto rounded-lg border border-zinc-900 bg-zinc-950/40">
                <table className="min-w-full divide-y divide-zinc-800 text-left text-xs">
                  <thead className="bg-zinc-900/80">
                    <tr>
                      {block.headers.map((header, hIdx) => (
                        <th key={hIdx} className="px-4 py-2 font-bold text-zinc-300 font-sans">
                          {renderInline(header)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-850">
                    {block.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-zinc-900/30">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="px-4 py-2 text-zinc-300 font-sans">
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "list":
            const ListTag = block.ordered ? "ol" : "ul";
            return (
              <ListTag key={idx} className={`list-outside pl-5 space-y-1.5 text-xs text-zinc-300 font-sans ${block.ordered ? "list-decimal" : "list-disc"}`}>
                {block.items.map((item, iIdx) => (
                  <li key={iIdx}>
                    {renderInline(item)}
                  </li>
                ))}
              </ListTag>
            );
          case "paragraph":
            return (
              <p key={idx} className="text-zinc-100 font-sans font-medium text-xs leading-relaxed whitespace-pre-wrap">
                {renderInline(block.text)}
              </p>
            );
          default:
            return null;
        }
      })}
    </div>
  );
};
