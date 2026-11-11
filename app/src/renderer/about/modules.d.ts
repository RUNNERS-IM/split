// Module shapes Vite handles for the overlay, sheet and about pages, declared here because the
// project does not load vite/client types.
declare module "*.css";

declare module "*.webp" {
  const url: string;
  export default url;
}

/** Vite's `?raw` import gives a file's text. */
declare module "*.md?raw" {
  const text: string;
  export default text;
}
