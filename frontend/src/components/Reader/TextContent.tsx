import { useReaderSettings } from '../../hooks/useReaderSettings';

interface TextContentProps {
  content: string;
  baseOffset?: number; // global byte offset where this content starts
}

export function TextContent({ content, baseOffset = 0 }: TextContentProps) {
  const { fontSize, lineHeight } = useReaderSettings();

  const isChapterTitle = (line: string): boolean => {
    const patterns = [
      /^\s*第[一二三四五六七八九十百千]+章.*$/,
      /^\s*第\d+章.*$/,
      /^\s*Chapter\s+\d+.*$/i,
    ];
    return patterns.some(pattern => pattern.test(line));
  };

  const renderContent = () => {
    const lines = content.split('\n');
    let runningOffset = baseOffset;

    return lines.map((line, index) => {
      const isTitle = isChapterTitle(line.trim());
      const element = isTitle ? (
        <div
          key={index}
          data-offset={runningOffset}
          style={{
            textAlign: 'center',
            fontWeight: 'bold',
            margin: '2em 0',
            fontSize: `${fontSize + 2}px`,
          }}
        >
          {line}
        </div>
      ) : (
        <div key={index} data-offset={runningOffset}>
          {line || '\u00A0'}
        </div>
      );
      runningOffset += line.length + 1; // +1 for newline byte
      return element;
    });
  };

  return (
    <div
      style={{
        fontSize: `${fontSize}px`,
        lineHeight: lineHeight,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
      }}
    >
      {renderContent()}
    </div>
  );
}
