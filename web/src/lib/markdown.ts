const PLACEHOLDER_REFERENCE = /\s*\[(?:@\s*)?(?:mm:ss|p\.\s*N)\]/gi;
const DECORATIVE_EMOJI = /\p{Extended_Pictographic}\uFE0F?/gu;
const DECORATIVE_BULLET = /^(\s*)[•●◦▪▫▸▹►‣]\s+/gm;
const OUTER_MARKDOWN_FENCE = /^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i;

export function cleanStudyMarkdown(markdown: string): string {
  const outerFence = markdown.match(OUTER_MARKDOWN_FENCE);

  return (outerFence?.[1] ?? markdown)
    .replace(PLACEHOLDER_REFERENCE, "")
    .replace(DECORATIVE_EMOJI, "")
    .replace(DECORATIVE_BULLET, "$1- ")
    .replace(/^(\s*)\*\s+/gm, "$1- ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
