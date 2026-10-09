/// <reference types="vite/client" />

/** CHANGELOG.md and its pictures, from the build (vite.config.ts). */
declare module "virtual:changelog" {
  export const log: string;
  /** Each picture's address in the app, by its path in the changelog (docs/changelog/…). */
  export const pictures: Record<string, string>;
}
