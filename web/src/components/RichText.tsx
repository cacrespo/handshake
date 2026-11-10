import React from "react";

interface RichTextProps {
  content: string;
  className?: string;
}

/**
 * High-performance, zero-dependency, safe rich-text renderer for sovereign graffitis.
 * Parses markdown bold, italics, inline code, blockquotes, URLs, and line breaks.
 */
export const RichText: React.FC<RichTextProps> = ({ content, className = "" }) => {
  if (!content) return null;

  // Split content by paragraphs / linebreaks
  const lines = content.split("\n");

  const renderInline = (text: string, keyPrefix: string): React.ReactNode[] => {
    // Regex for bold, italic, inline code, and URLs
    // 1: URL (http:// or https://)
    // 2: Bold (**...**)
    // 3: Italic (*...*)
    // 4: Inline Code (`...`)
    const regex = /(https?:\/\/[^\s]+)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`)/g;
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    let index = 0;
    while ((match = regex.exec(text)) !== null) {
      // Append text before match
      if (match.index > lastIndex) {
        elements.push(
          <span key={`${keyPrefix}-t-${index++}`}>
            {text.substring(lastIndex, match.index)}
          </span>
        );
      }

      const matchedStr = match[0];
      if (match[1]) {
        // URL
        elements.push(
          <a
            key={`${keyPrefix}-url-${index++}`}
            href={matchedStr}
            target="_blank"
            rel="noopener noreferrer"
            className="rich-link"
            onClick={(e) => e.stopPropagation()}
          >
            {matchedStr}
          </a>
        );
      } else if (match[2]) {
        // Bold
        elements.push(
          <strong key={`${keyPrefix}-b-${index++}`} className="rich-bold">
            {matchedStr.slice(2, -2)}
          </strong>
        );
      } else if (match[3]) {
        // Italic
        elements.push(
          <em key={`${keyPrefix}-i-${index++}`} className="rich-italic">
            {matchedStr.slice(1, -1)}
          </em>
        );
      } else if (match[4]) {
        // Inline code
        elements.push(
          <code key={`${keyPrefix}-c-${index++}`} className="rich-code">
            {matchedStr.slice(1, -1)}
          </code>
        );
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      elements.push(
        <span key={`${keyPrefix}-tail-${index++}`}>
          {text.substring(lastIndex)}
        </span>
      );
    }

    return elements;
  };

  return (
    <div className={`rich-text-content ${className}`}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("> ")) {
          // Blockquote
          return (
            <blockquote key={`line-${idx}`} className="rich-blockquote">
              {renderInline(trimmed.substring(2), `quote-${idx}`)}
            </blockquote>
          );
        }
        return (
          <p key={`line-${idx}`} className="rich-paragraph">
            {renderInline(line, `p-${idx}`)}
          </p>
        );
      })}
    </div>
  );
};

export default RichText;
