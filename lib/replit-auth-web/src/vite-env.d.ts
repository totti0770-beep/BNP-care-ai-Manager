// Minimal ambient declaration for the bundler-injected `import.meta.env`.
// Declared locally rather than pulling in `vite/client`, so this library stays
// bundler-agnostic for its consumers.
interface ImportMetaEnv {
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
