/**
 * Application name and version, sourced from package.json.
 *
 * NOTE: JSON imports are handled by Vite (dev) and esbuild (production bundle).
 * tsc --noEmit tolerates them via `moduleResolution: "bundler"`.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
import pkg from "../../package.json";

export const APP_NAME: string = pkg.name;
export const APP_VERSION: string = pkg.version;

