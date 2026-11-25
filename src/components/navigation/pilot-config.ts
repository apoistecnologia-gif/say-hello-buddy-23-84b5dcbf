// Hard disabled in this branch. These are build-time policy, not localStorage,
// query-string or remotely changeable settings. Do not switch on in a release.
// After a pilot has created rides, keep INSTALLED until recovery is drained.
export const PILOT_INSTALLED:boolean=false;
export const NEW_SELECTION_ENABLED:boolean=false;
export type PilotMap={map:unknown;catalog:unknown;dispose:()=>void};
// No network URL, catalog, external tile server or dependency is guessed.
// Supply a verified local PMTiles/MapLibre provider in a future isolated build.
export async function preparePilotMap(_root:HTMLElement,_signal:AbortSignal):Promise<PilotMap|null>{
  return null;
}
