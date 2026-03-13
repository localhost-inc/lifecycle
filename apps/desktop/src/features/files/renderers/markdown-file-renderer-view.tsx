import "./markdown-file-renderer-view.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownFileRendererView({ content }: { content: string }) {
  return (
    <article className="markdown-file-renderer px-5 py-5">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </article>
  );
}
