import { MaterialSymbolName } from './material-symbol'

/**
 * Every Octicon this product renders, mapped to the Material Symbol that means
 * the same thing.
 *
 * The application draws 464 Octicons across 168 files against 174 Material
 * Symbols, so the icon language a user actually sees is GitHub's rather than
 * Material Design 3's. This is the mapping that lets those call sites move
 * across without each one inventing its own answer.
 *
 * WHY it is hand-written. There is no reliable automated correspondence between
 * the two sets: they were drawn for different products with different
 * vocabularies, and a wrong icon is worse than an ugly one because it is
 * confidently wrong. Every entry below is a judgement about meaning, and some
 * are genuinely arguable — `repo`, `beaker`, `hubot` and `pulse` have no close
 * Material equivalent and take the nearest honest one.
 *
 * WHY it is typed rather than a plain object. The value type is
 * `MaterialSymbolName`, so a name the bundled font subset does not carry is a
 * compile error rather than a rendering defect. That matters more here than
 * anywhere else in the tree: an unknown ligature does NOT fall back to a box or
 * a blank — the icon font renders the literal English word, so `smartphone`
 * ships as the word "smartphone" sitting in the interface. Three defences guard
 * that, and this is the first.
 */
export const OcticonMaterialSymbols = {
  accessibility: 'accessibility',
  alert: 'warning',
  alertFill: 'warning',
  apps: 'apps',
  archive: 'archive',
  arrowDown: 'arrow_downward',
  arrowLeft: 'arrow_back',
  arrowRight: 'arrow_forward',
  arrowSwitch: 'swap_horiz',
  arrowUp: 'arrow_upward',
  beaker: 'science',
  bell: 'notifications',
  bellFill: 'notifications_active',
  bellSlash: 'notifications_off',
  book: 'menu_book',
  calendar: 'calendar_today',
  check: 'check',
  checkCircle: 'check_circle',
  checkCircleFill: 'check_circle',
  checklist: 'checklist',
  chevronDown: 'keyboard_arrow_down',
  chevronLeft: 'keyboard_arrow_left',
  chevronRight: 'keyboard_arrow_right',
  chevronUp: 'keyboard_arrow_up',
  circle: 'circle',
  circleSlash: 'block',
  clock: 'schedule',
  code: 'code',
  codeSquare: 'code_blocks',
  codescan: 'policy',
  comment: 'chat_bubble',
  commentDiscussion: 'forum',
  container: 'deployed_code',
  copilot: 'smart_toy',
  copy: 'content_copy',
  dash: 'remove',
  database: 'database',
  desktopDownload: 'install_desktop',
  deviceDesktop: 'desktop_windows',
  deviceMobile: 'smartphone',
  devices: 'devices',
  diff: 'difference',
  diffAdded: 'add_box',
  diffModified: 'indeterminate_check_box',
  diffRemoved: 'disabled_by_default',
  diffRenamed: 'drive_file_rename_outline',
  dotFill: 'fiber_manual_record',
  download: 'download',
  eye: 'visibility',
  eyeClosed: 'visibility_off',
  file: 'description',
  fileBinary: 'data_object',
  fileCode: 'code',
  fileDiff: 'difference',
  fileDirectory: 'folder',
  fileDirectoryOpenFill: 'folder_open',
  fileMedia: 'image',
  fileSubmodule: 'folder_special',
  fileZip: 'folder_zip',
  filter: 'filter_alt',
  filterRemove: 'filter_alt_off',
  flag: 'flag',
  fold: 'unfold_less',
  foldDown: 'keyboard_double_arrow_down',
  foldUp: 'keyboard_double_arrow_up',
  gear: 'settings',
  gitBranch: 'call_split',
  gitCommit: 'commit',
  gitMerge: 'merge',
  gitPullRequest: 'merge_type',
  gitPullRequestDraft: 'pending',
  globe: 'public',
  history: 'history',
  home: 'home',
  hourglass: 'hourglass_empty',
  hubot: 'smart_toy',
  info: 'info',
  issueOpened: 'error',
  issueReopened: 'refresh',
  iterations: 'repeat',
  kebabHorizontal: 'more_horiz',
  lightBulb: 'lightbulb',
  link: 'link',
  linkExternal: 'open_in_new',
  listUnordered: 'format_list_bulleted',
  lock: 'lock',
  meter: 'speed',
  mortarBoard: 'school',
  moveToBottom: 'vertical_align_bottom',
  note: 'sticky_note_2',
  paintbrush: 'brush',
  paperAirplane: 'send',
  pencil: 'edit',
  people: 'group',
  person: 'person',
  personAdd: 'person_add',
  pin: 'push_pin',
  play: 'play_arrow',
  plus: 'add',
  project: 'view_kanban',
  projectRoadmap: 'timeline',
  pulse: 'monitoring',
  question: 'help',
  redo: 'redo',
  repo: 'book_5',
  repoClone: 'file_copy',
  repoForked: 'fork_right',
  repoPush: 'publish',
  search: 'search',
  server: 'dns',
  shield: 'shield',
  shieldCheck: 'verified_user',
  shieldLock: 'security',
  signIn: 'login',
  skip: 'skip_next',
  sliders: 'tune',
  smiley: 'mood',
  sortAsc: 'sort',
  sparkle: 'auto_awesome',
  squareFill: 'square',
  stack: 'layers',
  star: 'star',
  starFill: 'star',
  stop: 'stop',
  strikethrough: 'format_strikethrough',
  sync: 'sync',
  tag: 'sell',
  telescope: 'travel_explore',
  terminal: 'terminal',
  tools: 'build',
  trash: 'delete',
  triangleDown: 'arrow_drop_down',
  triangleRight: 'arrow_right',
  typography: 'text_fields',
  undo: 'undo',
  unfold: 'unfold_more',
  unmute: 'volume_up',
  upload: 'upload',
  workflow: 'account_tree',
  x: 'close',
  xCircle: 'cancel',
  xCircleFill: 'cancel',
  zap: 'bolt',
  zoomIn: 'zoom_in',
  zoomOut: 'zoom_out',
} as const satisfies Record<string, MaterialSymbolName>

export type MappedOcticonName = keyof typeof OcticonMaterialSymbols

/**
 * Octicons that deliberately have no Material Symbol.
 *
 * A brand mark is not part of a design language and has no equivalent in one:
 * substituting a generic glyph for GitHub's logo would not be conformance, it
 * would be removing the identifying mark from the surface that identifies an
 * account. These keep their Octicon, and the reason travels with the list so
 * the gap reads as a decision rather than as an oversight.
 */
export const OcticonsWithoutMaterialEquivalent: ReadonlyMap<string, string> =
  new Map([
    [
      'markGithub',
      'A brand mark. Material Design 3 has no logo for another product, and a ' +
        'generic glyph in its place would stop identifying the account.',
    ],
  ])
