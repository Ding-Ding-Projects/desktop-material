/**
 * The tabs of a repository's own settings popup.
 *
 * Kept here rather than beside the component so pure-data modules - the
 * command palette catalog especially - can name a tab without importing React
 * and dragging a whole UI tree into a node-only test.
 */
export enum RepositorySettingsTab {
  Remote = 0,
  IgnoredFiles,
  GitConfig,
  // Note: BuildRun, CheapLfs, Submodules, Subtrees, and Appearance are placed
  // before the conditionally-rendered ForkSettings tab so the enum values keep
  // matching the TabBar positions
  // whether or not the fork tab is shown. Integrator note: if the remotes work
  // (b2:remotes) also inserts a tab here, keep the unconditionally-rendered
  // tabs contiguous and leave ForkSettings last; reconcile the numeric indices
  // so each enum value equals its TabBar position.
  BuildRun,
  CheapLfs,
  Submodules,
  Subtrees,
  Automation,
  Metadata,
  Appearance,
  AISecurity,
  ForkSettings,
}
