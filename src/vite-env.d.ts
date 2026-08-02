/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Short hash + subject of the build's commit, injected by `vite.config.ts`.
   *  Stamped onto every bug report so a report names the build it came from. */
  readonly VITE_COMMIT_MSG: string
}
