"use client";

import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { API } from "@/lib/api";
import { cleanStudyMarkdown } from "@/lib/markdown";
import { linkifySources, makeSourceAnchor, NoteContext } from "@/lib/noteLinks";
import remarkHighlights from "@/lib/remarkHighlights";
import MermaidDiagram from "@/components/MermaidDiagram";

interface NoteMarkdownProps {
  markdown: string;
  ctx: NoteContext;
  onSeek: (seconds: number) => void;
}

/** Canonical study-note renderer: figure images, tables, and source links. */
export default function NoteMarkdown({ markdown, ctx, onSeek }: NoteMarkdownProps) {
  const prepared = linkifySources(cleanStudyMarkdown(markdown), ctx.kind);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath, remarkHighlights]}
      rehypePlugins={[rehypeKatex]}
      // Preserve our internal jump-to-source scheme; react-markdown would
      // otherwise strip the unknown protocol and blank the href.
      urlTransform={(url) => (url.startsWith("studysrc:") ? url : defaultUrlTransform(url))}
      components={{
        a: makeSourceAnchor(ctx, onSeek),
        mark: ({ children }) => <mark className="study-note-highlight">{children}</mark>,
        img: ({ src, alt }) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={typeof src === "string" && src.startsWith("/api/") ? `${API}${src}` : src}
            alt={alt ?? "Figure"}
            className="max-h-[560px] rounded-xl object-contain"
          />
        ),
        code: ({ className, children, ...props }) => {
          const language = /language-(\w+)/.exec(className ?? "")?.[1];
          const source = String(children).replace(/\n$/, "");
          return language === "mermaid" ? (
            <MermaidDiagram source={source} />
          ) : (
            <code className={className} {...props}>{children}</code>
          );
        },
        table: ({ children }) => <div className="study-note-table"><table>{children}</table></div>,
      }}
    >
      {prepared}
    </ReactMarkdown>
  );
}
