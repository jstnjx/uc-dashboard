import './camera-player.js';
import { MATERIAL_SYMBOL_NAMES } from './material-symbols-catalog.js';

// Runtime compatibility for older Android WebViews used by kiosk browsers.
if (!String.prototype.replaceAll) {
  Object.defineProperty(String.prototype, 'replaceAll', {
    configurable: true,
    writable: true,
    value(search, replacement) {
      const source = String(this);
      if (search instanceof RegExp) return source.replace(search, replacement);
      return source.split(String(search)).join(String(replacement));
    }
  });
}
if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', {
    configurable: true,
    writable: true,
    value(index) {
      const length = this.length >>> 0;
      const relative = Number(index) || 0;
      const position = relative < 0 ? length + relative : relative;
      return position < 0 || position >= length ? undefined : this[position];
    }
  });
}
if (!window.structuredClone) window.structuredClone = (value) => JSON.parse(JSON.stringify(value));
if (!String.prototype.matchAll) {
  Object.defineProperty(String.prototype, 'matchAll', {
    configurable: true,
    writable: true,
    value(regexp) {
      const expression = regexp instanceof RegExp
        ? new RegExp(regexp.source, regexp.flags.includes('g') ? regexp.flags : `${regexp.flags}g`)
        : new RegExp(String(regexp), 'g');
      const matches = [];
      let match;
      while ((match = expression.exec(String(this))) !== null) {
        matches.push(match);
        if (match[0] === '') expression.lastIndex += 1;
      }
      return matches;
    }
  });
}
if (!Array.prototype.flat) {
  Object.defineProperty(Array.prototype, 'flat', {
    configurable: true,
    writable: true,
    value(depth = 1) {
      const flatten = (input, remaining) => input.reduce((result, value) => result.concat(Array.isArray(value) && remaining > 0 ? flatten(value, remaining - 1) : value), []);
      return flatten(this, Number(depth) || 0);
    }
  });
}
if (!Array.prototype.flatMap) {
  Object.defineProperty(Array.prototype, 'flatMap', {
    configurable: true,
    writable: true,
    value(callback, thisArg) { return this.map(callback, thisArg).flat(1); }
  });
}
if (window.Element && !Element.prototype.toggleAttribute) {
  Element.prototype.toggleAttribute = function toggleAttribute(name, force) {
    const shouldAdd = force === undefined ? !this.hasAttribute(name) : Boolean(force);
    if (shouldAdd) this.setAttribute(name, ''); else this.removeAttribute(name);
    return shouldAdd;
  };
}
if (!window.queueMicrotask) window.queueMicrotask = (callback) => Promise.resolve().then(callback);



const DASHBOARD_BACKGROUND_PRESETS = Object.freeze({
  dark: { label: 'Dark', color: '#070b0d', image: '/assets/background-dark.png', overlay: 0, fit: 'cover', position: 'center center', fixed: true },
  light: { label: 'Light', color: '#f5f2ed', image: '/assets/background-light.png', overlay: 0, fit: 'cover', position: 'center center', fixed: true },
  black: { label: 'Black', color: '#000000', image: '', overlay: 0, fit: 'cover', position: 'center center', fixed: true },
  white: { label: 'White', color: '#ffffff', image: '', overlay: 0, fit: 'cover', position: 'center center', fixed: true }
});

function normalizeBackgroundDefinition(background = {}) {
  return {
    color: String(background?.color || '#000000'),
    image: String(background?.image || ''),
    overlay: Math.max(0, Math.min(90, Number(background?.overlay ?? 35))),
    fit: ['cover','contain','fill','none'].includes(String(background?.fit)) ? String(background.fit) : 'cover',
    position: ['center center','center top','center bottom','left center','right center'].includes(String(background?.position)) ? String(background.position) : 'center center',
    fixed: background?.fixed !== false
  };
}

function normalizeSavedBackgroundPreset(entry = {}) {
  const id = String(entry?.id || uid('background'));
  return {
    id,
    name: String(entry?.name || 'Custom background').trim().slice(0, 80) || 'Custom background',
    background: normalizeBackgroundDefinition(entry?.background || entry),
    createdAt: Number(entry?.createdAt) || Date.now(),
    updatedAt: Number(entry?.updatedAt) || Number(entry?.createdAt) || Date.now()
  };
}

function savedBackgroundPresetKey(id) { return `saved:${String(id || '')}`; }
function savedBackgroundPresetId(key) { return String(key || '').startsWith('saved:') ? String(key).slice(6) : ''; }
function savedBackgroundPresets() { return Array.isArray(state?.config?.backgroundPresets) ? state.config.backgroundPresets : []; }
function savedBackgroundPresetById(id) { return savedBackgroundPresets().find((entry) => entry.id === String(id || '')) || null; }
function savedBackgroundPresetByKey(key) { return savedBackgroundPresetById(savedBackgroundPresetId(key)); }

function renderSavedBackgroundPresetCard(entry, selectedPreset = '') {
  const key = savedBackgroundPresetKey(entry.id);
  const value = normalizeBackgroundDefinition(entry.background);
  return `<div class="background-preset-card saved-background-preset"><label><input type="radio" name="preset" value="${escapeHtml(key)}" ${selectedPreset === key ? 'checked' : ''}><span data-background-definition="${escapeHtml(JSON.stringify(value))}" data-background-preset-id="${escapeHtml(entry.id)}" style="--background-preset-color:${escapeHtml(value.color)};--background-preset-image:${value.image ? `url(&quot;${escapeHtml(value.image)}&quot;)` : 'none'}"><i></i><b>${escapeHtml(entry.name)}</b><small>Saved preset</small></span></label><button type="button" class="background-preset-delete" data-action="delete-background-preset" data-preset-id="${escapeHtml(entry.id)}" title="Delete preset">${materialSymbol('delete',17)}</button></div>`;
}

function dashboardBackgroundPreset(background = {}) {
  const requested = String(background?.preset || '');
  if (requested === 'custom' || requested.startsWith('saved:') || Object.prototype.hasOwnProperty.call(DASHBOARD_BACKGROUND_PRESETS, requested)) return requested;
  const image = String(background?.image || '');
  const color = String(background?.color || '').toLowerCase();
  const overlay = Number(background?.overlay ?? 0);
  if (image === DASHBOARD_BACKGROUND_PRESETS.dark.image && overlay === 0) return 'dark';
  if (image === DASHBOARD_BACKGROUND_PRESETS.light.image && overlay === 0) return 'light';
  if (!image && color === '#000000' && overlay === 0) return 'black';
  if (!image && color === '#ffffff' && overlay === 0) return 'white';
  return 'custom';
}

function resolvedDashboardBackground(background = {}) {
  const preset = dashboardBackgroundPreset(background);
  if (Object.prototype.hasOwnProperty.call(DASHBOARD_BACKGROUND_PRESETS, preset)) return { preset, ...DASHBOARD_BACKGROUND_PRESETS[preset] };
  if (preset.startsWith('saved:')) {
    const saved = savedBackgroundPresetByKey(preset);
    if (saved) return { preset, ...normalizeBackgroundDefinition(saved.background), savedPresetId: saved.id, savedPresetName: saved.name };
  }
  return { preset: 'custom', ...normalizeBackgroundDefinition(background) };
}

const ENTITY_TYPES = ['activity', 'media_player', 'sensor', 'select', 'button', 'light', 'climate', 'cover'];
const DASHBOARD_GRID_COLUMNS = 24;
const LEGACY_DASHBOARD_GRID_COLUMNS = 12;
const CONTAINER_WIDGET_TYPES = new Set(['conditional', 'tab_container', 'carousel', 'entity_group']);
const TYPE_LABELS = {
  activity: 'Activity',
  media_player: 'Media player',
  sensor: 'Sensor',
  select: 'Select list',
  button: 'Button',
  light: 'Light',
  climate: 'Climate',
  cover: 'Cover'
};

const DEFAULT_SIZES = {
  activity: { w: 8, h: 6 },
  media_player: { w: 12, h: 8 },
  sensor: { w: 8, h: 4 },
  select: { w: 8, h: 4 },
  button: { w: 8, h: 4 },
  light: { w: 8, h: 6 },
  climate: { w: 12, h: 6 },
  cover: { w: 8, h: 6 },
  clock: { w: 8, h: 4 },
  weather: { w: 12, h: 8 },
  activity_launcher: { w: 16, h: 10 },
  camera: { w: 12, h: 10 },
  conditional: { w: 16, h: 10 },
  divider_horizontal: { w: 24, h: 2 },
  divider_vertical: { w: 2, h: 8 },
  text: { w: 8, h: 4 },
  connection: { w: 8, h: 4 },
  power: { w: 8, h: 4 },
  spacer: { w: 8, h: 2 },
  custom_code: { w: 8, h: 6 },
  icon_button: { w: 4, h: 4 },
  text_button: { w: 8, h: 4 },
  icon_text_button: { w: 8, h: 4 },
  media_browser: { w: 16, h: 12 },
  tab_container: { w: 16, h: 10 },
  carousel: { w: 16, h: 10 },
  entity_group: { w: 16, h: 10 },
  gauge: { w: 8, h: 6 },
  scene_routine: { w: 8, h: 6 },
  entity_table: { w: 16, h: 10 },
  counter_statistics: { w: 8, h: 6 },
  timer_countdown: { w: 8, h: 6 },
  room_summary: { w: 12, h: 8 },
  history_graph: { w: 16, h: 8 },
  alert_center: { w: 16, h: 10 },
  entity_template: { w: 10, h: 6 }
};

const SYSTEM_WIDGETS = {
  activity_launcher: {
    label: 'Activity launcher',
    description: 'Launch Remote activities with focused active-media controls.',
    icon: 'activity',
    settings: {
      title: 'Activities', activityEntityIds: '', columns: '2', showIcon: true, showName: true, showState: true, showCount: true, activityConfigs: {},
      mediaBrowserLayoutMode: 'swiper_coverflow', mediaBrowserPageSize: '12', mediaBrowserColumns: '4', mediaBrowserPlayAction: 'PLAY_NOW', mediaBrowserSlidesPerView: '3', mediaBrowserSpaceBetween: '18', mediaBrowserCentered: true, mediaBrowserLoop: false, mediaBrowserNavigation: true, mediaBrowserPagination: true, mediaBrowserShowArtwork: true, mediaBrowserShowSubtitle: true, mediaBrowserShowSearch: true,
      mediaBrowserModalTitle: '', mediaBrowserModalIcon: 'library_music', mediaBrowserModalWidth: 'wide', mediaBrowserModalHeight: 'tall', mediaBrowserModalBackground: '#111111', mediaBrowserModalForeground: '#f4f4f4', mediaBrowserModalRadius: '24', mediaBrowserModalBackdrop: '72', mediaBrowserModalShowHeader: true
    }
  },
  camera: {
    label: 'Camera',
    description: 'Camera image, browser video, or RTSP stream through the dashboard server.',
    icon: 'camera',
    settings: {
      title: 'Camera', sourceUrl: '', sourceType: 'auto', go2rtcApiUrl: '', go2rtcStreamName: '', go2rtcMode: 'webrtc,webrtc/tcp,mse,hls,mjpeg,mp4', posterUrl: '', showTitle: true,
      autoplay: true, muted: true, controls: false, objectFit: 'cover', cameraZoom: '112', refreshSeconds: '10'
    }
  },
  conditional: {
    label: 'Conditional container',
    description: 'Show nested widgets only when an entity condition matches.',
    icon: 'conditional',
    settings: {
      title: 'Conditional group', conditionEntityId: '', operator: 'equals', compareValue: 'ON',
      invert: false, hideWhenFalse: false, falseText: 'Condition not met', items: []
    }
  },
  divider_horizontal: {
    label: 'Horizontal divider', description: 'A configurable horizontal separator.', icon: 'divider_h',
    settings: { color: '#3a3a3a', thickness: '1', style: 'solid', opacity: '100' }
  },
  divider_vertical: {
    label: 'Vertical divider', description: 'A configurable vertical separator.', icon: 'divider_v',
    settings: { color: '#3a3a3a', thickness: '1', style: 'solid', opacity: '100' }
  },
  clock: {
    label: 'Clock & date', description: 'Live time with optional date and seconds.', icon: 'clock',
    settings: { title: '', showDate: true, showSeconds: false, hour12: false, timezone: '', contentAlignment: 'default' }
  },
  weather: {
    label: 'Weather', description: 'Current conditions with optional hourly or daily forecast data.', icon: 'weather',
    settings: { title: 'Weather', contentAlignment: 'default', layout: 'combined', temperatureEntityId: '', conditionEntityId: '', humidityEntityId: '', windEntityId: '', precipitationEntityId: '', uvEntityId: '', sunriseEntityId: '', sunsetEntityId: '', forecastEntityId: '', forecastAttribute: 'forecast', forecastLimit: '6', showCondition: true, showHumidity: true, showWind: true, showPrecipitation: true, showUv: false, showSun: true, showForecast: true }
  },
  text: { label: 'Text', description: 'A heading, note, room label, or instruction.', icon: 'text', settings: { title: 'Heading', body: 'Text', showHeading: true, showBody: true, dividerBelowHeading: false, dividerBelowBody: false, contentAlignment: 'default' } },
  connection: { label: 'Connection status', description: 'Remote Core connection and entity count.', icon: 'wifi', settings: { title: 'Remote', showMessage: true, showEntityCount: true, contentAlignment: 'default' } },
  power: { label: 'Remote power', description: 'Charging state and battery level when available.', icon: 'battery', settings: { title: 'Remote power', showBattery: true, showCharging: true, contentAlignment: 'default' } },
  spacer: { label: 'Spacer', description: 'An empty grid area for visual grouping.', icon: 'spacer', settings: {} },
  custom_code: {
    label: 'Custom code', description: 'Combine HTML, CSS and JavaScript in one configurable widget.', icon: 'code_blocks',
    settings: { textOverflow: 'wrap', customHtmlMode: 'replace', customCodeScope: 'widget', customHtml: '<div class="custom-example"><strong>Custom widget</strong><span>Edit the HTML, CSS and JavaScript in the Advanced tab.</span></div>', customCss: ':host .custom-example { display:grid; place-items:center; gap:8px; height:100%; padding:20px; text-align:center; }', customJs: '' }
  },
  icon_button: {
    label: 'Icon button',
    description: 'Run an entity command using a compact icon-only button.',
    icon: 'touch_app',
    settings: { label: 'Command', subtitle: '', displayMode: 'icon', iconSize: '64', commandAction: '', confirmCommand: false }
  },
  text_button: {
    label: 'Text button',
    description: 'Run an entity command using a text-only button.',
    icon: 'text_fields',
    settings: { label: 'Command', subtitle: '', displayMode: 'text', commandAction: '', confirmCommand: false }
  },
  icon_text_button: {
    label: 'Icon & text button',
    description: 'Run an entity command using an icon, label, and optional subtitle.',
    icon: 'buttons_alt',
    settings: { label: 'Command', subtitle: '', displayMode: 'both', commandAction: '', confirmCommand: false }
  },
  media_browser: {
    label: 'Media browser',
    description: 'Browse, search, and play media exposed by a media-player entity.',
    icon: 'library_music',
    settings: { title: 'Media', mediaEntityId: '', pageSize: '12', columns: '4', showArtwork: true, showSearch: true, showSubtitle: true, playAction: 'PLAY_NOW', layoutMode: 'grid', swiperSlidesPerView: '3', swiperSpaceBetween: '18', swiperCentered: true, swiperLoop: false, swiperNavigation: true, swiperPagination: true }
  },
  tab_container: {
    label: 'Tab container',
    description: 'Organize existing widgets into switchable tabs.',
    icon: 'tab',
    settings: { title: 'Tabs', activeTabId: '', tabs: [{ id: 'tab-1', name: 'Tab 1', items: [] }, { id: 'tab-2', name: 'Tab 2', items: [] }] }
  },
  carousel: {
    label: 'Carousel container',
    description: 'Show one contained widget at a time with arrows, dots, or automatic rotation.',
    icon: 'view_carousel',
    settings: { title: 'Carousel', items: [], showArrows: true, showDots: true, showCounter: true, containerStyle: true, autoplay: false, intervalSeconds: '8', swiperEffect: 'slide', swiperSlidesPerView: '1', swiperSpaceBetween: '12', swiperCentered: true, swiperLoop: false }
  },
  entity_group: {
    label: 'Entity group',
    description: 'Combine existing entity widgets into one compact group.',
    icon: 'dataset',
    settings: { title: 'Entity group', items: [], columns: '2', showHeading: true, containerStyle: true }
  },
  gauge: {
    label: 'Gauge',
    description: 'Display a numeric entity value as a configurable radial gauge.',
    icon: 'speed',
    settings: { title: 'Gauge', entityId: '', valueAttribute: '', min: '0', max: '100', decimals: '0', unit: '', color: '#d0d0d0', trackColor: '#2a2a2a', showName: true, showValue: true, showUnit: true, contentAlignment: 'default' }
  },
  scene_routine: {
    label: 'Scene & routine',
    description: 'Run one or more entity commands as scenes, routines, or favorite actions.',
    icon: 'auto_awesome',
    settings: { title: 'Scenes & routines', routineActions: [], columns: '2', showLastRun: true, showState: true }
  },
  entity_table: {
    label: 'Entity table',
    description: 'Show a sortable, dense list of selected entities and attributes.',
    icon: 'table_rows',
    settings: { title: 'Entities', entityIds: '', attribute: '', filter: '', sortBy: 'name', sortDirection: 'asc', groupBy: 'none', showIcon: true, showState: true, showLastChanged: true, compact: false }
  },
  counter_statistics: {
    label: 'Counter & statistics',
    description: 'Count, sum, average, or compare values from multiple entities.',
    icon: 'calculate',
    settings: { title: 'Statistic', entityIds: '', operation: 'count_matching', attribute: '', operator: 'truthy', compareValue: 'on', decimals: '0', unit: '', showBreakdown: true, contentAlignment: 'default' }
  },
  timer_countdown: {
    label: 'Timer, stopwatch & countdown',
    description: 'Run a persistent local timer, stopwatch, or countdown on the dashboard.',
    icon: 'timer',
    settings: { title: 'Timer', mode: 'countdown', durationSeconds: '300', presets: '60,300,600,1800', finishAction: '', finishSound: '', finishSoundName: '', playFinishSound: true, showPresets: true, showProgress: true, contentAlignment: 'default' }
  },
  room_summary: {
    label: 'Room summary',
    description: 'Summarize climate, occupancy, lights, openings, media, and warnings for one room.',
    icon: 'meeting_room',
    settings: { title: 'Room', area: '', autoDiscover: true, entityIds: '', temperatureEntityId: '', humidityEntityId: '', occupancyEntityId: '', climateEntityId: '', mediaEntityId: '', warningEntityIds: '', navigateDashboardId: '', layout: 'standard', showTemperature: true, showHumidity: true, showLights: true, showOpenings: true, showOccupancy: true, showMedia: true, showClimate: true, showWarnings: true }
  },
  history_graph: {
    label: 'History graph',
    description: 'Plot locally sampled entity values without reloading the dashboard.',
    icon: 'show_chart',
    settings: { title: 'History', entityIds: '', attribute: '', chartType: 'line', rangeHours: '24', maxPoints: '120', showLegend: true, showStats: true, threshold: '', comparePrevious: false, decimals: '1' }
  },
  entity_template: {
    label: 'Entity template',
    description: 'Build a fully configurable entity-driven widget from reusable elements.',
    icon: 'data_object',
    settings: { title: 'Entity template', entityId: '', templateColumns: '2', templateGap: '10', templateElements: [] }
  },
  alert_center: {
    label: 'Notification & alert center',
    description: 'Collect automatic and custom entity alerts in one actionable list.',
    icon: 'notifications_active',
    settings: { title: 'Alerts', alertRules: [], showEmptyState: true, maxAlerts: '20', contentAlignment: 'default' }
  }
};

const DEFAULT_ELEMENTS = {
  activity: { showIcon: true, showImage: true, showName: true, showState: true, showDescription: true, showIntegration: false, showMetadata: true, showRelatedEntities: true, relatedShowArtwork: true, relatedShowIcon: true, relatedShowName: true, relatedShowRole: true, relatedShowState: true, relatedShowValue: true, relatedShowMedia: true, relatedShowControls: false, relatedShowVolume: false, showControls: true, showMediaBrowser: false },
  media_player: { showArtwork: true, showIcon: true, showName: true, showTitle: true, showArtist: true, showState: false, showPlayback: true, showVolume: true, showProgress: true, showMediaBrowser: false },
  sensor: { showIcon: true, showName: true, showDeviceClass: true, showValue: true, showUnit: true },
  select: { showIcon: true, showName: true, showState: true, showControl: true },
  button: { showIcon: true, showName: true, showState: true, showControl: true },
  light: { showIcon: true, showName: true, showState: true, showPower: true, showBrightness: true, showColor: true, showColorTemperature: true },
  climate: { showIcon: true, showName: true, showCurrentTemperature: true, showMode: true, showTargetTemperature: true, showStepper: true, showModes: true },
  cover: { showIcon: true, showName: true, showState: true, showPosition: true, showButtons: true, showSlider: true }
};

const ELEMENT_OPTIONS = {
  activity: [['showIcon', 'Icon'], ['showImage', 'Background image'], ['showName', 'Name'], ['showState', 'State'], ['showDescription', 'Description'], ['showIntegration', 'Integration'], ['showMetadata', 'Formatted metadata'], ['showRelatedEntities', 'Related entities'], ['relatedShowArtwork', 'Related media artwork'], ['relatedShowIcon', 'Related entity icons'], ['relatedShowName', 'Related entity names'], ['relatedShowRole', 'Related entity roles'], ['relatedShowState', 'Related entity states'], ['relatedShowValue', 'Related values'], ['relatedShowMedia', 'Related media details'], ['relatedShowControls', 'Related entity controls'], ['relatedShowVolume', 'Related media volume controls'], ['showControls', 'Start / stop controls'], ['showMediaBrowser', 'Media browser button']],
  media_player: [['showArtwork', 'Artwork'], ['showIcon', 'Fallback icon'], ['showName', 'Entity name'], ['showTitle', 'Media title'], ['showArtist', 'Artist / source'], ['showState', 'Playback state'], ['showPlayback', 'Playback controls'], ['showVolume', 'Volume controls'], ['showProgress', 'Media progress'], ['showMediaBrowser', 'Media browser button']],
  sensor: [['showIcon', 'Icon'], ['showName', 'Name'], ['showDeviceClass', 'Sensor type'], ['showValue', 'Value'], ['showUnit', 'Unit']],
  select: [['showIcon', 'Icon'], ['showName', 'Name'], ['showState', 'Current selection'], ['showControl', 'Selection control']],
  button: [['showIcon', 'Icon'], ['showName', 'Name'], ['showState', 'State / action label'], ['showControl', 'Press control']],
  light: [['showIcon', 'Icon'], ['showName', 'Name'], ['showState', 'State'], ['showPower', 'Power control'], ['showBrightness', 'Brightness slider'], ['showColor', 'Color wheel'], ['showColorTemperature', 'Color-temperature slider']],
  climate: [['showIcon', 'Icon'], ['showName', 'Name'], ['showCurrentTemperature', 'Current temperature'], ['showMode', 'Current mode'], ['showTargetTemperature', 'Target temperature'], ['showStepper', 'Temperature stepper'], ['showModes', 'Mode controls']],
  cover: [['showIcon', 'Icon'], ['showName', 'Name'], ['showState', 'State'], ['showPosition', 'Position'], ['showButtons', 'Open / stop / close controls'], ['showSlider', 'Position slider']]
};

const URL_PARAMETERS = new URLSearchParams(window.location.search);
const KIOSK_MODE = URL_PARAMETERS.has('kiosk');
const KIOSK_START_DASHBOARD = String(URL_PARAMETERS.get('p') || '').trim();
const app = document.querySelector('#app');
const drawerRoot = document.querySelector('#drawer-root');
const modalRoot = document.querySelector('#modal-root');
const toastRegion = document.querySelector('#toast-region');
const iconLibraryRoot = document.createElement('div');
iconLibraryRoot.id = 'unfolded-tools-icon-library-root';
document.body.append(iconLibraryRoot);
const frozenDashboardRoot = document.createElement('div');
frozenDashboardRoot.id = 'frozen-dashboard-root';
frozenDashboardRoot.setAttribute('aria-hidden', 'true');
document.body.append(frozenDashboardRoot);

const state = {
  config: null,
  entities: new Map(),
  entityCatalog: [],
  defaultDictionaries: {},
  connected: false,
  connectionStatus: 'offline',
  connectionMessage: 'Offline',
  runtime: null,
  eventSource: null,
  editMode: false,
  drawerOpen: false,
  drawerTab: 'entities',
  pendingWidgetPlacement: null,
  placementHover: null,
  modal: null,
  entityFilter: 'all',
  entitySearch: '',
  settings: {
    remoteHttpUrl: '',
    remoteWsUrl: '',
    apiKeyConfigured: false,
    apiKeyName: '',
    provisionedAt: '',
    reconnect: true,
    chargingGated: false,
    dashboardPort: 11080,
    onRemote: false,
    environmentOverrides: {},
    unfoldedToolsApiKeyConfigured: false,
    unfoldedToolsCacheSelected: true,
    unfoldedToolsIncludeInBackup: true
  },
  saveTimer: null,
  editorDirty: false,
  editorSaving: false,
  drag: null,
  pageSwipe: null,
  suppressPageClickUntil: 0,
  kioskMode: KIOSK_MODE,
  customScriptCleanups: new Map(),
  materialSymbols: [],
  materialSymbolsLoaded: false,
  materialSymbolsLoading: false,
  materialSymbolPage: 1,
  lightColorDrag: null,
  customColorDrag: null,
  mediaBrowsers: new Map(),
  carouselIndexes: new Map(),
  carouselNextAt: new Map(),
  screensaverActive: false,
  screensaverExiting: false,
  screensaverExitTimer: null,
  screensaverUnlockPrompt: false,
  screensaverTimer: null,
  lastActivityAt: Date.now(),
  kioskScaleRaf: null,
  viewDashboardId: '',
  mediaSwiperPointer: null,
  suppressMediaClickUntil: 0,
  renderingPreview: false,
  dashboardTransition: null,
  kioskStartDashboardApplied: false,
  lastColumns: 0,
  viewportResizeTimer: null,
  undoStack: [],
  redoStack: [],
  historyCurrent: '',
  historyApplying: false,
  runtimePatchRaf: null,
  screensaverTrigger: null,
  screensaverTriggerTimer: null,
  screensaverWidgetFullscreen: false,
  unlockedDashboards: new Set(),
  dashboardRelockTimers: new Map(),
  statusBarDrag: null,
  statusBarPointerDrag: null,
  pendingDashboardId: '',
  widgetPress: null,
  widgetTapTimers: new Map(),
  suppressWidgetClickUntil: 0,
  suppressWidgetClickItemId: '',
  widgetClipboard: null,
  dashboardClipboard: loadDashboardClipboard(),
  editContainerId: '',
  collapsedContainers: new Set(),
  nestedDrag: null,
  localTimers: new Map(),
  entityHistory: new Map(),
  historyLastSampleAt: 0,
  dismissedAlerts: new Map(),
  dashboardViewStates: new Map(),
  sharedDashboardGeometry: null,
  dashboardShellCache: new Map(),
  backupImportCandidate: null,
  backupImportBusy: false,
  unfoldedToolsPicker: { open: false, category: 'apps', country: '', query: '', page: 1, pages: 1, total: 0, icons: [], countries: [], loading: false, error: '', target: null, selectingId: '' }
};

const DASHBOARD_CLIPBOARD_STORAGE_KEY = 'uc-dashboard-clipboard-v1';

function normalizeDashboardClipboard(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const entities = Array.isArray(source.entities) ? source.entities.slice(0, 40).map((entry) => ({
    id: String(entry?.id || uid('clipboard-entity')),
    entityId: String(entry?.entityId || ''),
    label: String(entry?.label || entry?.entityId || 'Entity'),
    copiedAt: Number(entry?.copiedAt) || Date.now()
  })).filter((entry) => entry.entityId) : [];
  const widgets = Array.isArray(source.widgets) ? source.widgets.slice(0, 40).map((entry) => ({
    id: String(entry?.id || uid('clipboard-widget')),
    label: String(entry?.label || 'Widget'),
    template: entry?.template && typeof entry.template === 'object' ? entry.template : null,
    copiedAt: Number(entry?.copiedAt) || Date.now()
  })).filter((entry) => entry.template) : [];
  const last = source.last && ['entity','widget'].includes(source.last.kind) ? { kind:source.last.kind, id:String(source.last.id || '') } : null;
  return { entities, widgets, last };
}

function loadDashboardClipboard() {
  try { return normalizeDashboardClipboard(JSON.parse(localStorage.getItem(DASHBOARD_CLIPBOARD_STORAGE_KEY) || '{}')); }
  catch { return normalizeDashboardClipboard(); }
}

function persistDashboardClipboard() {
  state.dashboardClipboard = normalizeDashboardClipboard(state.dashboardClipboard);
  try { localStorage.setItem(DASHBOARD_CLIPBOARD_STORAGE_KEY, JSON.stringify(state.dashboardClipboard)); } catch {}
}

function dashboardClipboardCount() {
  return (state.dashboardClipboard?.entities?.length || 0) + (state.dashboardClipboard?.widgets?.length || 0);
}

function dashboardClipboardEntry(kind, id) {
  const collection = kind === 'entity' ? state.dashboardClipboard?.entities : state.dashboardClipboard?.widgets;
  return (collection || []).find((entry) => entry.id === id) || null;
}

function copyEntityToDashboardClipboard(entityId) {
  const entity = state.entities.get(entityId);
  if (!entity) return;
  const entries = state.dashboardClipboard.entities ||= [];
  const existing = entries.find((entry) => entry.entityId === entityId);
  if (existing) entries.splice(entries.indexOf(existing), 1);
  const entry = { id:existing?.id || uid('clipboard-entity'), entityId, label:localName(entity.name, entityId), copiedAt:Date.now() };
  entries.unshift(entry);
  entries.splice(40);
  state.dashboardClipboard.last = { kind:'entity', id:entry.id };
  persistDashboardClipboard();
  syncDrawer();
  toast(`${entry.label} copied to clipboard`);
}

function copyWidgetToDashboardClipboard(itemId) {
  const { item } = findDashboardItem(itemId);
  if (!item) return;
  const entity = item.kind === 'entity' ? entityForItem(item) : null;
  const label = item.kind === 'system' ? (SYSTEM_WIDGETS[item.widgetType]?.label || item.widgetType || 'Widget') : localName(entity?.name, item.entityId || 'Entity');
  const entry = { id:uid('clipboard-widget'), label, template:structuredClone(item), copiedAt:Date.now() };
  state.dashboardClipboard.widgets ||= [];
  state.dashboardClipboard.widgets.unshift(entry);
  state.dashboardClipboard.widgets.splice(40);
  state.dashboardClipboard.last = { kind:'widget', id:entry.id };
  persistDashboardClipboard();
  syncDrawer();
  toast(`${label} widget copied to clipboard`);
}

function pasteDashboardClipboardEntry(kind, id) {
  const entry = dashboardClipboardEntry(kind, id);
  if (!entry) return toast('Clipboard item is no longer available', 'error');
  if (kind === 'entity') {
    const entity = state.entities.get(entry.entityId);
    if (!entity) return toast('The copied entity is not currently available', 'error');
    beginWidgetPlacement(createEntityWidget(entity), localName(entity.name, entry.entityId));
    return;
  }
  const item = renewWidgetIds(structuredClone(entry.template));
  item.x = 0; item.y = 0;
  beginWidgetPlacement(item, entry.label || 'Copied widget');
}

function pasteLastDashboardClipboardEntry() {
  const last = state.dashboardClipboard?.last;
  if (!last?.id) return toast('The dashboard clipboard is empty', 'error');
  pasteDashboardClipboardEntry(last.kind, last.id);
}

function removeDashboardClipboardEntry(kind, id) {
  const key = kind === 'entity' ? 'entities' : 'widgets';
  state.dashboardClipboard[key] = (state.dashboardClipboard[key] || []).filter((entry) => entry.id !== id);
  if (state.dashboardClipboard.last?.kind === kind && state.dashboardClipboard.last?.id === id) {
    const next = state.dashboardClipboard.widgets[0] ? { kind:'widget', id:state.dashboardClipboard.widgets[0].id } : state.dashboardClipboard.entities[0] ? { kind:'entity', id:state.dashboardClipboard.entities[0].id } : null;
    state.dashboardClipboard.last = next;
  }
  persistDashboardClipboard();
  renderDrawerTabContent();
}

function clearDashboardClipboard() {
  state.dashboardClipboard = normalizeDashboardClipboard();
  persistDashboardClipboard();
  renderDrawerTabContent();
  toast('Dashboard clipboard cleared');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function uid(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

async function loadMaterialSymbolsCatalog() {
  if (state.materialSymbolsLoaded) return;
  state.materialSymbols = MATERIAL_SYMBOL_NAMES.slice();
  state.materialSymbolsLoaded = true;
  state.materialSymbolsLoading = false;
}

const MATERIAL_SYMBOL_PAGE_SIZE = 120;

function materialSymbolPickerResults(query = '', requestedPage = state.materialSymbolPage) {
  const normalized = String(query || '').trim().toLowerCase();
  const source = state.materialSymbolsLoaded ? state.materialSymbols : MATERIAL_SYMBOL_NAMES;
  const matches = normalized ? source.filter((name) => name.includes(normalized)) : source;
  const pages = Math.max(1, Math.ceil(matches.length / MATERIAL_SYMBOL_PAGE_SIZE));
  const page = Math.max(1, Math.min(pages, Number(requestedPage) || 1));
  const start = (page - 1) * MATERIAL_SYMBOL_PAGE_SIZE;
  return { total: matches.length, pages, page, visible: matches.slice(start, start + MATERIAL_SYMBOL_PAGE_SIZE) };
}

function renderMaterialSymbolResults(query = '') {
  const { total, pages, page, visible } = materialSymbolPickerResults(query);
  state.materialSymbolPage = page;
  return `<div class="material-icon-result-head"><div class="material-icon-pagination" aria-label="Icon pages"><button type="button" data-action="material-icon-page" data-page="1" ${page <= 1 ? 'disabled' : ''} title="First page">${materialSymbol('first_page', 18)}</button><button type="button" data-action="material-icon-page" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} title="Previous page">${materialSymbol('chevron_left', 18)}</button><span>${page} / ${pages}</span><button type="button" data-action="material-icon-page" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} title="Next page">${materialSymbol('chevron_right', 18)}</button><button type="button" data-action="material-icon-page" data-page="${pages}" ${page >= pages ? 'disabled' : ''} title="Last page">${materialSymbol('last_page', 18)}</button></div></div><div class="material-icon-grid">${visible.map((name) => `<button type="button" class="material-icon-option" data-action="select-material-icon" data-icon-name="${escapeHtml(name)}" title="${escapeHtml(name)}">${materialSymbol(name, 27)}<span>${escapeHtml(name)}</span></button>`).join('')}</div>`;
}

function updateMaterialSymbolPicker(root = modalRoot, page = null) {
  if (page !== null) state.materialSymbolPage = Math.max(1, Number(page) || 1);
  const search = root.querySelector('[data-material-icon-search]');
  const results = root.querySelector('[data-material-icon-results]');
  if (results) results.innerHTML = renderMaterialSymbolResults(search?.value || '');
}

function chosenIconIsImage(value) {
  return /^(?:data:image\/|blob:|https?:\/\/|\/)/i.test(String(value || '').trim());
}

function renderChosenIcon(value, size = 24, fallback = 'dashboard') {
  const selected = String(value || '').trim() || fallback;
  if (chosenIconIsImage(selected)) return `<img class="chosen-icon-image" src="${escapeHtml(selected)}" alt="" style="width:${Number(size) || 24}px;height:${Number(size) || 24}px">`;
  return materialSymbol(/^[a-z0-9_]+$/i.test(selected) ? selected : fallback, size);
}

function iconChoiceField(name, value = '', label = 'Icon', { fallback = 'dashboard', allowEmpty = false, compact = false } = {}) {
  const selected = String(value || '').trim();
  const shown = selected || fallback;
  const preview = renderChosenIcon(shown, compact ? 26 : 34, fallback);
  return `<div class="field reusable-icon-choice ${compact ? 'compact' : ''}" data-icon-choice data-icon-target="${escapeHtml(name)}" data-icon-fallback="${escapeHtml(fallback)}"><label>${escapeHtml(label)}</label><div class="reusable-icon-choice-row"><span class="reusable-icon-choice-preview" data-icon-choice-preview>${preview}</span><input class="settings-input" name="${escapeHtml(name)}" value="${escapeHtml(selected)}" placeholder="${escapeHtml(fallback)}" ${compact ? '' : 'readonly'}><button type="button" class="pill-button" data-action="toggle-material-icon-picker">${materialSymbol('apps',18)} Material</button><button type="button" class="pill-button unfolded-tools-picker-open" data-action="open-unfolded-tools-picker">${materialSymbol('language',18)} unfolded.tools</button><label class="icon-upload-button" title="Upload PNG or SVG">${materialSymbol('upload',18)}<input type="file" data-generic-icon-upload accept="image/png,image/svg+xml,image/webp"></label>${allowEmpty ? `<button type="button" class="icon-choice-clear" data-action="clear-icon-choice" title="Clear icon">${materialSymbol('close',18)}</button>` : ''}</div><div class="material-icon-picker" data-material-icon-picker hidden><input class="settings-input" type="search" data-material-icon-search placeholder="Search icons"><div data-material-icon-results>${renderMaterialSymbolResults('')}</div></div><small>Choose a bundled Material Symbol, browse unfolded.tools, or upload an icon image. Selected unfolded.tools icons can be cached locally for offline use.</small></div>`;
}

function updateIconChoicePreview(choice) {
  if (!choice) return;
  const input = choice.querySelector('[name]');
  const preview = choice.querySelector('[data-icon-choice-preview]');
  if (preview) preview.innerHTML = renderChosenIcon(input?.value || '', choice.classList.contains('compact') ? 26 : 34, choice.dataset.iconFallback || 'dashboard');
}


const UNFOLDED_TOOLS_ICON_CATEGORIES = [
  ['apps', 'App Icons'],
  ['tv-apps', 'TV App Icons'],
  ['community', 'Community Icons'],
  ['tv-logos', 'TV Channel Logos']
];

function unfoldedToolsCategoryLabel(category) {
  return UNFOLDED_TOOLS_ICON_CATEGORIES.find(([value]) => value === category)?.[1] || category;
}

function formatByteSize(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function renderUnfoldedToolsIconLibrary() {
  const picker = state.unfoldedToolsPicker;
  if (!picker.open) { iconLibraryRoot.innerHTML = ''; return; }
  const configured = Boolean(state.settings.unfoldedToolsApiKeyConfigured);
  const countryOptions = picker.countries.map((entry) => `<option value="${escapeHtml(entry.country)}" ${picker.country === entry.country ? 'selected' : ''}>${escapeHtml(entry.country.replaceAll('-', ' '))} (${entry.iconCount})</option>`).join('');
  const results = picker.loading
    ? `<div class="unfolded-tools-library-state">${materialSymbol('progress_activity', 30)}<strong>Loading icon library…</strong></div>`
    : picker.error
      ? `<div class="unfolded-tools-library-state error">${materialSymbol('error', 30)}<strong>${escapeHtml(picker.error)}</strong><button type="button" class="pill-button" data-unfolded-tools-action="retry">${materialSymbol('refresh',18)} Retry</button></div>`
      : !picker.icons.length
        ? `<div class="unfolded-tools-library-state">${materialSymbol('search_off', 30)}<strong>No matching icons</strong></div>`
        : `<div class="unfolded-tools-icon-grid">${picker.icons.map((entry) => `<button type="button" class="unfolded-tools-icon-card" data-unfolded-tools-action="select" data-icon-id="${escapeHtml(entry.id)}" data-icon-name="${escapeHtml(entry.name)}" ${picker.selectingId ? 'disabled' : ''}><span><img src="${escapeHtml(entry.thumbnailUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span><strong>${escapeHtml(entry.name)}</strong>${picker.selectingId === entry.id ? `<small>${materialSymbol('progress_activity',15)} Saving…</small>` : `<small>${escapeHtml(unfoldedToolsCategoryLabel(entry.category))}</small>`}</button>`).join('')}</div>`;
  const pagination = picker.pages > 1 ? `<div class="unfolded-tools-pagination"><button type="button" data-unfolded-tools-action="page" data-page="${picker.page - 1}" ${picker.page <= 1 || picker.loading ? 'disabled' : ''}>${materialSymbol('chevron_left',20)} Previous</button><span>${picker.page} / ${picker.pages} · ${picker.total} icons</span><button type="button" data-unfolded-tools-action="page" data-page="${picker.page + 1}" ${picker.page >= picker.pages || picker.loading ? 'disabled' : ''}>Next ${materialSymbol('chevron_right',20)}</button></div>` : `<div class="unfolded-tools-pagination"><span>${picker.total} icons</span></div>`;
  iconLibraryRoot.innerHTML = localizedDashboardMarkup(`<div class="unfolded-tools-library-backdrop" data-unfolded-tools-action="close"></div><section class="unfolded-tools-library-dialog" role="dialog" aria-modal="true" aria-label="unfolded.tools icon library"><header><div><span class="unfolded-tools-brand-mark">u</span><div><h2>unfolded.tools Icon Library</h2><p>Select an icon and add it directly to UC Dashboard.</p></div></div><button type="button" data-unfolded-tools-action="close" title="Close">${materialSymbol('close',22)}</button></header>${configured ? `<nav class="unfolded-tools-category-tabs">${UNFOLDED_TOOLS_ICON_CATEGORIES.map(([value,label]) => `<button type="button" data-unfolded-tools-action="category" data-category="${value}" class="${picker.category === value ? 'active' : ''}">${escapeHtml(label)}</button>`).join('')}</nav><div class="unfolded-tools-library-toolbar"><label>${materialSymbol('search',19)}<input type="search" data-unfolded-tools-search value="${escapeHtml(picker.query)}" placeholder="Search this library" autocomplete="off"></label>${picker.category === 'tv-logos' ? `<select class="settings-input" data-unfolded-tools-country aria-label="TV logo country">${countryOptions}</select>` : ''}</div><div class="unfolded-tools-library-results">${results}</div>${pagination}<footer><span>Selected icons are ${state.settings.unfoldedToolsCacheSelected !== false ? 'cached locally for offline use' : 'linked from unfolded.tools'}.</span><a href="https://unfolded.tools" target="_blank" rel="noopener noreferrer">unfolded.tools</a></footer>` : `<div class="unfolded-tools-library-state missing-key">${materialSymbol('key',34)}<strong>Connect unfolded.tools first</strong><p>Add an API key under Settings → Icons, save the settings, and reopen the library.</p><button type="button" class="pill-button" data-unfolded-tools-action="close">Close</button></div>`}</section>`);
}

async function loadUnfoldedToolsCountries() {
  const picker = state.unfoldedToolsPicker;
  if (picker.countries.length) return;
  const response = await fetch('/api/unfolded-tools/countries', { cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Country request failed (${response.status})`);
  picker.countries = Array.isArray(result.countries) ? result.countries : [];
  if (!picker.country || !picker.countries.some((entry) => entry.country === picker.country)) {
    picker.country = picker.countries.find((entry) => entry.country === 'germany')?.country || picker.countries[0]?.country || '';
  }
}

async function loadUnfoldedToolsIcons() {
  const picker = state.unfoldedToolsPicker;
  if (!picker.open || !state.settings.unfoldedToolsApiKeyConfigured) return;
  picker.loading = true;
  picker.error = '';
  renderUnfoldedToolsIconLibrary();
  try {
    if (picker.category === 'tv-logos') await loadUnfoldedToolsCountries();
    const params = new URLSearchParams({ category: picker.category, query: picker.query, page: String(picker.page), limit: '48' });
    if (picker.category === 'tv-logos') params.set('country', picker.country);
    const response = await fetch(`/api/unfolded-tools/icons?${params}`, { cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Icon request failed (${response.status})`);
    picker.icons = Array.isArray(result.icons) ? result.icons : [];
    picker.total = Number(result.total) || 0;
    picker.page = Number(result.page) || 1;
    picker.pages = Number(result.pages) || 1;
  } catch (error) {
    picker.icons = [];
    picker.total = 0;
    picker.pages = 1;
    picker.error = error.message;
  } finally {
    picker.loading = false;
    renderUnfoldedToolsIconLibrary();
    iconLibraryRoot.querySelector('[data-unfolded-tools-search]')?.focus();
  }
}

function openUnfoldedToolsIconLibrary(actionNode) {
  const choice = actionNode.closest('[data-icon-choice]');
  const form = actionNode.closest('[data-widget-settings-form]');
  state.unfoldedToolsPicker = {
    ...state.unfoldedToolsPicker,
    open: true,
    query: '',
    page: 1,
    icons: [],
    total: 0,
    pages: 1,
    loading: false,
    error: '',
    selectingId: '',
    target: choice ? { kind: 'generic', choice, input: choice.querySelector('[name]') } : { kind: 'widget', form }
  };
  renderUnfoldedToolsIconLibrary();
  void loadUnfoldedToolsIcons();
}

function closeUnfoldedToolsIconLibrary() {
  state.unfoldedToolsPicker.open = false;
  state.unfoldedToolsPicker.target = null;
  state.unfoldedToolsPicker.selectingId = '';
  renderUnfoldedToolsIconLibrary();
}

async function selectUnfoldedToolsIcon(button) {
  const picker = state.unfoldedToolsPicker;
  if (picker.selectingId) return;
  const id = String(button.dataset.iconId || '');
  if (!id) return;
  picker.selectingId = id;
  renderUnfoldedToolsIconLibrary();
  try {
    const response = await fetch('/api/unfolded-tools/cache', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ category: picker.category, country: picker.country, id })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Icon selection failed (${response.status})`);
    const target = picker.target;
    if (result.asset?.fileName) {
      state.config.iconAssets ||= {};
      state.config.iconAssets[result.asset.fileName] = result.asset;
    }
    if (target?.kind === 'generic' && target.input?.isConnected) {
      target.input.value = result.url;
      target.input.dispatchEvent(new Event('input', { bubbles: true }));
      updateIconChoicePreview(target.choice);
    } else if (target?.kind === 'widget' && target.form?.isConnected) {
      const form = target.form;
      const mode = form.querySelector('[name="iconMode"]');
      const url = form.querySelector('[name="unfoldedToolsIconUrl"]');
      const asset = form.querySelector('[name="unfoldedToolsIconAsset"]');
      if (mode) mode.value = 'unfolded_tools';
      if (url) url.value = result.url;
      if (asset) asset.value = JSON.stringify(result.asset || {});
      form.querySelectorAll('[data-uploaded-icon-preview],[data-material-icon-preview]').forEach((node) => { node.hidden = true; });
      const preview = form.querySelector('[data-unfolded-tools-icon-preview]');
      if (preview) {
        preview.hidden = false;
        preview.innerHTML = `<img src="${escapeHtml(result.url)}" alt=""><span>${escapeHtml(result.asset?.name || button.dataset.iconName || 'unfolded.tools icon')}</span>`;
      }
      scheduleWidgetEditorPreview(form);
    }
    persistConfig();
    closeUnfoldedToolsIconLibrary();
    toast(translateDashboardText(`Added ${result.asset?.name || button.dataset.iconName || 'icon'} from unfolded.tools`));
  } catch (error) {
    picker.error = error.message;
    picker.selectingId = '';
    renderUnfoldedToolsIconLibrary();
  }
}

function localName(name, fallback = 'Unnamed entity') {
  if (typeof name === 'string') return name;
  if (!name || typeof name !== 'object') return fallback;
  const language = (navigator.language || 'en').split('-')[0];
  return name[language] || name.en || Object.values(name)[0] || fallback;
}

function localizationSettings() {
  const source = state.config?.ui?.localization && typeof state.config.ui.localization === 'object' ? state.config.ui.localization : {};
  return {
    enabled: Boolean(source.enabled),
    language: String(source.language || 'en').toLowerCase(),
    customDictionaries: source.customDictionaries && typeof source.customDictionaries === 'object' ? source.customDictionaries : {}
  };
}

function dashboardLocale() {
  const settings = localizationSettings();
  return settings.enabled ? settings.language : undefined;
}

function dashboardDictionary(language = localizationSettings().language) {
  const code = String(language || 'en').toLowerCase();
  const defaults = state.defaultDictionaries?.[code] || state.defaultDictionaries?.en || {};
  const custom = localizationSettings().customDictionaries?.[code] || {};
  return { ...defaults, ...(custom && typeof custom === 'object' ? custom : {}) };
}

function translationKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

function translateDashboardValue(value, variables = {}) {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  const settings = localizationSettings();
  if (!settings.enabled) return raw.replaceAll('_', ' ');
  const key = translationKey(raw);
  let translated = dashboardDictionary()[key];
  if (translated === undefined || translated === null || translated === '') translated = raw.replaceAll('_', ' ');
  return String(translated).replace(/\{([a-z0-9_]+)\}/gi, (_, name) => variables[name] === undefined ? `{${name}}` : String(variables[name]));
}

function translatedEntityState(entity) {
  return translateDashboardValue(entityState(entity));
}

function translateDashboardText(value, variables = {}) {
  const raw = String(value ?? '');
  const settings = localizationSettings();
  if (!settings.enabled || !raw.trim()) return raw;
  const trimmed = raw.trim();
  const dictionary = dashboardDictionary();
  let translated = dictionary[translationKey(trimmed)];
  let replacements = variables;
  if (translated === undefined || translated === null || translated === '') {
    const patterns = [
      [/^(\d+) available$/i, 'available_count', (match) => ({ count:match[1] })],
      [/^(\d+) dashboards?$/i, 'dashboard_count', (match) => ({ count:match[1] })],
      [/^(\d+) widgets?$/i, 'widget_count', (match) => ({ count:match[1] })],
      [/^backup restored: (\d+) dashboards?$/i, 'backup_restored_dashboard_count', (match) => ({ count:match[1] })],
      [/^backup is invalid: (.+)$/i, 'backup_invalid_reason', (match) => ({ reason:match[1] })],
      [/^(\d+) entities$/i, 'entity_count', (match) => ({ count:match[1] })],
      [/^(\d+) alerts?$/i, 'alert_count', (match) => ({ count:match[1] })],
      [/^(\d+) icons?$/i, 'icon_count', (match) => ({ count:match[1] })],
      [/^(\d+) \/ (\d+) · (\d+) icons?$/i, 'icon_page_summary', (match) => ({ page:match[1], pages:match[2], count:match[3] })],
      [/^connected\. (\d+) app icons are currently available\.$/i, 'connected_app_icons_available', (match) => ({ count:match[1] })],
      [/^added (.+) from unfolded\.tools$/i, 'added_icon_from_unfolded_tools', (match) => ({ name:match[1] })],
      [/^page (\d+) of (\d+)$/i, 'page_of', (match) => ({ page:match[1], pages:match[2] })],
      [/^connected to (.+)$/i, 'connected_to', (match) => ({ name:match[1] })],
      [/^this dashboard is locked\. hint: (.+)$/i, 'dashboard_locked_with_hint', (match) => ({ hint:match[1] })],
      [/^browse media for (.+)$/i, 'browse_media_for', (match) => ({ name:match[1] })],
      [/^start (.+)$/i, 'start_name', (match) => ({ name:match[1] })],
      [/^stop (.+)$/i, 'stop_name', (match) => ({ name:match[1] })],
      [/^play (.+)$/i, 'play_name', (match) => ({ name:match[1] })],
      [/^open (.+)$/i, 'open_name', (match) => ({ name:match[1] })],
      [/^choose a grid field for (.+)$/i, 'choose_grid_field_for', (match) => ({ name:match[1] })],
      [/^(.+) copied to clipboard$/i, 'copied_to_clipboard', (match) => ({ name:match[1] })],
      [/^(.+) widget copied to clipboard$/i, 'widget_copied_to_clipboard', (match) => ({ name:match[1] })],
      [/^(.+) pressed$/i, 'entity_pressed', (match) => ({ name:match[1] })],
      [/^(.+) finished$/i, 'timer_finished', (match) => ({ name:match[1] })],
      [/^(.+) locked after inactivity$/i, 'dashboard_locked_after_inactivity', (match) => ({ name:match[1] })],
      [/^(.+) · pin locked$/i, 'dashboard_name_pin_locked', (match) => ({ name:match[1] })],
      [/^enter the screensaver pin to return to the dashboard\. hint: (.+)$/i, 'screensaver_pin_with_hint', (match) => ({ hint:match[1] })],
      [/^enter the pin to open this dashboard\. hint: (.+)$/i, 'dashboard_pin_with_hint', (match) => ({ hint:match[1] })],
      [/^search: (.+)$/i, 'search_results_for', (match) => ({ query:match[1] })],
      [/^(\d+) × (\d+) cells$/i, 'grid_cell_dimensions', (match) => ({ columns:match[1], rows:match[2] })],
      [/^(\d+) active alerts?$/i, 'active_alert_count', (match) => ({ count:match[1] })],
      [/^(\d+) critical$/i, 'critical_count', (match) => ({ count:match[1] })],
      [/^(\d+) warnings?$/i, 'warning_count', (match) => ({ count:match[1] })],
      [/^acknowledge for (\d+) minutes$/i, 'acknowledge_for_minutes', (match) => ({ minutes:match[1] })],
      [/^dismiss for (\d+) hours$/i, 'dismiss_for_hours', (match) => ({ hours:match[1] })],
      [/^customize (.+)$/i, 'customize_name', (match) => ({ name:match[1] })],
      [/^dashboard could not be saved: (.+)$/i, 'dashboard_save_failed', (match) => ({ error:match[1] })],
      [/^entity list refreshed · (\d+) available$/i, 'entity_list_refreshed', (match) => ({ count:match[1] })],
      [/^hue (\d+) degrees, saturation (\d+) percent$/i, 'hue_saturation_value', (match) => ({ hue:match[1], saturation:match[2] })],
      [/^run “(.+)”\?$/i, 'run_named_question', (match) => ({ name:match[1] })],
      [/^run (.+) action\?$/i, 'run_action_question', (match) => ({ action:match[1] })],
      [/^(.+) battery is (.+)$/i, 'entity_battery_is', (match) => ({ name:match[1], value:match[2] })],
      [/^(.+) is unavailable$/i, 'entity_is_unavailable', (match) => ({ name:match[1] })],
      [/^(.+) has an update available$/i, 'entity_has_update_available', (match) => ({ name:match[1] })],
      [/^(.+) requires attention$/i, 'entity_requires_attention', (match) => ({ name:match[1] })]
    ];
    for (const [pattern,key,values] of patterns) {
      const match = trimmed.match(pattern);
      if (!match || dictionary[key] === undefined) continue;
      translated = dictionary[key];
      replacements = { ...variables, ...values(match) };
      break;
    }
  }
  if (translated === undefined || translated === null || translated === '') return raw;
  const resolved = String(translated).replace(/\{([a-z0-9_]+)\}/gi, (_, name) => replacements[name] === undefined ? `{${name}}` : String(replacements[name]));
  return `${raw.slice(0, raw.indexOf(trimmed))}${resolved}${raw.slice(raw.indexOf(trimmed) + trimmed.length)}`;
}

function localizeDashboardDom(root = app) {
  if (!root) return;
  const enabled = localizationSettings().enabled;
  document.documentElement.lang = enabled ? (dashboardLocale() || 'en') : 'en';
  if (!enabled || typeof document.createTreeWalker !== 'function') return;
  const blocked = 'script,style,code,pre,.uc-icon,.material-symbols-rounded,[data-dashboard-i18n-ignore],.custom-code-runtime';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  for (const textNode of nodes) {
    const parent = textNode.parentElement;
    if (!parent || parent.closest(blocked)) continue;
    const translated = translateDashboardText(textNode.nodeValue);
    if (translated !== textNode.nodeValue) textNode.nodeValue = translated;
  }
  root.querySelectorAll('[title],[aria-label],[placeholder]').forEach((element) => {
    if (element.closest(blocked)) return;
    for (const attribute of ['title','aria-label','placeholder']) {
      if (!element.hasAttribute(attribute)) continue;
      const current = element.getAttribute(attribute) || '';
      const translated = translateDashboardText(current);
      if (translated !== current) element.setAttribute(attribute, translated);
    }
  });
}

function localizedDashboardMarkup(markup) {
  const html = String(markup || '');
  if (!localizationSettings().enabled || !html) return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  localizeDashboardDom(template.content);
  return template.innerHTML;
}

function setLocalizedDashboardHtml(target, markup) {
  if (!target) return;
  target.innerHTML = localizedDashboardMarkup(markup);
}

let dashboardLocalizationObserver = null;
let dashboardLocalizationQueued = false;
const dashboardLocalizationRoots = new Set();

function queueDashboardLocalization(root) {
  if (!root) return;
  const element = root.nodeType === Node.ELEMENT_NODE ? root : root.parentElement;
  if (!element) return;
  dashboardLocalizationRoots.add(element);
  if (dashboardLocalizationQueued) return;
  dashboardLocalizationQueued = true;
  queueMicrotask(() => {
    dashboardLocalizationQueued = false;
    const roots = [...dashboardLocalizationRoots];
    dashboardLocalizationRoots.clear();
    for (const candidate of roots) localizeDashboardDom(candidate);
  });
}

function installDashboardLocalizationObserver() {
  dashboardLocalizationObserver?.disconnect();
  dashboardLocalizationObserver = new MutationObserver((mutations) => {
    if (!localizationSettings().enabled) return;
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        for (const node of mutation.addedNodes) queueDashboardLocalization(node);
      } else if (mutation.type === 'characterData') queueDashboardLocalization(mutation.target);
      else if (mutation.type === 'attributes') queueDashboardLocalization(mutation.target);
    }
  });
  for (const root of [drawerRoot, modalRoot, toastRegion]) {
    dashboardLocalizationObserver.observe(root, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['title','aria-label','placeholder'] });
  }
}


function catalogEntityById(entityId) {
  const id = String(entityId || '');
  return state.entities.get(id) || (state.entityCatalog || []).find((entity) => entity?.entity_id === id) || null;
}

function templateEntityValue(entity, requestedPath = '') {
  if (!entity) return '';
  const path = String(requestedPath || '').trim();
  const attrs = entity.attributes && typeof entity.attributes === 'object' ? entity.attributes : {};
  const aliases = {
    id: entity.entity_id,
    entity_id: entity.entity_id,
    type: entity.entity_type,
    entity_type: entity.entity_type,
    name: localName(entity.name, entity.entity_id),
    state: entityState(entity),
    value: attrs.value ?? attrs.current_temperature ?? attrs.position ?? attrs.state ?? entityState(entity),
    unit: attrs.unit ?? attrs.unit_of_measurement ?? entity.options?.custom_unit ?? '',
    available: !isUnavailable(entity),
    last_changed: entity.last_changed ?? attrs.last_changed ?? ''
  };
  if (Object.prototype.hasOwnProperty.call(aliases, path)) return aliases[path];
  if (Object.prototype.hasOwnProperty.call(attrs, path)) return attrs[path];
  if (Object.prototype.hasOwnProperty.call(entity, path)) return entity[path];
  const segments = path.split('.').filter(Boolean);
  const roots = [entity, attrs, entity.options || {}];
  for (const root of roots) {
    let value = root;
    let found = true;
    for (const segment of segments) {
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, segment)) value = value[segment];
      else { found = false; break; }
    }
    if (found) return value;
  }
  return '';
}

function primaryTemplateEntity(item, fallbackEntity = null) {
  if (fallbackEntity) return fallbackEntity;
  if (!item) return null;
  if (item.kind === 'entity') return catalogEntityById(item.entityId);
  const settings = item.settings || {};
  const directId = settings.entityId || settings.mediaEntityId || settings.conditionEntityId || settings.temperatureEntityId || settings.forecastEntityId || csvEntityIds(settings.entityIds)[0];
  if (directId) return catalogEntityById(directId);
  const command = decodeCommandAction(settings.commandAction);
  return command?.entityId ? catalogEntityById(command.entityId) : null;
}

function renderTextTemplate(value, { item = null, entity = null } = {}) {
  const raw = String(value ?? '');
  if (!raw.includes('{')) return raw;
  const primary = primaryTemplateEntity(item, entity);
  return raw
    .replace(/\{entity(?:\[([^\]]+)\])?\.([a-zA-Z0-9_.-]+)\}/g, (_, explicitId, path) => localizedValue(templateEntityValue(explicitId ? catalogEntityById(explicitId) : primary, path), ''))
    .replace(/\{time\}/g, currentTime({ showSeconds: false }))
    .replace(/\{date\}/g, currentDate());
}

const TEMPLATE_TEXT_SETTING_KEYS = new Set(['title','body','label','subtitle','customTitle','customSubtitle','falseText','titleTemplate','valueTemplate','secondaryTemplate']);
function templatedWidgetSettings(item, settings, entity = null) {
  const resolved = { ...(settings || {}) };
  for (const key of TEMPLATE_TEXT_SETTING_KEYS) if (typeof resolved[key] === 'string') resolved[key] = renderTextTemplate(resolved[key], { item, entity });
  return resolved;
}

function textTemplateHelp() {
  return `<div class="settings-info-card text-template-help">${materialSymbol('data_object',20)}<span>Text fields support live placeholders such as <code>{entity.state}</code>, <code>{entity.value-xy}</code>, <code>{entity[uc.main.sensor].attribute}</code>, <code>{time}</code>, and <code>{date}</code>.</span></div>`;
}


const TEMPLATE_ELEMENT_TYPES = Object.freeze({
  icon: { label: 'Icon', icon: 'image' },
  heading: { label: 'Heading', icon: 'title' },
  text: { label: 'Text', icon: 'notes' },
  value: { label: 'Value', icon: 'data_object' },
  button: { label: 'Button', icon: 'buttons_alt' },
  list: { label: 'Display list', icon: 'list' },
  select: { label: 'Selection list', icon: 'dropdown' },
  input: { label: 'Input field', icon: 'edit_square' },
  slider: { label: 'Slider', icon: 'tune' },
  toggle: { label: 'Toggle', icon: 'toggle_on' },
  divider: { label: 'Divider', icon: 'divider_h' },
  spacer: { label: 'Spacer', icon: 'spacer' }
});

function templateElementDefaultTemplate(type) {
  if (type === 'heading') return '{entity.name}';
  if (type === 'value') return '{entity.value}';
  if (type === 'text') return '{entity.state}';
  if (type === 'list') return '{entity.attributes.options}';
  if (type === 'select' || type === 'input' || type === 'slider' || type === 'toggle') return '{entity.value}';
  return '';
}

function normalizeTemplateElement(entry = {}, index = 0) {
  const type = Object.prototype.hasOwnProperty.call(TEMPLATE_ELEMENT_TYPES, entry?.type) ? String(entry.type) : 'text';
  return {
    id: String(entry?.id || uid('template-element')),
    type,
    entityId: String(entry?.entityId || ''),
    template: String(entry?.template ?? templateElementDefaultTemplate(type)),
    label: String(entry?.label || TEMPLATE_ELEMENT_TYPES[type].label),
    icon: String(entry?.icon || (type === 'icon' ? 'data_object' : TEMPLATE_ELEMENT_TYPES[type].icon)),
    showIcon: entry?.showIcon !== false,
    span: Math.max(1, Math.min(6, Number(entry?.span) || (type === 'divider' || type === 'spacer' ? 6 : 1))),
    align: ['stretch','start','center','end'].includes(String(entry?.align)) ? String(entry.align) : 'stretch',
    command: String(entry?.command || ''),
    params: String(entry?.params || ''),
    paramKey: String(entry?.paramKey || 'value'),
    options: String(entry?.options || ''),
    optionsPath: String(entry?.optionsPath || ''),
    placeholder: String(entry?.placeholder || ''),
    inputType: ['text','number'].includes(String(entry?.inputType)) ? String(entry.inputType) : 'text',
    min: String(entry?.min ?? '0'),
    max: String(entry?.max ?? '100'),
    step: String(entry?.step ?? '1'),
    onCommand: String(entry?.onCommand || ''),
    offCommand: String(entry?.offCommand || ''),
    onValue: String(entry?.onValue ?? 'on'),
    offValue: String(entry?.offValue ?? 'off'),
    order: Number.isFinite(Number(entry?.order)) ? Number(entry.order) : index
  };
}

function legacyTemplateElements(settings = {}) {
  const elements = [];
  if (settings.showIcon !== false) elements.push(normalizeTemplateElement({ type:'icon', icon:settings.icon || 'data_object', span:1, align:'center' }, elements.length));
  if (settings.showTitle !== false) elements.push(normalizeTemplateElement({ type:'heading', template:settings.titleTemplate || '{entity.name}', span:1 }, elements.length));
  if (settings.showValue !== false) elements.push(normalizeTemplateElement({ type:'value', template:settings.valueTemplate || '{entity.value}', span:1 }, elements.length));
  if (settings.showSecondary !== false) elements.push(normalizeTemplateElement({ type:'text', template:settings.secondaryTemplate || '{entity.state}', span:1 }, elements.length));
  return elements.length ? elements : [normalizeTemplateElement({ type:'text', template:'{entity.value}', span:2 }, 0)];
}

function normalizeTemplateElements(elements, legacySettings = {}) {
  const source = Array.isArray(elements) && elements.length ? elements : legacyTemplateElements(legacySettings);
  return source.slice(0, 40).map((entry, index) => normalizeTemplateElement(entry, index));
}

function templateElementById(item, elementId) {
  return normalizeTemplateElements(item?.settings?.templateElements, item?.settings).find((entry) => entry.id === String(elementId || '')) || null;
}

function templateElementEntity(item, element) {
  const entity = catalogEntityById(element?.entityId || item?.settings?.entityId || '');
  return entity && entityAccessAllowed(entity.entity_id) ? entity : null;
}

function templateElementRenderedValue(item, element, fallback = '') {
  const entity = templateElementEntity(item, element);
  const template = String(element?.template ?? fallback);
  return renderTextTemplate(template, { item, entity });
}

function templateElementOptions(item, element) {
  const entity = templateElementEntity(item, element);
  let source = element?.optionsPath ? templateEntityValue(entity, element.optionsPath) : '';
  if (!source) source = element?.options || '';
  if (Array.isArray(source)) return source.map((value) => ({ label:String(value), value:String(value) }));
  if (source && typeof source === 'object') return Object.entries(source).map(([value,label]) => ({ value:String(value), label:String(label) }));
  return String(source || '').split(/[\n,]+/).map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const separator = entry.indexOf('=');
    return separator > 0 ? { label:entry.slice(0,separator).trim(), value:entry.slice(separator+1).trim() } : { label:entry, value:entry };
  });
}

function templateCommandParams(item, element, value) {
  let params = {};
  const raw = renderTextTemplate(element?.params || '', { item, entity:templateElementEntity(item, element) }).trim();
  if (raw) {
    try { params = JSON.parse(raw); }
    catch { params = {}; }
  }
  if (element?.paramKey) params[String(element.paramKey)] = value;
  return params;
}

function entityAccessSettings() {
  const source = state.config?.ui?.entities && typeof state.config.ui.entities === 'object' ? state.config.ui.entities : {};
  return {
    mode: source.mode === 'selected' ? 'selected' : 'all',
    includedIds: Array.isArray(source.includedIds) ? source.includedIds.map(String) : []
  };
}

function entityAccessAllowed(entityId) {
  const access = entityAccessSettings();
  return access.mode !== 'selected' || access.includedIds.includes(String(entityId || ''));
}

function accessibleEntities() {
  return [...state.entities.values()].filter((entity) => entityAccessAllowed(entity.entity_id));
}


const WIDGET_ACTION_TYPES = new Set(['none','navigate','command','toggle','more_info','modal_widget']);
const CONDITION_TYPES = new Set(['entity_state','numeric','time','day','screen','dashboard']);
const CONDITION_OPERATORS = new Set(['equals','not_equals','contains','greater','greater_equal','less','less_equal','truthy','falsy']);
const WIDGET_STYLE_KEYS = ['backgroundColor','borderColor','textColor','accentColor','opacity'];

function normalizeWidgetAction(action = {}) {
  const normalized = action && typeof action === 'object' ? action : {};
  return {
    type: WIDGET_ACTION_TYPES.has(normalized.type) ? normalized.type : 'none',
    dashboardId: String(normalized.dashboardId || ''),
    commandAction: String(normalized.commandAction || ''),
    entityId: String(normalized.entityId || ''),
    widgetId: String(normalized.widgetId || ''),
    confirmMode: ['none','dialog','hold'].includes(normalized.confirmMode) ? normalized.confirmMode : 'none',
    confirmText: String(normalized.confirmText || ''),
    holdSeconds: Math.max(.4, Math.min(5, Number(normalized.holdSeconds) || 1.2))
  };
}

function normalizeWidgetActions(actions = {}) {
  const source = actions && typeof actions === 'object' && !Array.isArray(actions) ? actions : {};
  return { tap: normalizeWidgetAction(source.tap), double: normalizeWidgetAction(source.double), hold: normalizeWidgetAction(source.hold) };
}

function normalizeConditionRule(rule = {}) {
  const normalized = rule && typeof rule === 'object' ? rule : {};
  return {
    id: String(normalized.id || uid('condition')),
    type: CONDITION_TYPES.has(normalized.type) ? normalized.type : 'entity_state',
    entityId: String(normalized.entityId || ''),
    attribute: String(normalized.attribute || ''),
    operator: CONDITION_OPERATORS.has(normalized.operator) ? normalized.operator : 'equals',
    value: String(normalized.value ?? ''),
    value2: String(normalized.value2 ?? ''),
    days: Array.isArray(normalized.days) ? normalized.days.map(Number).filter((day) => day >= 0 && day <= 6) : [],
    orientation: ['portrait','landscape'].includes(normalized.orientation) ? normalized.orientation : 'landscape',
    dashboardId: String(normalized.dashboardId || '')
  };
}

function normalizeConditionGroup(group = {}) {
  const source = group && typeof group === 'object' && !Array.isArray(group) ? group : {};
  return { mode: source.mode === 'any' ? 'any' : 'all', rules: Array.isArray(source.rules) ? source.rules.slice(0, 24).map(normalizeConditionRule) : [] };
}

function normalizeStateStyles(styles = []) {
  return Array.isArray(styles) ? styles.slice(0, 16).map((entry) => ({
    id: String(entry?.id || uid('style')),
    entityId: String(entry?.entityId || ''), attribute: String(entry?.attribute || ''),
    operator: CONDITION_OPERATORS.has(entry?.operator) ? entry.operator : 'equals', value: String(entry?.value ?? ''),
    backgroundColor: String(entry?.backgroundColor || ''), borderColor: String(entry?.borderColor || ''), textColor: String(entry?.textColor || ''), accentColor: String(entry?.accentColor || ''),
    opacity: entry?.opacity === '' || entry?.opacity === undefined ? '' : String(Math.max(0, Math.min(100, Number(entry.opacity))))
  })) : [];
}

function normalizeChildLayout(layout = {}) {
  const source = layout && typeof layout === 'object' ? layout : {};
  return {
    width: Math.max(1, Math.min(12, Number(source.width) || 12)),
    height: Math.max(1, Math.min(12, Number(source.height) || 1)),
    align: ['stretch','start','center','end'].includes(source.align) ? source.align : 'stretch'
  };
}

function normalizeRoutineAction(action = {}) {
  if (!action || typeof action !== 'object') return null;
  return { id: String(action.id || uid('routine')), label: String(action.label || 'Action'), icon: String(action.icon || 'play_arrow'), commandAction: String(action.commandAction || ''), confirm: Boolean(action.confirm), lastRunAt: Number(action.lastRunAt) || 0 };
}

function entityRuleValue(rule) {
  const entity = state.entities.get(rule?.entityId);
  if (!entity) return undefined;
  if (rule.attribute) return entity.attributes?.[rule.attribute];
  return conditionValue(entity);
}

function compareRule(actual, operator, expected) {
  const left = actual;
  const right = expected;
  switch (operator) {
    case 'not_equals': return String(left).toLowerCase() !== String(right).toLowerCase();
    case 'contains': return String(left).toLowerCase().includes(String(right).toLowerCase());
    case 'greater': return Number(left) > Number(right);
    case 'greater_equal': return Number(left) >= Number(right);
    case 'less': return Number(left) < Number(right);
    case 'less_equal': return Number(left) <= Number(right);
    case 'truthy': return ['on','true','active','open','playing','home','detected','running'].includes(String(left).toLowerCase()) || left === true || Number(left) > 0;
    case 'falsy': return !compareRule(left, 'truthy', right);
    case 'equals': default: return String(left).toLowerCase() === String(right).toLowerCase();
  }
}

function conditionRuleMatches(rule) {
  if (!rule) return true;
  if (rule.type === 'entity_state' || rule.type === 'numeric') return compareRule(entityRuleValue(rule), rule.operator, rule.value);
  if (rule.type === 'time') {
    const now = new Date(); const current = now.getHours() * 60 + now.getMinutes();
    const parse = (value) => { const [h,m] = String(value || '00:00').split(':').map(Number); return Math.max(0, Math.min(1439, (h || 0) * 60 + (m || 0))); };
    const start = parse(rule.value); const end = parse(rule.value2 || rule.value);
    return start <= end ? current >= start && current <= end : current >= start || current <= end;
  }
  if (rule.type === 'day') return !rule.days.length || rule.days.includes(new Date().getDay());
  if (rule.type === 'screen') {
    const portrait = window.innerHeight > window.innerWidth;
    const orientationMatches = rule.orientation === 'portrait' ? portrait : !portrait;
    return orientationMatches && (!rule.value || window.innerWidth >= Number(rule.value)) && (!rule.value2 || window.innerWidth <= Number(rule.value2));
  }
  if (rule.type === 'dashboard') return currentDashboard()?.id === rule.dashboardId;
  return true;
}

function widgetConditionsMatch(item) {
  const group = normalizeConditionGroup(item?.settings?.conditions);
  if (!group.rules.length) return true;
  return group.mode === 'any' ? group.rules.some(conditionRuleMatches) : group.rules.every(conditionRuleMatches);
}

function matchedStateStyle(item) {
  const styles = normalizeStateStyles(item?.settings?.stateStyles);
  let matched = null;
  for (const style of styles) if (style.entityId && compareRule(entityRuleValue(style), style.operator, style.value)) matched = style;
  return matched;
}

function widgetRuntimeStyle(item) {
  const style = matchedStateStyle(item);
  if (!style) return '';
  const declarations = [];
  if (style.backgroundColor) declarations.push(`background:${style.backgroundColor}!important`);
  if (style.borderColor) declarations.push(`border-color:${style.borderColor}!important`);
  if (style.textColor) declarations.push(`color:${style.textColor}!important`);
  if (style.accentColor) declarations.push(`--widget-state-accent:${style.accentColor}`);
  if (style.opacity !== '') declarations.push(`opacity:${Math.max(0, Math.min(100, Number(style.opacity))) / 100}`);
  return declarations.join(';');
}

function widgetPrimaryEntity(item) {
  if (item?.kind === 'entity') return entityForItem(item);
  const entityId = item?.settings?.entityId || String(item?.settings?.entityIds || '').split(',')[0] || '';
  return state.entities.get(entityId) || null;
}

function widgetUnavailableMode(item) {
  const entity = widgetPrimaryEntity(item);
  return entity && isUnavailable(entity) ? item.settings?.unavailableBehavior || 'dim' : '';
}

function widgetHasActions(item) {
  const actions = normalizeWidgetActions(item?.settings?.actions);
  return Object.values(actions).some((entry) => entry.type !== 'none');
}

function routineActionsFromForm(data, form) {
  return [...form.querySelectorAll('[data-routine-action-row]')].map((row) => normalizeRoutineAction({
    id: row.dataset.routineId, label: data.get(`routineLabel:${row.dataset.routineId}`), icon: data.get(`routineIcon:${row.dataset.routineId}`),
    commandAction: data.get(`routineCommand:${row.dataset.routineId}`), confirm: data.get(`routineConfirm:${row.dataset.routineId}`) === 'on'
  })).filter((entry) => entry.commandAction);
}


const RESPONSIVE_KEYS = ['phone','tabletPortrait','tabletLandscape','desktop'];

function normalizeResponsiveSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const result = {};
  for (const key of RESPONSIVE_KEYS) {
    const entry = source[key] && typeof source[key] === 'object' ? source[key] : {};
    result[key] = {
      enabled: Boolean(entry.enabled), hidden: Boolean(entry.hidden),
      w: entry.w === '' || entry.w == null ? '' : Math.max(1, Math.min(DASHBOARD_GRID_COLUMNS, Number(entry.w) || 1)),
      h: entry.h === '' || entry.h == null ? '' : Math.max(1, Math.min(DASHBOARD_GRID_COLUMNS, Number(entry.h) || 1)),
      compact: Boolean(entry.compact),
      padding: entry.padding === '' || entry.padding == null ? '' : Math.max(0, Math.min(48, Number(entry.padding) || 0)),
      fontScale: entry.fontScale === '' || entry.fontScale == null ? '' : Math.max(60, Math.min(160, Number(entry.fontScale) || 100))
    };
  }
  return result;
}

function normalizeFallback(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return { mode: ['none','hide','message','widget'].includes(source.mode) ? source.mode : 'none', text: String(source.text || 'Data unavailable'), icon: String(source.icon || 'cloud_off'), widgetId: String(source.widgetId || '') };
}

function componentById(id, config = state.config) { return (config?.widgetMasters || []).find((entry) => entry.id === id) || null; }
function presetById(id, config = state.config) { return (config?.widgetPresets || []).find((entry) => entry.id === id) || null; }

function renewWidgetIds(entry) {
  entry.id = uid('widget');
  if (entry.kind === 'system' && entry.widgetType === 'tab_container') for (const tab of entry.settings?.tabs || []) { tab.id = uid('tab'); for (const child of tab.items || []) renewWidgetIds(child); }
  else if (entry.kind === 'system' && CONTAINER_WIDGET_TYPES.has(entry.widgetType)) for (const child of entry.settings?.items || []) renewWidgetIds(child);
  return entry;
}

function synchronizeLinkedWidgets(config = state.config) {
  if (!config) return;
  const masters = new Map((config.widgetMasters || []).map((entry) => [entry.id, entry]));
  const visit = (items) => {
    for (const item of items || []) {
      const master = masters.get(item.linkedMasterId);
      if (master?.template) {
        const overrides = item.linkedOverrides && typeof item.linkedOverrides === 'object' ? item.linkedOverrides : {};
        const position = { id:item.id, x:item.x, y:item.y, w:item.w, h:item.h, linkedMasterId:item.linkedMasterId, linkedOverrides:overrides };
        const template = structuredClone(master.template);
        Object.assign(item, template, position);
        if (Object.prototype.hasOwnProperty.call(overrides,'entityId')) item.entityId = overrides.entityId;
        item.settings = { ...(template.settings || {}), ...(overrides.settings || {}) };
      }
      if (item.kind === 'system' && item.widgetType === 'tab_container') for (const tab of item.settings?.tabs || []) visit(tab.items);
      else if (item.kind === 'system' && CONTAINER_WIDGET_TYPES.has(item.widgetType)) visit(item.settings?.items);
    }
  };
  for (const dashboard of config.dashboards || []) visit(dashboard.items);
}

function widgetTemplate(item) {
  const copy = structuredClone(item);
  delete copy.id; delete copy.x; delete copy.y; delete copy.linkedMasterId; delete copy.linkedOverrides;
  return copy;
}

function responsiveClasses(item){const responsive=normalizeResponsiveSettings(item.settings?.responsive),classes=[];for(const key of RESPONSIVE_KEYS){const entry=responsive[key];if(!entry.enabled)continue;if(entry.compact)classes.push(`responsive-${key}-compact`);if(entry.hidden)classes.push(`responsive-${key}-hidden`);}return classes.join(' ');}

function responsiveStyle(item) {
  const responsive = normalizeResponsiveSettings(item.settings?.responsive);
  const declarations = [];
  for (const key of RESPONSIVE_KEYS) {
    const entry = responsive[key];
    if (!entry.enabled) continue;
    if (entry.w !== '') declarations.push(`--responsive-${key}-w:${entry.w}`);
    if (entry.h !== '') declarations.push(`--responsive-${key}-h:${entry.h}`);
    if (entry.padding !== '') declarations.push(`--responsive-${key}-padding:${entry.padding}px`);
    if (entry.fontScale !== '') declarations.push(`--responsive-${key}-font-scale:${entry.fontScale / 100}`);
  }
  return declarations.join(';');
}

const fallbackRenderStack = new Set();
function fallbackContent(item) {
  const fallback = normalizeFallback(item.settings?.fallback);
  const message = () => `<div class="widget-fallback-message">${renderChosenIcon(fallback.icon || 'cloud_off',34,'cloud_off')}<span>${escapeHtml(fallback.text || 'Data unavailable')}</span></div>`;
  if (fallback.mode === 'hide' || fallback.mode === 'none') return '';
  if (fallbackRenderStack.has(item.id)) return message();
  if (fallback.mode === 'widget' && fallback.widgetId && fallback.widgetId !== item.id) {
    const target = findDashboardItem(fallback.widgetId).item;
    if (target) {
      fallbackRenderStack.add(item.id);
      try { return `<div class="widget-fallback-widget">${renderNestedWidget(target,{depth:1,suppressTools:true})}</div>`; }
      finally { fallbackRenderStack.delete(item.id); }
    }
  }
  return message();
}


const STATUS_BAR_ITEM_TYPES = new Set(['empty','divider','time','date','page','custom','entity','battery','connection','entity_count','charging','profile','alerts']);
const STATUS_BAR_ITEM_ALIASES = Object.freeze({
  battery_indicator: 'battery',
  entity_count_indicator: 'entity_count',
  charging_indicator: 'charging',
  wifi: 'connection',
  connection_dot: 'connection'
});

function normalizeStatusBarItem(item = {}, index = 0) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
  const requestedType = STATUS_BAR_ITEM_ALIASES[source.type] || source.type;
  const type = STATUS_BAR_ITEM_TYPES.has(requestedType) ? requestedType : 'empty';
  return {
    id: String(source.id || `status-cell-${index + 1}`),
    type,
    customText: String(source.customText || ''),
    entityId: String(source.entityId || ''),
    entityDisplay: ['name_state','name','state','value'].includes(source.entityDisplay) ? source.entityDisplay : 'name_state'
  };
}

function legacyStatusBarItems(settings = {}) {
  const items = [];
  const addData = (slot, fallback) => {
    const requestedType = String(settings[`${slot}Content`] || fallback);
    const type = STATUS_BAR_ITEM_ALIASES[requestedType] || requestedType;
    if (!STATUS_BAR_ITEM_TYPES.has(type) || type === 'empty' || type === 'none') return;
    items.push(normalizeStatusBarItem({
      id: `status-${slot}`,
      type,
      customText: settings[`${slot}CustomText`] || (slot === 'left' ? settings.customText || '' : ''),
      entityId: settings[`${slot}EntityId`] || '',
      entityDisplay: settings[`${slot}EntityDisplay`] || 'name_state'
    }, items.length));
  };
  addData('left', settings.showTime === false ? 'empty' : 'time');
  addData('center', settings.showPageName === false ? 'empty' : 'page');
  addData('right', 'empty');
  const addLegacySingleton = (id, type, enabled) => {
    if (!enabled) return;
    const normalized = normalizeStatusBarItem({ id, type }, items.length);
    if (items.some((entry) => entry.type === normalized.type)) return;
    items.push(normalized);
  };
  addLegacySingleton('status-entity-count', 'entity_count_indicator', Boolean(settings.showEntityCount));
  addLegacySingleton('status-battery', 'battery_indicator', Boolean(settings.showBattery));
  addLegacySingleton('status-connection', 'connection_dot', settings.showConnection !== false);
  addLegacySingleton('status-charging', 'charging_indicator', settings.showCharging !== false);
  addLegacySingleton('status-wifi', 'wifi', settings.showWifi !== false);
  addLegacySingleton('status-alerts', 'alerts', settings.showAlerts !== false);
  addLegacySingleton('status-profile', 'profile', settings.showProfile !== false);
  return items.length ? items : [normalizeStatusBarItem({ id:'status-time', type:'time' },0), normalizeStatusBarItem({ id:'status-page', type:'page' },1)];
}

function normalizeStatusBarLayout(settings = {}) {
  const sourceItems = Array.isArray(settings.layoutItems) && settings.layoutItems.length ? settings.layoutItems : legacyStatusBarItems(settings);
  const requestedColumns = Number(settings.layoutColumns) || sourceItems.length || 1;
  const layoutColumns = Math.max(1, Math.min(24, requestedColumns));
  const retainedItemCount = Math.max(layoutColumns, Math.min(24, sourceItems.length));
  const layoutItems = sourceItems.slice(0, 24).map(normalizeStatusBarItem);
  // Older default layouts shipped both a "connection_dot" and a legacy "wifi"
  // cell. Both resolve to the same connection status, which rendered
  // "connected" twice. Keep the first one and blank the legacy Wi-Fi duplicate.
  layoutItems.forEach((item, index) => {
    const source = sourceItems[index] || {};
    if (item.type !== 'connection' || !(source.type === 'wifi' || item.id === 'status-wifi')) return;
    if (layoutItems.some((other, otherIndex) => otherIndex !== index && other.type === 'connection')) layoutItems[index] = normalizeStatusBarItem({ id:item.id, type:'empty' }, index);
  });
  while (layoutItems.length < retainedItemCount) layoutItems.push(normalizeStatusBarItem({ type:'empty' }, layoutItems.length));
  return { layoutColumns, layoutItems };
}

function migrateLegacyStatusBarDividers(settings = {}, layout = normalizeStatusBarLayout(settings)) {
  const legacyEnabled = Boolean(settings.verticalDividers ?? settings.showSeparators);
  if (!legacyEnabled || layout.layoutItems.some((item) => item.type === 'divider')) return layout;
  const active = layout.layoutItems.slice(0, layout.layoutColumns);
  const inactive = layout.layoutItems.slice(layout.layoutColumns);
  const migrated = [];
  let previousOccupied = false;
  for (const item of active) {
    if (item.type !== 'empty' && previousOccupied && migrated.length < 24) migrated.push(normalizeStatusBarItem({ id:`status-divider-migrated-${migrated.length + 1}`, type:'divider' }, migrated.length));
    if (migrated.length < 24) migrated.push(normalizeStatusBarItem(item, migrated.length));
    if (item.type !== 'empty') previousOccupied = true;
  }
  const migratedActiveCount = migrated.length;
  for (const item of inactive) {
    if (migrated.length >= 24) break;
    migrated.push(normalizeStatusBarItem(item, migrated.length));
  }
  return { layoutColumns: Math.max(1, Math.min(24, migratedActiveCount || layout.layoutColumns)), layoutItems: migrated };
}

function normalizeStatusBarAlignment(value) {
  return ['distributed','left','center','right'].includes(String(value)) ? String(value) : 'distributed';
}

function normalizeConfig(config) {
  const normalized = config && typeof config === 'object' ? config : {};
  const sourceVersion = Math.max(0, Number(normalized.version) || 0);
  const migrateDashboardGrid = sourceVersion < 37;
  normalized.version = 37;
  normalized.backgroundPresets = Array.isArray(normalized.backgroundPresets) ? normalized.backgroundPresets.slice(0, 40).map(normalizeSavedBackgroundPreset) : [];
  normalized.iconAssets = normalized.iconAssets && typeof normalized.iconAssets === 'object' && !Array.isArray(normalized.iconAssets) ? normalized.iconAssets : {};
  normalized.widgetPresets = Array.isArray(normalized.widgetPresets) ? normalized.widgetPresets.slice(0,100).map((entry)=>({ id:String(entry?.id||uid('preset')), name:String(entry?.name||'Preset'), template:entry?.template&&typeof entry.template==='object'?entry.template:null })).filter((entry)=>entry.template) : [];
  normalized.widgetMasters = Array.isArray(normalized.widgetMasters) ? normalized.widgetMasters.slice(0,100).map((entry)=>({ id:String(entry?.id||uid('component')), name:String(entry?.name||'Component'), template:entry?.template&&typeof entry.template==='object'?entry.template:null, updatedAt:Number(entry?.updatedAt)||Date.now() })).filter((entry)=>entry.template) : [];
  normalized.widgetDefaults = normalized.widgetDefaults && typeof normalized.widgetDefaults === 'object' ? normalized.widgetDefaults : {};
  const currentStatusBar = normalized.ui?.statusBar && typeof normalized.ui.statusBar === 'object' ? normalized.ui.statusBar : {};
  const currentScreensaver = normalized.ui?.screensaver && typeof normalized.ui.screensaver === 'object' ? normalized.ui.screensaver : {};
  const currentKiosk = normalized.ui?.kiosk && typeof normalized.ui.kiosk === 'object' ? normalized.ui.kiosk : {};
  const currentNavigation = normalized.ui?.navigation && typeof normalized.ui.navigation === 'object' ? normalized.ui.navigation : {};
  const currentNotifications = normalized.ui?.notifications && typeof normalized.ui.notifications === 'object' ? normalized.ui.notifications : {};
  const currentLocalization = normalized.ui?.localization && typeof normalized.ui.localization === 'object' ? normalized.ui.localization : {};
  const currentEntityAccess = normalized.ui?.entities && typeof normalized.ui.entities === 'object' ? normalized.ui.entities : {};
  const migratedStatusLayout = migrateLegacyStatusBarDividers(currentStatusBar);
  const statusBarDefaults = { visible: true, showSeconds: false, hour12: false, timezone: '', dateStyle: 'long', profileText: 'W', background: '#000000', backgroundOpacity: 98, foreground: '#d0d0d0', indicatorColor: '#d0d0d0', profileBackground: '#d0d0d0', profileForeground: '#000000', height: 40, fontSize: 13, fontWeight: 550, iconSize: 19, horizontalPadding: 10, itemGap: 6, sticky: true, blur: 0, borderWidth: 0, borderColor: '#252525', radius: 0, shadow: false, uppercase: false, alignment: 'distributed', indicatorStyle: 'plain' };
  const normalizedStatusBar = { ...statusBarDefaults };
  for (const key of Object.keys(statusBarDefaults)) if (currentStatusBar[key] !== undefined) normalizedStatusBar[key] = currentStatusBar[key];
  normalizedStatusBar.layoutColumns = migratedStatusLayout.layoutColumns;
  normalizedStatusBar.layoutItems = migratedStatusLayout.layoutItems.map(normalizeStatusBarItem);
  normalizedStatusBar.alignment = normalizeStatusBarAlignment(normalizedStatusBar.alignment);
  normalized.ui = {
    ...(normalized.ui && typeof normalized.ui === 'object' ? normalized.ui : {}),
    statusBar: normalizedStatusBar,
    kiosk: { scaleToFit: false, allowUpscale: false, padding: 0, widthMode: 'fill', ...currentKiosk },
    navigation: { mode: 'default', showIcons: true, showLabels: true, cardWidth: 152, transition: 'slide', ...currentNavigation },
    localization: {
      enabled: false,
      language: 'en',
      customDictionaries: {},
      ...currentLocalization
    },
    entities: {
      mode: currentEntityAccess.mode === 'selected' ? 'selected' : 'all',
      includedIds: Array.isArray(currentEntityAccess.includedIds) ? currentEntityAccess.includedIds.map(String) : []
    },
    notifications: {
      autoLowBattery: currentStatusBar.alertAutoLowBattery !== false,
      batteryThreshold: Math.max(1, Math.min(100, Number(currentStatusBar.alertBatteryThreshold) || 20)),
      autoUnavailable: currentStatusBar.alertAutoUnavailable !== false,
      autoUpdates: currentStatusBar.alertAutoUpdates !== false,
      acknowledgeMinutes: 60,
      dismissHours: 24,
      maxStatusAlerts: 100,
      ...currentNotifications
    },
    screensaver: { enabled: false, timeoutSeconds: 300, mode: 'clock', title: '', image: '', background: '#000000', foreground: '#ffffff', overlay: 25, showDate: true, showBattery: true, showConnection: false, movement: true, movementDuration: 180, contentScale: 100, clockSize: 100, widgetColumns: 2, lockEnabled: false, lockPinHash: '', lockPinHint: '', triggers: [], ...currentScreensaver }
  };
  if (!['fill','center','left'].includes(normalized.ui.kiosk.widthMode)) normalized.ui.kiosk.widthMode = 'fill';
  normalized.ui.notifications.autoLowBattery = normalized.ui.notifications.autoLowBattery !== false;
  normalized.ui.notifications.autoUnavailable = normalized.ui.notifications.autoUnavailable !== false;
  normalized.ui.notifications.autoUpdates = normalized.ui.notifications.autoUpdates !== false;
  normalized.ui.notifications.batteryThreshold = Math.max(1, Math.min(100, Number(normalized.ui.notifications.batteryThreshold) || 20));
  normalized.ui.notifications.acknowledgeMinutes = Math.max(1, Math.min(10080, Number(normalized.ui.notifications.acknowledgeMinutes) || 60));
  normalized.ui.notifications.dismissHours = Math.max(1, Math.min(8760, Number(normalized.ui.notifications.dismissHours) || 24));
  normalized.ui.notifications.maxStatusAlerts = Math.max(1, Math.min(500, Number(normalized.ui.notifications.maxStatusAlerts) || 100));
  normalized.ui.localization.enabled = Boolean(normalized.ui.localization.enabled);
  normalized.ui.localization.language = String(normalized.ui.localization.language || 'en').toLowerCase();
  normalized.ui.localization.customDictionaries = normalized.ui.localization.customDictionaries && typeof normalized.ui.localization.customDictionaries === 'object' ? normalized.ui.localization.customDictionaries : {};
  normalized.ui.entities.mode = normalized.ui.entities.mode === 'selected' ? 'selected' : 'all';
  normalized.ui.entities.includedIds = Array.isArray(normalized.ui.entities.includedIds) ? [...new Set(normalized.ui.entities.includedIds.map(String))] : [];
  normalized.dashboards = Array.isArray(normalized.dashboards) && normalized.dashboards.length ? normalized.dashboards : [{ id: 'main', name: 'Living Room', items: [] }];

  const normalizeItem = (item) => {
    item.id ||= uid('widget');
    item.kind ||= item.entityId ? 'entity' : 'system';
    if (item.kind === 'system' && item.widgetType === 'command_button') item.widgetType = 'icon_text_button';
    if (item.kind === 'system' && ['custom_html','custom_css','custom_js'].includes(item.widgetType)) item.widgetType = 'custom_code';
    item.settings = item.settings && typeof item.settings === 'object' ? item.settings : {};
    item.settings.textOverflow = ['scroll', 'wrap', 'truncate'].includes(item.settings.textOverflow) ? item.settings.textOverflow : 'scroll';
    item.settings.showWidgetTitle = item.settings.showWidgetTitle !== false;
    item.settings.showWidgetBackground = item.settings.showWidgetBackground !== false;
    item.settings.showWidgetBorder = item.settings.showWidgetBorder !== false;
    item.settings.customHtmlMode = ['append', 'prepend', 'replace'].includes(item.settings.customHtmlMode) ? item.settings.customHtmlMode : 'append';
    item.settings.customHtml = typeof item.settings.customHtml === 'string' ? item.settings.customHtml : '';
    item.settings.customCss = typeof item.settings.customCss === 'string' ? item.settings.customCss : '';
    item.settings.customJs = typeof item.settings.customJs === 'string' ? item.settings.customJs : '';
    item.settings.customCodeScope = item.settings.customCodeScope === 'dashboard' ? 'dashboard' : 'widget';
    item.settings.iconMode = ['default', 'material', 'upload', 'unfolded_tools'].includes(item.settings.iconMode) ? item.settings.iconMode : 'default';
    item.settings.materialIcon = typeof item.settings.materialIcon === 'string' ? item.settings.materialIcon : '';
    item.settings.customIconData = typeof item.settings.customIconData === 'string' ? item.settings.customIconData : '';
    item.settings.customIconName = typeof item.settings.customIconName === 'string' ? item.settings.customIconName : '';
    item.settings.unfoldedToolsIconUrl = typeof item.settings.unfoldedToolsIconUrl === 'string' ? item.settings.unfoldedToolsIconUrl : '';
    item.settings.unfoldedToolsIconAsset = item.settings.unfoldedToolsIconAsset && typeof item.settings.unfoldedToolsIconAsset === 'object' ? item.settings.unfoldedToolsIconAsset : null;
    item.settings.elementLayout = item.settings.elementLayout && typeof item.settings.elementLayout === 'object' && !Array.isArray(item.settings.elementLayout) ? item.settings.elementLayout : {};
    for (const value of Object.values(item.settings.elementLayout)) if (value && typeof value === 'object') { value.hidden = Boolean(value.hidden); value.scale = Math.max(25, Math.min(200, Number(value.scale) || 100)); }
    if (item.kind === 'system' && item.widgetType === 'icon_button') item.settings.iconSize = String(Math.max(16, Math.min(160, Number(item.settings.iconSize) || 64)));
    item.settings.contentAlignment = ['default','left','center','right'].includes(String(item.settings.contentAlignment)) ? String(item.settings.contentAlignment) : 'default';
    item.settings.actions = normalizeWidgetActions(item.settings.actions);
    item.settings.conditions = normalizeConditionGroup(item.settings.conditions);
    item.settings.visibilityTransition = ['none','fade','scale','slide'].includes(item.settings.visibilityTransition) ? item.settings.visibilityTransition : 'fade';
    item.settings.unavailableBehavior = ['dim','hide','overlay','view_only'].includes(item.settings.unavailableBehavior) ? item.settings.unavailableBehavior : 'dim';
    item.settings.stateStyles = normalizeStateStyles(item.settings.stateStyles);
    item.settings.responsive = normalizeResponsiveSettings(item.settings.responsive);
    item.settings.fallback = normalizeFallback(item.settings.fallback);
    item.linkedMasterId = typeof item.linkedMasterId === 'string' ? item.linkedMasterId : '';
    item.linkedOverrides = item.linkedOverrides && typeof item.linkedOverrides === 'object' ? item.linkedOverrides : {};
    if (Object.prototype.hasOwnProperty.call(item.settings, 'pageSize')) item.settings.pageSize = String(Math.max(10, Math.min(100, Number(item.settings.pageSize) || 12)));
    if (Object.prototype.hasOwnProperty.call(item.settings, 'mediaBrowserPageSize')) item.settings.mediaBrowserPageSize = String(Math.max(10, Math.min(100, Number(item.settings.mediaBrowserPageSize) || 12)));
    if (item.kind === 'entity') {
      item.entityType ||= item.snapshot?.entity_type || 'sensor';
      item.settings.elements = { ...DEFAULT_ELEMENTS[item.entityType], ...(normalized.widgetDefaults[item.entityType] || {}), ...(item.settings.elements || {}) };
    }
    if (item.kind === 'system' && item.widgetType === 'scene_routine') {
      item.settings.routineActions = Array.isArray(item.settings.routineActions) ? item.settings.routineActions.slice(0, 24).map(normalizeRoutineAction).filter(Boolean) : [];
    }
    if (item.kind === 'system' && ['entity_table','counter_statistics'].includes(item.widgetType)) {
      item.settings.entityIds = Array.isArray(item.settings.entityIds) ? item.settings.entityIds.join(',') : String(item.settings.entityIds || '');
    }
    if (item.kind === 'system' && ['room_summary','history_graph'].includes(item.widgetType)) item.settings.entityIds = Array.isArray(item.settings.entityIds) ? item.settings.entityIds.join(',') : String(item.settings.entityIds || '');
    if (item.kind === 'system' && item.widgetType === 'alert_center') {
      item.settings.alertRules = Array.isArray(item.settings.alertRules) ? item.settings.alertRules.slice(0,40) : [];
      delete item.settings.autoOpenings;
      delete item.settings.autoLeaks;
      delete item.settings.autoSmoke;
    }
    if (item.kind === 'system' && item.widgetType === 'timer_countdown') {
      item.settings.mode = ['countdown','stopwatch'].includes(item.settings.mode) ? item.settings.mode : 'countdown';
      item.settings.durationSeconds = String(Math.max(1, Number(item.settings.durationSeconds) || 300));
      item.settings.presets = String(item.settings.presets || '60,300,600,1800');
      item.settings.finishSound = typeof item.settings.finishSound === 'string' ? item.settings.finishSound : '';
      item.settings.finishSoundName = typeof item.settings.finishSoundName === 'string' ? item.settings.finishSoundName : '';
      item.settings.playFinishSound = item.settings.playFinishSound !== false;
    }
    if (item.kind === 'system' && item.widgetType === 'entity_template') {
      item.settings.entityId = String(item.settings.entityId || '');
      item.settings.templateColumns = String(Math.max(1, Math.min(6, Number(item.settings.templateColumns) || 2)));
      item.settings.templateGap = String(Math.max(0, Math.min(32, Number(item.settings.templateGap) || 10)));
      item.settings.templateElements = normalizeTemplateElements(item.settings.templateElements, item.settings);
      delete item.settings.titleTemplate;
      delete item.settings.valueTemplate;
      delete item.settings.secondaryTemplate;
      delete item.settings.icon;
      delete item.settings.showIcon;
      delete item.settings.showTitle;
      delete item.settings.showValue;
      delete item.settings.showSecondary;
    }
    if (item.kind === 'system' && item.widgetType === 'text') {
      item.settings.showHeading = item.settings.showHeading !== false;
      item.settings.showBody = item.settings.showBody !== false;
      item.settings.dividerBelowHeading = Boolean(item.settings.dividerBelowHeading);
      item.settings.dividerBelowBody = Boolean(item.settings.dividerBelowBody);
    }
    if (item.kind === 'system' && item.widgetType === 'activity_launcher') {
      if (!item.settings.activityConfigs || typeof item.settings.activityConfigs !== 'object' || Array.isArray(item.settings.activityConfigs)) item.settings.activityConfigs = {};
    }
    if (item.kind === 'system' && ['conditional', 'carousel', 'entity_group'].includes(item.widgetType)) {
      item.settings.items = Array.isArray(item.settings.items) ? item.settings.items : [];
      if (item.widgetType === 'conditional' && !item.settings.conditionEntityId && item.settings.hideWhenFalse === true) item.settings.hideWhenFalse = false;
      if (item.widgetType === 'carousel') {
        item.settings.showCounter = item.settings.showCounter !== false;
        item.settings.containerStyle = item.settings.containerStyle !== false;
        item.settings.swiperEffect = ['slide','cards','coverflow'].includes(item.settings.swiperEffect) ? item.settings.swiperEffect : 'slide';
        item.settings.swiperSlidesPerView = String(Math.max(1, Math.min(4, Number(item.settings.swiperSlidesPerView) || 1)));
        item.settings.swiperSpaceBetween = String(Math.max(0, Math.min(80, Number(item.settings.swiperSpaceBetween) || 12)));
        item.settings.swiperCentered = item.settings.swiperCentered !== false;
        item.settings.swiperLoop = Boolean(item.settings.swiperLoop);
      }
      if (item.widgetType === 'entity_group') {
        item.settings.containerStyle = item.settings.containerStyle !== false;
        item.settings.orientation = ['grid','horizontal','vertical'].includes(item.settings.orientation) ? item.settings.orientation : 'grid';
        item.settings.wrap = item.settings.wrap !== false;
        item.settings.gap = String(Math.max(0, Math.min(48, Number(item.settings.gap) || 12)));
        item.settings.padding = String(Math.max(0, Math.min(48, Number(item.settings.padding) || 0)));
      }
      item.settings.layoutLocked = Boolean(item.settings.layoutLocked);
      item.settings.items.forEach((child) => { child.settings ||= {}; child.settings.containerLayout = normalizeChildLayout(child.settings.containerLayout); });
      item.settings.items.forEach(normalizeItem);
    }
    if (item.kind === 'system' && item.widgetType === 'tab_container') {
      item.settings.tabs = Array.isArray(item.settings.tabs) && item.settings.tabs.length ? item.settings.tabs : structuredClone(SYSTEM_WIDGETS.tab_container.settings.tabs);
      for (const [index, tab] of item.settings.tabs.entries()) {
        tab.id ||= uid('tab');
        tab.name ||= `Tab ${index + 1}`;
        tab.icon = typeof tab.icon === 'string' ? tab.icon : '';
        tab.color = /^#[0-9a-f]{6}$/i.test(String(tab.color || '')) ? tab.color : '#d0d0d0';
        tab.columns = Math.max(1, Math.min(4, Number(tab.columns) || 1));
        tab.showIcon = tab.showIcon !== false;
        tab.showLabel = tab.showLabel !== false;
        tab.items = Array.isArray(tab.items) ? tab.items : [];
        tab.items.forEach((child) => { normalizeItem(child); child.settings ||= {}; child.settings.containerLayout = normalizeChildLayout(child.settings.containerLayout); });
      }
      item.settings.layoutLocked = Boolean(item.settings.layoutLocked);
      if (!item.settings.tabs.some((tab) => tab.id === item.settings.activeTabId)) item.settings.activeTabId = item.settings.tabs[0]?.id || '';
    }
  };

  for (const dashboard of normalized.dashboards) {
    dashboard.id ||= uid('dashboard');
    dashboard.name ||= 'Dashboard';
    dashboard.navIcon = typeof dashboard.navIcon === 'string' && (chosenIconIsImage(dashboard.navIcon) || /^[a-z0-9_]+$/i.test(dashboard.navIcon)) ? dashboard.navIcon : 'dashboard';
    dashboard.navColor = /^#[0-9a-f]{6}$/i.test(String(dashboard.navColor || '')) ? dashboard.navColor : '#d0d0d0';
    dashboard.pinHash = typeof dashboard.pinHash === 'string' ? dashboard.pinHash : '';
    dashboard.pinHint = typeof dashboard.pinHint === 'string' ? dashboard.pinHint : '';
    dashboard.relockEnabled = Boolean(dashboard.relockEnabled);
    dashboard.relockMinutes = Math.max(1, Math.min(1440, Number(dashboard.relockMinutes) || 5));
    const existingBackground = dashboard.background && typeof dashboard.background === 'object' ? dashboard.background : {};
    dashboard.background = {
      color: '#000000', image: '', overlay: 0, fit: 'cover', position: 'center center', fixed: true,
      ...existingBackground,
      preset: dashboardBackgroundPreset(existingBackground)
    };
    dashboard.items = Array.isArray(dashboard.items) ? dashboard.items : [];
    if (migrateDashboardGrid) {
      for (const item of dashboard.items) {
        item.x = Math.max(0, Math.round((Number(item.x) || 0) * 2));
        item.y = Math.max(0, Math.round((Number(item.y) || 0) * 2));
        item.w = Math.max(1, Math.min(DASHBOARD_GRID_COLUMNS, Math.round((Number(item.w) || 1) * 2)));
        item.h = Math.max(1, Math.round((Number(item.h) || 1) * 2));
        const responsive = item.settings?.responsive;
        if (responsive && typeof responsive === 'object') {
          for (const key of RESPONSIVE_KEYS) {
            const entry = responsive[key];
            if (!entry || typeof entry !== 'object') continue;
            if (entry.w !== '' && entry.w != null) entry.w = Math.max(1, Math.min(DASHBOARD_GRID_COLUMNS, Math.round((Number(entry.w) || 1) * 2)));
            if (entry.h !== '' && entry.h != null) entry.h = Math.max(1, Math.round((Number(entry.h) || 1) * 2));
          }
        }
      }
    }
    dashboard.items.forEach(normalizeItem);
  }
  normalized.ui.screensaver.lockEnabled = Boolean(normalized.ui.screensaver.lockEnabled);
  normalized.ui.screensaver.lockPinHash = String(normalized.ui.screensaver.lockPinHash || '');
  normalized.ui.screensaver.lockPinHint = String(normalized.ui.screensaver.lockPinHint || '');
  normalized.ui.screensaver.widgetColumns = Math.max(1, Math.min(4, Number(normalized.ui.screensaver.widgetColumns) || 2));
  normalized.ui.screensaver.triggers = Array.isArray(normalized.ui.screensaver.triggers) ? normalized.ui.screensaver.triggers.slice(0, 8).map((trigger) => ({ id: trigger?.id || uid('trigger'), entityId: String(trigger?.entityId || ''), operator: ['equals','not_equals','truthy','greater','less'].includes(trigger?.operator) ? trigger.operator : 'truthy', value: String(trigger?.value ?? ''), widgetId: String(trigger?.widgetId || trigger?.cameraWidgetId || ''), durationSeconds: Math.max(5, Math.min(600, Number(trigger?.durationSeconds) || 30)), title: String(trigger?.title || ''), columnSpan: Math.max(1, Math.min(4, Number(trigger?.columnSpan) || 1)) })) : [];
  if (!normalized.activeDashboardId || !normalized.dashboards.some((entry) => entry.id === normalized.activeDashboardId)) normalized.activeDashboardId = normalized.dashboards[0].id;
  synchronizeLinkedWidgets(normalized);
  return normalized;
}

function dashboardIdFromReference(reference = '') {
  const dashboards = state.config?.dashboards || [];
  const requested = String(reference || '').trim();
  if (!requested) return '';
  const normalized = requested.toLocaleLowerCase();
  const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return dashboards.find((entry) => entry.id === requested)?.id
    || dashboards.find((entry) => String(entry.name || '').toLocaleLowerCase() === normalized)?.id
    || dashboards.find((entry) => String(entry.name || '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === slug)?.id
    || '';
}

function restoreViewDashboard(preferred = '') {
  const dashboards = state.config?.dashboards || [];
  if (!dashboards.length) {
    state.viewDashboardId = '';
    return '';
  }
  let stored = '';
  try { stored = sessionStorage.getItem('uc-wall-dashboard-id') || ''; } catch {}
  const kioskRequested = state.kioskMode && !state.kioskStartDashboardApplied ? dashboardIdFromReference(KIOSK_START_DASHBOARD) : '';
  const candidate = preferred || kioskRequested || state.viewDashboardId || stored || state.config?.activeDashboardId || dashboards[0].id;
  state.kioskStartDashboardApplied = state.kioskStartDashboardApplied || Boolean(KIOSK_START_DASHBOARD);
  state.viewDashboardId = dashboards.some((entry) => entry.id === candidate) ? candidate : dashboards[0].id;
  try { sessionStorage.setItem('uc-wall-dashboard-id', state.viewDashboardId); } catch {}
  return state.viewDashboardId;
}

function setViewDashboard(id) {
  const dashboards = state.config?.dashboards || [];
  if (!dashboards.some((entry) => entry.id === id)) return false;
  state.viewDashboardId = id;
  try { sessionStorage.setItem('uc-wall-dashboard-id', id); } catch {}
  return true;
}

function currentDashboard() {
  const dashboards = state.config?.dashboards || [];
  const requested = state.viewDashboardId || state.config?.activeDashboardId;
  return dashboards.find((dashboard) => dashboard.id === requested) || dashboards[0];
}

function dashboardViewState(dashboardId = currentDashboard()?.id) {
  const id = String(dashboardId || '');
  if (!id) return null;
  let view = state.dashboardViewStates.get(id);
  if (!view) {
    const shared = state.sharedDashboardGeometry || {};
    view = {
      gridCellSize: Number(shared.gridCellSize) || 0,
      gridGap: Number(shared.gridGap) || 0,
      gridWidth: Number(shared.gridWidth) || 0,
      gridHeight: 0,
      scrollY: 0
    };
    state.dashboardViewStates.set(id, view);
  }
  return view;
}

function pruneDashboardViewStates() {
  const valid = new Set((state.config?.dashboards || []).map((dashboard) => dashboard.id));
  for (const id of state.dashboardViewStates.keys()) if (!valid.has(id)) state.dashboardViewStates.delete(id);
}

function activeDashboardShell() {
  return app.querySelector('.remote-shell[data-dashboard-id]');
}

function pauseDashboardShell(shell) {
  if (!shell) return;
  shell.dataset.dashboardFrozen = 'true';
  shell.setAttribute('aria-hidden', 'true');
  shell.dispatchEvent(new CustomEvent('uc-dashboard-freeze', { bubbles: false }));
  shell.getAnimations?.({ subtree: true }).forEach((animation) => {
    try { animation.pause(); } catch {}
  });
  shell.querySelectorAll('video,audio').forEach((media) => {
    media.dataset.dashboardWasPlaying = media.paused ? 'false' : 'true';
    try { media.pause(); } catch {}
  });
  shell.querySelectorAll('swiper-container').forEach((swiper) => {
    try { swiper.swiper?.autoplay?.stop?.(); } catch {}
  });
}

function resumeDashboardShell(shell) {
  if (!shell) return;
  shell.dataset.dashboardFrozen = 'false';
  shell.removeAttribute('aria-hidden');
  shell.getAnimations?.({ subtree: true }).forEach((animation) => {
    try { animation.play(); } catch {}
  });
  shell.querySelectorAll('video,audio[data-dashboard-was-playing="true"]').forEach((media) => {
    try { media.play()?.catch?.(() => {}); } catch {}
    delete media.dataset.dashboardWasPlaying;
  });
  shell.dispatchEvent(new CustomEvent('uc-dashboard-thaw', { bubbles: false }));
}

function freezeActiveDashboardShell() {
  const shell = activeDashboardShell();
  if (!shell) return null;
  captureDashboardViewState(shell);
  const dashboardId = shell.dataset.dashboardId || '';
  if (!dashboardId) return null;
  pauseDashboardShell(shell);
  state.dashboardShellCache.set(dashboardId, shell);
  frozenDashboardRoot.append(shell);
  return shell;
}

function discardFrozenDashboardShells() {
  state.dashboardShellCache.clear();
  frozenDashboardRoot.replaceChildren();
}

function restoreFrozenDashboardShell(dashboardId) {
  const shell = state.dashboardShellCache.get(String(dashboardId || ''));
  if (!shell) return false;
  state.dashboardShellCache.delete(String(dashboardId || ''));
  shell.style.visibility = 'hidden';
  app.replaceChildren(shell);
  resumeDashboardShell(shell);
  syncDashboardGridGeometry(shell);
  applyWidgetElementLayouts(shell);
  patchVisibleDashboard({ entityIds: new Set(state.entities.keys()), runtime: true });
  syncDashboardGridGeometry(shell);
  updateMarquees(shell);
  updateLiveWidgets();
  ensureVisibleMediaBrowsers();
  initializeMediaSwipers(shell);
  initializeWidgetCarousels(shell);
  applyKioskScale();
  restoreDashboardViewState(dashboardId);
  shell.style.visibility = '';
  scheduleScreensaver();
  return true;
}

function captureDashboardViewState(root = app) {
  const shell = root?.matches?.('.remote-shell[data-dashboard-id]') ? root : root?.querySelector?.('.remote-shell[data-dashboard-id]');
  const dashboardId = shell?.dataset.dashboardId || '';
  const view = dashboardViewState(dashboardId);
  if (!view) return;
  const grid = shell.querySelector('.remote-entity-grid');
  if (grid) {
    const styles = getComputedStyle(grid);
    const cell = Number.parseFloat(styles.getPropertyValue('--dashboard-grid-row-size')) || Number(grid.dataset.gridCellSize) || 0;
    const gap = Number.parseFloat(styles.rowGap) || Number.parseFloat(styles.columnGap) || 0;
    if (cell > 0) view.gridCellSize = cell;
    if (gap >= 0) view.gridGap = gap;
    view.gridWidth = grid.clientWidth || view.gridWidth;
    view.gridHeight = grid.getBoundingClientRect().height || view.gridHeight;
  }
  view.scrollY = Math.max(0, Number(window.scrollY ?? document.scrollingElement?.scrollTop) || 0);
}

function dashboardGridRows(dashboard, columns = getColumns()) {
  const layout = displayLayout(dashboard?.items || [], columns);
  return layout.reduce((rows, item) => Math.max(rows, Number(item.y || 0) + Number(item.h || 1)), 0);
}

function cachedDashboardGridStyle(dashboard, columns = getColumns()) {
  const view = dashboardViewState(dashboard?.id);
  const cell = Number(view?.gridCellSize) || Number(state.sharedDashboardGeometry?.gridCellSize) || 0;
  const gap = Number(view?.gridGap) || Number(state.sharedDashboardGeometry?.gridGap) || 0;
  const rows = dashboardGridRows(dashboard, columns);
  const minimumHeight = cell > 0 && rows > 0 ? rows * cell + Math.max(0, rows - 1) * gap : Number(view?.gridHeight) || 0;
  return [
    `--grid-columns:${columns}`,
    cell > 0 ? `--dashboard-grid-row-size:${cell}px` : '',
    minimumHeight > 0 ? `min-height:${minimumHeight}px` : ''
  ].filter(Boolean).join(';');
}

function restoreDashboardViewState(dashboardId = currentDashboard()?.id) {
  const scrollY = Math.max(0, Number(dashboardViewState(dashboardId)?.scrollY) || 0);
  const apply = () => {
    if (currentDashboard()?.id !== dashboardId) return;
    if (typeof window.scrollTo === 'function') window.scrollTo(0, scrollY);
    else if (document.scrollingElement) document.scrollingElement.scrollTop = scrollY;
  };
  apply();
  requestAnimationFrame(apply);
}

function getColumns() {
  return DASHBOARD_GRID_COLUMNS;
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function slotIsFree(placed, candidate, ignoreId = null) {
  return !placed.some((item) => item.id !== ignoreId && overlaps(item, candidate));
}

function findSlot(placed, w, h, columns, preferred = { x: 0, y: 0 }, ignoreId = null) {
  const width = Math.min(columns, Math.max(1, w));
  for (let y = Math.max(0, preferred.y || 0); y < 600; y += 1) {
    const startX = y === preferred.y ? Math.min(columns - width, Math.max(0, preferred.x || 0)) : 0;
    for (let offset = 0; offset <= columns - width; offset += 1) {
      const x = (startX + offset) % (columns - width + 1);
      const candidate = { id: ignoreId, x, y, w: width, h };
      if (slotIsFree(placed, candidate, ignoreId)) return candidate;
    }
  }
  return { id: ignoreId, x: 0, y: placed.reduce((max, item) => Math.max(max, item.y + item.h), 0), w: width, h };
}

function displayLayout(items, columns = DASHBOARD_GRID_COLUMNS) {
  const placed = [];
  const occupied = [];
  const sorted = [...items].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
  for (const item of sorted) {
    const minWidth = item.entityType === 'button' || item.widgetType === 'spacer' ? 2 : 1;
    const w = Math.min(columns, Math.max(minWidth, Number(item.w) || 1));
    const h = Math.max(1, Number(item.h) || 1);
    const preferred = {
      x: Math.min(columns - w, Math.max(0, Number(item.x) || 0)),
      y: Math.max(0, Number(item.y) || 0)
    };
    // Hidden widgets retain their configured coordinates but do not reserve cells.
    // This lets mutually exclusive, condition-controlled widgets share the same slot.
    const visible = widgetConditionsMatch(item);
    const slot = visible
      ? findSlot(occupied, w, h, columns, preferred, item.id)
      : { ...preferred, w, h };
    const position = { ...slot, id: item.id };
    placed.push(position);
    if (visible) occupied.push(position);
  }
  return placed;
}

function syncDashboardGridGeometry(root = app) {
  const grids = root?.querySelectorAll ? root.querySelectorAll('.remote-entity-grid') : [];
  grids.forEach((grid) => {
    const styles = getComputedStyle(grid);
    const columns = Number.parseInt(styles.getPropertyValue('--grid-columns')) || DASHBOARD_GRID_COLUMNS;
    const gap = Number.parseFloat(styles.columnGap) || 0;
    const available = Math.max(1, grid.clientWidth - gap * Math.max(0, columns - 1));
    const cell = Math.max(6, available / Math.max(1, columns));
    grid.style.setProperty('--dashboard-grid-row-size', `${cell}px`);
    grid.dataset.gridCellSize = String(cell);
    const dashboardId = grid.closest('.remote-shell[data-dashboard-id]')?.dataset.dashboardId || currentDashboard()?.id || '';
    const view = dashboardViewState(dashboardId);
    if (view) {
      view.gridCellSize = cell;
      view.gridGap = gap;
      view.gridWidth = grid.clientWidth;
      view.gridHeight = grid.getBoundingClientRect().height;
    }
    state.sharedDashboardGeometry = { gridCellSize: cell, gridGap: gap, gridWidth: grid.clientWidth };
    for (const dashboard of state.config?.dashboards || []) {
      const cached = dashboardViewState(dashboard.id);
      if (!cached) continue;
      cached.gridCellSize = cell;
      cached.gridGap = gap;
      cached.gridWidth = grid.clientWidth;
    }
  });
}


function configSnapshot() {
  return JSON.stringify(state.config);
}

function initializeHistory() {
  state.undoStack = [];
  state.redoStack = [];
  state.historyCurrent = configSnapshot();
}

function recordHistory() {
  if (state.historyApplying || !state.config) return;
  const next = configSnapshot();
  if (!state.historyCurrent) { state.historyCurrent = next; return; }
  if (next === state.historyCurrent) return;
  state.undoStack.push(state.historyCurrent);
  if (state.undoStack.length > 80) state.undoStack.shift();
  state.historyCurrent = next;
  state.redoStack = [];
}

function applyHistorySnapshot(snapshot, direction) {
  if (!snapshot) return;
  const current = configSnapshot();
  state.historyApplying = true;
  try {
    state.config = normalizeConfig(JSON.parse(snapshot));
    restoreViewDashboard(state.viewDashboardId);
    state.historyCurrent = configSnapshot();
    state.editorDirty = true;
    if (direction === 'undo') state.redoStack.push(current);
    else state.undoStack.push(current);
  } finally { state.historyApplying = false; }
  render();
}

function undoDashboardChange() {
  const snapshot = state.undoStack.pop();
  if (snapshot) applyHistorySnapshot(snapshot, 'undo');
}

function redoDashboardChange() {
  const snapshot = state.redoStack.pop();
  if (snapshot) applyHistorySnapshot(snapshot, 'redo');
}

async function hashPagePin(pin) {
  const value = String(pin || '');
  if (!value) return '';
  // Page locks are a local UI safeguard rather than an authentication boundary.
  // Use one deterministic hash on secure and non-secure kiosk origins so a PIN
  // created on desktop can always be verified by older HTTP WebViews.
  let hash = 2166136261;
  for (const character of `uc-wall-page:${value}`) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function dashboardRelockDelayMs(dashboard) {
  if (!dashboard?.pinHash || !dashboard.relockEnabled) return 0;
  return Math.max(1, Math.min(1440, Number(dashboard.relockMinutes) || 5)) * 60 * 1000;
}

function dashboardUnlockStorageKey(dashboard) { return `uc-wall-unlocked:${dashboard?.id || ''}`; }

function readDashboardUnlockRecord(dashboard) {
  try {
    const raw = sessionStorage.getItem(dashboardUnlockStorageKey(dashboard));
    if (!raw) return null;
    if (raw === dashboard.pinHash) { const record={ hash:raw, lastInteractionAt:Date.now() }; try{sessionStorage.setItem(dashboardUnlockStorageKey(dashboard),JSON.stringify(record));}catch{} return record; }
    const record = JSON.parse(raw);
    return record && record.hash === dashboard.pinHash ? record : null;
  } catch { return null; }
}

function writeDashboardUnlockRecord(dashboard, lastInteractionAt = Date.now()) {
  try { sessionStorage.setItem(dashboardUnlockStorageKey(dashboard), JSON.stringify({ hash: dashboard.pinHash || 'unlocked', lastInteractionAt })); } catch {}
}

function scheduleDashboardRelock(dashboard, lastInteractionAt = Date.now()) {
  if (!dashboard) return;
  clearTimeout(state.dashboardRelockTimers.get(dashboard.id));
  state.dashboardRelockTimers.delete(dashboard.id);
  const delay = dashboardRelockDelayMs(dashboard);
  if (!delay || !dashboardIsUnlocked(dashboard, { schedule: false })) return;
  const remaining = Math.max(0, delay - (Date.now() - Number(lastInteractionAt || Date.now())));
  if (remaining <= 0) { markDashboardLocked(dashboard); if (currentDashboard()?.id === dashboard.id) render(); return; }
  const timer = setTimeout(() => {
    state.dashboardRelockTimers.delete(dashboard.id);
    markDashboardLocked(dashboard);
    if (currentDashboard()?.id === dashboard.id) {
      state.modal = null;
      state.drawerOpen = false;
      state.editMode = false;
      toast(`${localName(dashboard.name)} locked after inactivity`);
      render();
    }
  }, remaining);
  state.dashboardRelockTimers.set(dashboard.id, timer);
}

function dashboardIsUnlocked(dashboard, options = {}) {
  if (!dashboard?.pinHash) return true;
  const inMemory = state.unlockedDashboards.has(dashboard.id);
  const record = readDashboardUnlockRecord(dashboard);
  if (!inMemory && !record) return false;
  const lastInteractionAt = Number(record?.lastInteractionAt) || Date.now();
  const delay = dashboardRelockDelayMs(dashboard);
  if (delay && Date.now() - lastInteractionAt >= delay) { markDashboardLocked(dashboard); return false; }
  state.unlockedDashboards.add(dashboard.id);
  if (options.schedule !== false && delay) scheduleDashboardRelock(dashboard, lastInteractionAt);
  return true;
}

function markDashboardUnlocked(dashboard) {
  if (!dashboard) return;
  const now = Date.now();
  state.unlockedDashboards.add(dashboard.id);
  writeDashboardUnlockRecord(dashboard, now);
  scheduleDashboardRelock(dashboard, now);
}

function touchDashboardUnlock(dashboard = currentDashboard()) {
  if (!dashboard?.pinHash || !dashboardIsUnlocked(dashboard, { schedule: false })) return;
  const now = Date.now();
  writeDashboardUnlockRecord(dashboard, now);
  scheduleDashboardRelock(dashboard, now);
}

function markDashboardLocked(dashboard) {
  if (!dashboard) return;
  clearTimeout(state.dashboardRelockTimers.get(dashboard.id));
  state.dashboardRelockTimers.delete(dashboard.id);
  state.unlockedDashboards.delete(dashboard.id);
  try { sessionStorage.removeItem(dashboardUnlockStorageKey(dashboard)); } catch {}
}

function relockAllDashboards() {
  for (const dashboard of state.config?.dashboards || []) if (dashboard.pinHash) markDashboardLocked(dashboard);
}

function persistConfig(options = {}) {
  recordHistory();
  const publish = Boolean(options.publish);
  const notifyClients = Boolean(options.notifyClients);
  if (state.editMode && !publish) {
    state.editorDirty = true;
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
    return;
  }
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => saveConfig({ publish, notifyClients }), publish ? 0 : 350);
}

async function saveConfig({ publish = false, notifyClients = false } = {}) {
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  try {
    const query = new URLSearchParams();
    if (publish) query.set('publish', '1');
    if (publish && notifyClients) query.set('user_save', '1');
    const response = await fetch(`/api/config${query.toString() ? `?${query}` : ''}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(publish && notifyClients ? { 'x-uc-wall-user-save': '1' } : {}) },
      body: JSON.stringify(state.config)
    });
    if (!response.ok) throw new Error(`Save failed (${response.status})`);
    if (publish) { state.editorDirty = false; state.historyCurrent = configSnapshot(); }
    return true;
  } catch (error) {
    toast(`Dashboard could not be saved: ${error.message}`, 'error');
    return false;
  }
}

async function publishEditorChanges() {
  if (state.editorSaving) return;
  state.editorSaving = true;
  render();
  state.config.activeDashboardId = currentDashboard()?.id || state.config.activeDashboardId;
  const saved = await saveConfig({ publish: true, notifyClients: true });
  state.editorSaving = false;
  if (saved) {
    state.editMode = false;
    state.modal = null;
    toast('Dashboard saved and kiosk clients refreshed');
  }
  render();
}

function toast(message, type = '', options = {}) {
  if (state.kioskMode && type !== 'error') return;
  if (options.key) dismissToast(options.key);
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  if (options.key) node.dataset.toastKey = options.key;
  node.textContent = translateDashboardText(message);
  toastRegion.append(node);
  setTimeout(() => node.remove(), 3300);
}

function dismissToast(key) {
  toastRegion.querySelectorAll('[data-toast-key]').forEach((node) => { if (node.dataset.toastKey === key) node.remove(); });
}

function materialSymbol(name, size = 22, className = '') {
  const symbol = /^[a-z0-9_]+$/i.test(String(name || '')) ? String(name) : 'help';
  const px = Math.max(8, Number(size) || 22);
  return `<span class="uc-icon material-symbols-rounded ${escapeHtml(className)}" style="font-size:${px}px" aria-hidden="true">${escapeHtml(symbol)}</span>`;
}

function icon(name, size = 22) {
  const symbols = {
    settings: 'settings', tune: 'tune', edit: 'edit', plus: 'add', close: 'close', trash: 'delete',
    play: 'play_arrow', pause: 'pause', next: 'skip_next', previous: 'skip_previous', stop: 'stop',
    volume: 'volume_up', mute: 'volume_off', power: 'power_settings_new', light: 'lightbulb',
    climate: 'thermostat', cover: 'blinds', sensor: 'sensors', select: 'list', button: 'radio_button_checked',
    media_player: 'tv', up: 'keyboard_arrow_up', down: 'keyboard_arrow_down', more: 'more_horiz',
    refresh: 'refresh', check: 'check', minus: 'remove', wifi: 'wifi', bolt: 'bolt', user: 'person', grid: 'grid_view',
    clock: 'schedule', weather: 'partly_cloudy_day', sun: 'sunny', cloud: 'cloud', rain: 'rainy',
    snow: 'weather_snowy', storm: 'thunderstorm', fog: 'foggy', text: 'text_fields', battery: 'battery_full',
    activity: 'play_circle', camera: 'videocam', conditional: 'rule', divider_h: 'horizontal_rule',
    divider_v: 'more_vert', image: 'image', spacer: 'crop_free', code: 'code', palette: 'palette', javascript: 'javascript',
    command: 'touch_app', touch_app: 'touch_app', text_fields: 'text_fields', buttons_alt: 'buttons_alt', library_music: 'library_music', tab: 'tab', view_carousel: 'view_carousel', dataset: 'dataset', speed: 'speed', visibility: 'visibility', meeting_room: 'meeting_room', show_chart: 'show_chart', notifications_active: 'notifications_active'
  };
  return materialSymbol(symbols[name] || symbols.button, size);
}

function renderWidgetIcon(item, fallbackName, size = 22, className = '') {
  const settings = item?.settings || {};
  if (settings.iconMode === 'upload' && /^data:image\/(?:png|svg\+xml)(?:;|,)/i.test(settings.customIconData || '')) {
    return `<img class="widget-icon-image ${escapeHtml(className)}" src="${escapeHtml(settings.customIconData)}" alt="" style="width:${Number(size) || 22}px;height:${Number(size) || 22}px">`;
  }
  if (settings.iconMode === 'unfolded_tools' && chosenIconIsImage(settings.unfoldedToolsIconUrl)) return `<img class="widget-icon-image ${escapeHtml(className)}" src="${escapeHtml(settings.unfoldedToolsIconUrl)}" alt="" style="width:${Number(size) || 22}px;height:${Number(size) || 22}px">`;
  if (settings.iconMode === 'material' && settings.materialIcon) return materialSymbol(settings.materialIcon, size, className);
  return icon(fallbackName, size);
}

function entityForItem(item) {
  return state.entities.get(item.entityId) || item.snapshot || {
    entity_id: item.entityId,
    entity_type: item.entityType,
    name: { en: item.entityId },
    attributes: { state: 'UNAVAILABLE' }
  };
}

function entityState(entity) {
  return String(entity.attributes?.state || 'UNKNOWN').toUpperCase();
}

function isUnavailable(entity) {
  return ['UNAVAILABLE', 'UNKNOWN'].includes(entityState(entity));
}

function itemElements(item, type) {
  return {
    ...(DEFAULT_ELEMENTS[type] || {}),
    ...(state.config?.widgetDefaults?.[type] || {}),
    ...(item.settings?.elements || {})
  };
}

function marquee(value, className = '') {
  // Translate before markup enters the DOM. This keeps frequently refreshed
  // runtime widgets from alternating between their source and translated copy.
  const text = translateDashboardText(String(value ?? ''));
  return `<span class="marquee ${className}" title="${escapeHtml(text)}"><span class="marquee-content">${escapeHtml(text)}</span></span>`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read image'));
    reader.readAsDataURL(file);
  });
}

async function widgetAppearanceFromForm(data, existing = {}) {
  const textOverflow = String(data.get('textOverflow') || existing.textOverflow || 'scroll');
  const iconMode = String(data.get('iconMode') || existing.iconMode || 'default');
  const next = {
    showWidgetTitle: data.get('showWidgetTitle') === 'on',
    showWidgetBackground: data.get('showWidgetBackground') === 'on',
    showWidgetBorder: data.get('showWidgetBorder') === 'on',
    textOverflow: ['scroll', 'wrap', 'truncate'].includes(textOverflow) ? textOverflow : 'scroll',
    iconMode: ['default', 'material', 'upload', 'unfolded_tools'].includes(iconMode) ? iconMode : 'default',
    materialIcon: String(data.get('materialIcon') || existing.materialIcon || '').trim(),
    customIconData: String(existing.customIconData || ''),
    customIconName: String(existing.customIconName || ''),
    unfoldedToolsIconUrl: String(data.get('unfoldedToolsIconUrl') || existing.unfoldedToolsIconUrl || ''),
    unfoldedToolsIconAsset: existing.unfoldedToolsIconAsset && typeof existing.unfoldedToolsIconAsset === 'object' ? structuredClone(existing.unfoldedToolsIconAsset) : null,
    customHtmlMode: ['append', 'prepend', 'replace'].includes(String(data.get('customHtmlMode') || existing.customHtmlMode || 'append')) ? String(data.get('customHtmlMode') || existing.customHtmlMode || 'append') : 'append',
    customCodeScope: data.get('customCodeGlobal') === 'on' ? 'dashboard' : 'widget',
    customHtml: String(data.get('customHtml') ?? existing.customHtml ?? ''),
    customCss: String(data.get('customCss') ?? existing.customCss ?? ''),
    customJs: String(data.get('customJs') ?? existing.customJs ?? '')
  };
  if (data.get('clearCustomIcon') === 'on') {
    next.customIconData = '';
    next.customIconName = '';
    if (next.iconMode === 'upload') next.iconMode = 'default';
  }
  const iconFile = data.get('customIconFile');
  if (iconFile instanceof File && iconFile.size > 0) {
    const allowed = iconFile.type === 'image/png' || iconFile.type === 'image/svg+xml' || /\.(png|svg)$/i.test(iconFile.name || '');
    if (!allowed) throw new Error('Widget icons must be PNG or SVG files');
    if (iconFile.size > 2 * 1024 * 1024) throw new Error('Widget icons must be 2 MB or smaller');
    next.customIconData = await fileToDataUrl(iconFile);
    next.customIconName = iconFile.name || 'Uploaded icon';
    next.iconMode = 'upload';
  }
  const unfoldedToolsAssetValue = String(data.get('unfoldedToolsIconAsset') || '').trim();
  if (unfoldedToolsAssetValue) { try { next.unfoldedToolsIconAsset = JSON.parse(unfoldedToolsAssetValue); } catch {} }
  if (next.iconMode === 'material' && !next.materialIcon) next.iconMode = 'default';
  if (next.iconMode === 'upload' && !next.customIconData) next.iconMode = 'default';
  if (next.iconMode === 'unfolded_tools' && !next.unfoldedToolsIconUrl) next.iconMode = 'default';
  return next;
}

function currentTime(settings = {}) {
  const options = {
    hour: '2-digit',
    minute: '2-digit',
    second: settings.showSeconds ? '2-digit' : undefined,
    hour12: Boolean(settings.hour12)
  };
  if (settings.timezone) options.timeZone = settings.timezone;
  try { return new Intl.DateTimeFormat(dashboardLocale(), options).format(new Date()); }
  catch { delete options.timeZone; return new Intl.DateTimeFormat(dashboardLocale(), options).format(new Date()); }
}

function currentDate(settings = {}) {
  const options = { weekday: 'long', day: 'numeric', month: 'long' };
  if (settings.timezone) options.timeZone = settings.timezone;
  try { return new Intl.DateTimeFormat(dashboardLocale(), options).format(new Date()); }
  catch { delete options.timeZone; return new Intl.DateTimeFormat(dashboardLocale(), options).format(new Date()); }
}


function statusBarDate(settings = {}) {
  const style = ['short','medium','long','full'].includes(settings.dateStyle) ? settings.dateStyle : 'long';
  const options = { dateStyle: style };
  if (settings.timezone) options.timeZone = settings.timezone;
  try { return new Intl.DateTimeFormat(dashboardLocale(), options).format(new Date()); }
  catch { delete options.timeZone; return new Intl.DateTimeFormat(dashboardLocale(), options).format(new Date()); }
}

function statusBarEntityValue(entity, display = 'name_state') {
  if (!entity) return 'Entity unavailable';
  const attributes = entity.attributes || {};
  const raw = attributes.value ?? attributes.current_option ?? attributes.state ?? '';
  const stateText = translateDashboardValue(raw || entityState(entity));
  const unit = attributes.unit || attributes.unit_of_measurement || '';
  const value = `${stateText}${unit ? ` ${unit}` : ''}`;
  if (display === 'name') return localName(entity.name, entity.entity_id);
  if (display === 'state') return stateText;
  if (display === 'value') return value;
  return `${localName(entity.name, entity.entity_id)} · ${value}`;
}

function hexToRgb(hex) { const match = String(hex || '').match(/^#([0-9a-f]{6})$/i); if (!match) return { r:0,g:0,b:0 }; const value=parseInt(match[1],16); return { r:(value>>16)&255, g:(value>>8)&255, b:value&255 }; }

function statusBarSlotContent(kind, dashboard, settings, slot = 'left') {
  const customText = settings[`${slot}CustomText`] || settings.customText || '';
  const entity = state.entities.get(settings[`${slot}EntityId`] || '');
  const entityDisplay = settings[`${slot}EntityDisplay`] || 'name_state';
  const batteryLevel = runtimeBatteryLevel();
  switch (kind) {
    case 'time': return `<span class="status-slot-text">${escapeHtml(currentTime({ showSeconds: settings.showSeconds, hour12: settings.hour12, timezone: settings.timezone }))}</span>`;
    case 'date': return `<span class="status-slot-text">${escapeHtml(statusBarDate(settings))}</span>`;
    case 'page': return `<button class="status-page" data-action="open-page-selector" aria-label="Select dashboard">${marquee(dashboard?.name || '', 'status-page-marquee')}</button>`;
    case 'custom': return `<span class="status-slot-text">${marquee(customText)}</span>`;
    case 'entity': return `<span class="status-slot-text status-entity-text" title="${escapeHtml(entity?.entity_id || 'No entity selected')}">${marquee(statusBarEntityValue(entity, entityDisplay))}</span>`;
    case 'battery': return Number.isFinite(batteryLevel) ? `<span class="status-slot-text status-data-with-icon">${materialSymbol(runtimeBatteryCharging() ? 'battery_charging_full' : 'battery_full', Number(settings.iconSize) || 19)}<span>${Math.round(batteryLevel)}%</span></span>` : '';
    case 'connection': return `<span class="status-slot-text status-data-with-icon">${materialSymbol(state.connected ? 'wifi' : 'wifi_off', Number(settings.iconSize) || 19)}<span>${escapeHtml(translateDashboardValue(state.connected ? 'connected' : state.connectionMessage || 'disconnected'))}</span></span>`;
    case 'entity_count': return `<span class="status-slot-text status-data-with-icon">${materialSymbol('dataset', Number(settings.iconSize) || 19)}<span>${state.entities.size}</span></span>`;
    case 'charging': { const charging = runtimeBatteryCharging(); return charging === null ? '' : `<span class="status-slot-text status-data-with-icon">${materialSymbol(charging ? 'bolt' : 'power_off', Number(settings.iconSize) || 19)}<span>${translateDashboardValue(charging ? 'charging' : 'on_battery')}</span></span>`; }
    default: return '';
  }
}


function statusBarLayoutItemContent(item, dashboard, settings) {
  const iconSize = Math.max(12, Math.min(36, Number(settings.iconSize) || 19));
  const batteryLevel = runtimeBatteryLevel();
  const alerts = item.type === 'alerts' ? statusBarAlerts(settings) : [];
  const dataItem = { ...settings, leftCustomText: item.customText, leftEntityId: item.entityId, leftEntityDisplay: item.entityDisplay };
  if (['time','date','page','custom','entity','battery','connection','entity_count','charging'].includes(item.type)) return statusBarSlotContent(item.type, dashboard, dataItem, 'left');
  if (item.type === 'divider') return '<span class="status-column-divider" aria-hidden="true"></span>';
  if (item.type === 'profile') return `<span class="profile-dot">${escapeHtml(String(settings.profileText || 'W').slice(0, 2))}</span>`;
  if (item.type === 'alerts') return alerts.length ? `<button type="button" class="status-alert-indicator severity-${escapeHtml(alerts[0].severity)}" data-action="open-status-alerts" title="${alerts.length} active alert${alerts.length === 1 ? '' : 's'}" aria-label="Open ${alerts.length} active alert${alerts.length === 1 ? '' : 's'}">${materialSymbol(alerts[0].severity === 'critical' ? 'error' : 'notifications_active', iconSize)}<b>${alerts.length > 99 ? '99+' : alerts.length}</b></button>` : '';
  return '';
}

function mediaBrowserButton(entityId, label = 'Browse media', className = '') {
  if (!entityId) return '';
  const entity = state.entities.get(entityId);
  if (!entity || !entity.features?.includes?.('browse_media')) return '';
  return `<button class="media-browser-launch ${escapeHtml(className)}" data-action="open-media-browser-modal" data-media-entity-id="${escapeHtml(entityId)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${materialSymbol('library_music', 22)}</button>`;
}

function activityBrowserEntity(entity, item) {
  const configured = state.entities.get(item?.settings?.mediaBrowserEntityId || '');
  if (configured?.entity_type === 'media_player') return configured;
  return activityRelatedEntities(entity).map((reference) => reference.entity).find((candidate) => candidate.entity_type === 'media_player') || null;
}

function browserModalDefaults(entityId, sourceSettings = {}) {
  return {
    ...SYSTEM_WIDGETS.media_browser.settings,
    mediaEntityId: entityId,
    title: sourceSettings.mediaBrowserTitle || sourceSettings.title || state.entities.get(entityId)?.name && localName(state.entities.get(entityId).name) || 'Media',
    pageSize: String(Math.max(10, Math.min(100, Number(sourceSettings.mediaBrowserPageSize || sourceSettings.pageSize) || 12))),
    layoutMode: sourceSettings.mediaBrowserLayoutMode || sourceSettings.layoutMode || 'swiper_coverflow',
    columns: sourceSettings.mediaBrowserColumns || sourceSettings.columns || '4',
    showArtwork: sourceSettings.mediaBrowserShowArtwork !== false,
    showSearch: sourceSettings.mediaBrowserShowSearch !== false,
    showSubtitle: sourceSettings.mediaBrowserShowSubtitle !== false,
    playAction: sourceSettings.mediaBrowserPlayAction || sourceSettings.playAction || 'PLAY_NOW',
    swiperSlidesPerView: sourceSettings.mediaBrowserSlidesPerView || sourceSettings.swiperSlidesPerView || '3',
    swiperSpaceBetween: sourceSettings.mediaBrowserSpaceBetween || sourceSettings.swiperSpaceBetween || '18',
    swiperCentered: sourceSettings.mediaBrowserCentered !== false,
    swiperLoop: Boolean(sourceSettings.mediaBrowserLoop),
    swiperNavigation: sourceSettings.mediaBrowserNavigation !== false,
    swiperPagination: sourceSettings.mediaBrowserPagination !== false,
    modalTitle: sourceSettings.mediaBrowserModalTitle || '',
    modalIcon: sourceSettings.mediaBrowserModalIcon || 'library_music',
    modalWidth: sourceSettings.mediaBrowserModalWidth || 'wide',
    modalHeight: sourceSettings.mediaBrowserModalHeight || 'tall',
    modalBackground: sourceSettings.mediaBrowserModalBackground || '#111111',
    modalForeground: sourceSettings.mediaBrowserModalForeground || '#f4f4f4',
    modalRadius: String(sourceSettings.mediaBrowserModalRadius ?? '24'),
    modalBackdrop: String(sourceSettings.mediaBrowserModalBackdrop ?? '72'),
    modalShowHeader: sourceSettings.mediaBrowserModalShowHeader !== false
  };
}

function openMediaBrowserModal(entityId, sourceSettings = {}, title = '') {
  const entity = state.entities.get(entityId);
  if (!entity) return toast('Media player is unavailable', 'error');
  const browserKey = `modal-media-${uid('browser')}`;
  state.modal = { type: 'media-browser', browserKey, title: title || localName(entity.name), settings: browserModalDefaults(entityId, sourceSettings) };
  renderModalRoot();
}

function getMediaBrowserContext(itemId) {
  if (state.modal?.type === 'media-browser' && state.modal.browserKey === itemId) {
    return { item: { id: itemId, kind: 'system', widgetType: 'media_browser', settings: state.modal.settings }, settings: state.modal.settings, modal: true };
  }
  const { item } = findDashboardItem(itemId);
  if (!item || item.widgetType !== 'media_browser') return null;
  return { item, settings: { ...SYSTEM_WIDGETS.media_browser.settings, ...(item.settings || {}) }, modal: false };
}

function createEntityWidget(entity) {
  const size = DEFAULT_SIZES[entity.entity_type] || { w: 3, h: 2 };
  return { id: uid('widget'), kind: 'entity', entityId: entity.entity_id, entityType: entity.entity_type, x: 0, y: 0, w: size.w, h: size.h, settings: { textOverflow: 'scroll', iconMode: 'default', materialIcon: '', customIconData: '', customIconName: '', unfoldedToolsIconUrl: '', unfoldedToolsIconAsset: null, customHtmlMode: 'append', customHtml: '', customCss: '', customJs: '', elements: { ...DEFAULT_ELEMENTS[entity.entity_type], ...(state.config.widgetDefaults?.[entity.entity_type] || {}) } }, snapshot: structuredClone(entity) };
}

function createSystemWidget(type) {
  const definition = SYSTEM_WIDGETS[type];
  if (!definition) return null;
  const size = DEFAULT_SIZES[type] || { w: 4, h: 2 };
  return { id: uid('widget'), kind: 'system', widgetType: type, x: 0, y: 0, w: size.w, h: size.h, settings: { textOverflow: 'scroll', iconMode: 'default', materialIcon: '', customIconData: '', customIconName: '', unfoldedToolsIconUrl: '', unfoldedToolsIconAsset: null, customHtmlMode: 'append', customHtml: '', customCss: '', customJs: '', ...structuredClone(definition.settings) } };
}

function nestedWidgetAddControls(containerItem, { includeTabTarget = false } = {}) {
  const entities = accessibleEntities().filter((entity) => ENTITY_TYPES.includes(entity.entity_type)).sort((a,b) => localName(a.name).localeCompare(localName(b.name)));
  const systems = Object.entries(SYSTEM_WIDGETS).filter(([type]) => type !== containerItem.widgetType);
  const tabs = includeTabTarget ? (containerItem.settings?.tabs || []) : [];
  return `<section class="settings-section nested-widget-builder"><h3>Add a new widget inside</h3><p class="muted">Create a new entity or system widget directly in this container. It does not need to exist on the dashboard first.</p>${includeTabTarget ? `<div class="field"><label>Target tab</label><select class="settings-input" data-nested-target-tab>${tabs.map((tab) => `<option value="${escapeHtml(tab.id)}">${escapeHtml(tab.name)}</option>`).join('')}</select></div>` : ''}<div class="nested-widget-add-row"><select class="settings-input" data-nested-entity-select><option value="">Choose entity…</option>${entities.map((entity) => `<option value="${escapeHtml(entity.entity_id)}">${escapeHtml(localName(entity.name))} · ${escapeHtml(TYPE_LABELS[entity.entity_type] || entity.entity_type)}</option>`).join('')}</select><button type="button" class="pill-button" data-action="add-nested-entity" data-container-id="${escapeHtml(containerItem.id)}">${icon('plus',18)} Add entity</button></div><div class="nested-widget-add-row"><select class="settings-input" data-nested-system-select><option value="">Choose widget…</option>${systems.map(([type,definition]) => `<option value="${escapeHtml(type)}">${escapeHtml(definition.label)}</option>`).join('')}</select><button type="button" class="pill-button" data-action="add-nested-system" data-container-id="${escapeHtml(containerItem.id)}">${icon('plus',18)} Add widget</button></div></section>`;
}

function addNestedWidget(containerId, kind, value, tabId = '') {
  const { item } = findDashboardItem(containerId);
  if (!item || !CONTAINER_WIDGET_TYPES.has(item.widgetType)) return;
  const child = kind === 'entity' ? createEntityWidget(state.entities.get(value)) : createSystemWidget(value);
  if (!child) return toast('Choose a valid widget', 'error');
  if (item.widgetType === 'tab_container') {
    const tabs = item.settings?.tabs || [];
    const target = tabs.find((tab) => tab.id === tabId) || tabs[0];
    if (!target) return toast('Add a tab first', 'error');
    target.items ||= [];
    target.items.push(child);
  } else {
    item.settings.items ||= [];
    item.settings.items.push(child);
  }
  persistConfig();
  renderModalRoot();
  toast(`${kind === 'entity' ? localName(state.entities.get(value)?.name) : SYSTEM_WIDGETS[value]?.label || 'Widget'} added inside container`);
}

function applyKioskScale() {
  cancelAnimationFrame(state.kioskScaleRaf);
  state.kioskScaleRaf = requestAnimationFrame(() => {
    const settings = state.config?.ui?.kiosk || {};
    const stage = app.querySelector('[data-kiosk-scale-stage]');
    const canvas = app.querySelector('[data-kiosk-scale-canvas]');
    if (!stage || !canvas) return;
    stage.style.padding = '';
    stage.style.paddingBottom = '';
    stage.style.overflow = '';
    stage.style.overflowX = '';
    stage.style.overflowY = '';
    canvas.style.width = '';
    canvas.style.transform = '';
    canvas.style.transformOrigin = '';
    canvas.style.setProperty('--kiosk-scale', '1');
    if (!state.kioskMode || !settings.scaleToFit) return;

    const padding = Math.max(0, Math.min(80, Number(settings.padding) || 0));
    const widthMode = ['fill','center','left'].includes(settings.widthMode) ? settings.widthMode : 'fill';
    const dock = app.querySelector('.dashboard-navigation-bottom_dock');
    const dockReserve = dock ? Math.ceil(dock.getBoundingClientRect().height + 20) : 0;
    stage.style.padding = `${padding}px`;
    if (dockReserve) stage.style.paddingBottom = `${padding + dockReserve}px`;

    // Reflow is a native responsive layout, not a virtual fixed-width canvas.
    // Scaling it while also widening the canvas creates a feedback loop with the
    // square grid: every wider pass makes rows taller and forces a smaller scale.
    // Keep reflow at 100% and allow vertical scrolling when the dashboard is taller
    // than the kiosk viewport. Fixed-width modes still use complete-dashboard fit.
    if (widthMode === 'fill') {
      stage.style.overflowX = 'hidden';
      stage.style.overflowY = 'auto';
      canvas.style.width = '100%';
      canvas.style.transform = 'none';
      canvas.style.transformOrigin = 'top left';
      canvas.style.setProperty('--kiosk-scale', '1');
      syncDashboardGridGeometry(canvas);
      return;
    }

    stage.style.overflow = 'hidden';
    canvas.style.width = '100%';
    canvas.style.transform = 'none';
    const availableWidth = Math.max(1, stage.clientWidth - padding * 2);
    const availableHeight = Math.max(1, stage.clientHeight - padding * 2 - dockReserve);
    const contentWidth = Math.max(1, canvas.scrollWidth);
    const contentHeight = Math.max(1, canvas.scrollHeight);
    let scale = Math.min(availableWidth / contentWidth, availableHeight / contentHeight);
    if (!settings.allowUpscale) scale = Math.min(1, scale);
    scale = Math.max(.35, Math.min(2, scale));
    canvas.style.transformOrigin = widthMode === 'center' ? 'top center' : 'top left';
    canvas.style.transform = `scale(${scale})`;
    canvas.style.setProperty('--kiosk-scale', String(scale));
  });
}


function finiteRuntimeNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.trim().match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const number = Number(match[0]);
      if (Number.isFinite(number)) return number;
    }
  }
  return Number.NaN;
}

function runtimeBatteryLevel(runtime = state.runtime) {
  const level = runtime?.battery?.level;
  return Number.isFinite(level) ? Math.max(0, Math.min(100, Number(level))) : Number.NaN;
}

function runtimeBatteryCharging(runtime = state.runtime) {
  return typeof runtime?.battery?.charging === 'boolean' ? runtime.battery.charging : null;
}

function renderStatusBar(dashboard) {
  const settings = state.config?.ui?.statusBar || {};
  if (settings.visible === false && !state.editMode) return '';
  const height = Math.max(28, Math.min(96, Number(settings.height) || 40));
  const opacity = Math.max(0, Math.min(100, Number(settings.backgroundOpacity ?? 98))) / 100;
  const rgb = hexToRgb(settings.background || '#000000');
  const background = `rgba(${rgb.r},${rgb.g},${rgb.b},${opacity})`;
  const layout = normalizeStatusBarLayout(settings);
  const style = `--status-height:${height}px;--status-columns:${layout.layoutColumns};--status-background:${background};--status-foreground:${escapeHtml(settings.foreground || '#d0d0d0')};--status-indicator-color:${escapeHtml(settings.indicatorColor || settings.foreground || '#d0d0d0')};--status-profile-background:${escapeHtml(settings.profileBackground || settings.foreground || '#d0d0d0')};--status-profile-foreground:${escapeHtml(settings.profileForeground || '#000000')};--status-position:${settings.sticky === false ? 'relative' : 'sticky'};--status-blur:${Math.max(0, Math.min(40, Number(settings.blur) || 0))}px;--status-border-width:${Math.max(0, Math.min(8, Number(settings.borderWidth) || 0))}px;--status-border-color:${escapeHtml(settings.borderColor || '#252525')};--status-radius:${Math.max(0, Math.min(40, Number(settings.radius) || 0))}px;--status-font-size:${Math.max(9, Math.min(28, Number(settings.fontSize) || 13))}px;--status-font-weight:${Math.max(100, Math.min(900, Number(settings.fontWeight) || 550))};--status-icon-size:${Math.max(12, Math.min(36, Number(settings.iconSize) || 19))}px;--status-horizontal-padding:${Math.max(0, Math.min(40, Number(settings.horizontalPadding) || 10))}px;--status-item-gap:${Math.max(0, Math.min(24, Number(settings.itemGap) || 6))}px`;
  const indicatorClass = settings.indicatorStyle === 'chips' ? 'indicator-chips' : 'indicator-plain';
  const alignmentClass = `status-align-${normalizeStatusBarAlignment(settings.alignment)}`;
  return `<header class="remote-statusbar status-grid-layout ${alignmentClass} ${state.editMode ? 'reorder editable-statusbar' : ''} ${settings.shadow ? 'with-shadow' : ''} ${settings.uppercase ? 'status-uppercase' : ''} ${indicatorClass}" style="${style}" ${state.editMode ? 'data-action="open-statusbar-editor" title="Customize status bar"' : ''}>
    ${layout.layoutItems.slice(0, layout.layoutColumns).map((item, index) => `<div class="status-grid-cell status-type-${escapeHtml(item.type)}" data-status-grid-index="${index}">${statusBarLayoutItemContent(item, dashboard, settings)}</div>`).join('')}
    ${state.editMode ? `<button class="statusbar-edit-button statusbar-grid-edit" data-action="open-statusbar-editor" title="Customize status bar">${icon('tune',18)}</button>` : ''}
  </header>`;
}

function renderPageDots(dashboard) {
  if ((state.config?.dashboards?.length || 0) < 2) return '';
  return `<div class="page-dots" aria-hidden="true">${state.config.dashboards.map((entry) => `<span class="page-dot ${entry.id === dashboard?.id ? 'active' : ''}"></span>`).join('')}</div>`;
}

function navigationSettings() {
  const raw = state.config?.ui?.navigation || {};
  return {
    mode: ['default', 'right_cards', 'top_tabs', 'bottom_dock'].includes(raw.mode) ? raw.mode : 'default',
    showIcons: raw.showIcons !== false,
    showLabels: raw.showLabels !== false,
    cardWidth: Math.max(112, Math.min(240, Number(raw.cardWidth) || 152)),
    transition: ['none','fade','slide','scale','coverflow','flip','push','reveal','vertical'].includes(raw.transition) ? raw.transition : 'slide'
  };
}

function dashboardNavigationButton(entry, active, settings, extraClass = '') {
  const color = /^#[0-9a-f]{6}$/i.test(String(entry.navColor || '')) ? entry.navColor : '#d0d0d0';
  const locked = Boolean(entry.pinHash && !dashboardIsUnlocked(entry));
  const symbol = locked ? 'lock' : entry.navIcon || 'dashboard';
  return `<button type="button" class="dashboard-nav-item ${active ? 'active' : ''} ${locked ? 'locked' : ''} ${escapeHtml(extraClass)}" style="--dashboard-nav-accent:${escapeHtml(color)}" data-action="select-dashboard" data-id="${escapeHtml(entry.id)}" aria-current="${active ? 'page' : 'false'}" title="${escapeHtml(entry.name)}${locked ? ' · PIN locked' : ''}">${settings.showIcons ? `<span class="dashboard-nav-icon">${locked ? materialSymbol('lock',22) : renderChosenIcon(symbol,22,'dashboard')}</span>` : ''}${settings.showLabels ? `<span class="dashboard-nav-label">${marquee(entry.name)}</span>` : ''}</button>`;
}

function renderDashboardNavigation(dashboard, mode = navigationSettings().mode) {
  const settings = navigationSettings();
  if (mode === 'default' || (state.config?.dashboards?.length || 0) < 2) return '';
  const items = state.config.dashboards.map((entry) => dashboardNavigationButton(entry, entry.id === dashboard?.id, settings)).join('');
  return `<nav class="dashboard-navigation dashboard-navigation-${escapeHtml(mode)}" style="--dashboard-nav-card-width:${settings.cardWidth}px" aria-label="Dashboards">${items}</nav>`;
}

function renderDashboardHero(dashboard) {
  const settings = navigationSettings();
  if (settings.mode === 'default') {
    return `<section class="remote-page-hero" data-page-swipe><button class="remote-page-title" data-action="open-page-selector" aria-label="Swipe or tap to change dashboard">${marquee(dashboard?.name || 'Dashboard', 'page-title-marquee')}</button>${renderPageDots(dashboard)}${(state.config?.dashboards?.length || 0) > 1 ? '<small class="swipe-hint">Swipe the dashboard name</small>' : ''}</section>`;
  }
  return `<section class="remote-page-hero compact-navigation-hero"><button class="remote-page-title" data-action="open-page-selector" aria-label="Choose dashboard">${marquee(dashboard?.name || 'Dashboard', 'page-title-marquee')}</button></section>`;
}

function navigationModeCard(value, title, description, symbol, current) {
  return `<label class="navigation-mode-card"><input type="radio" name="mode" value="${escapeHtml(value)}" ${current === value ? 'checked' : ''}><span><i>${materialSymbol(symbol,28)}</i><b>${escapeHtml(title)}</b><small>${escapeHtml(description)}</small></span></label>`;
}



function screensaverSettings() {
  return state.config?.ui?.screensaver || {};
}

function renderScreensaverTriggeredWidget(item) {
  if (!item) return '';
  const isSystem = item.kind === 'system';
  const entity = isSystem ? null : entityForItem(item);
  const type = isSystem ? item.widgetType : entity?.entity_type || item.entityType || 'unknown';
  const nativeContent = accessDenied
    ? `<div class="entity-access-disabled">${materialSymbol('visibility_off',32)}<strong>Entity hidden by dashboard access settings</strong><span>${escapeHtml(localName(entity?.name, entity?.entity_id || 'Entity'))}</span></div>`
    : isSystem ? renderSystemWidget(item, { nestedDepth: 0 }) : renderEntityWidget(entity, item);
  const transparentContainer = isSystem && ['carousel', 'entity_group'].includes(type) && item.settings?.containerStyle === false;
  return `<article class="screensaver-trigger-widget remote-entity ${isSystem ? 'system-widget' : 'entity-widget'} type-${escapeHtml(type)} text-overflow-${widgetTextMode(item)} ${item.settings?.showWidgetTitle === false ? 'widget-title-hidden' : ''} widget-content-align-${escapeHtml(item.settings?.contentAlignment || 'default')} ${item.settings?.showWidgetBackground === false ? 'widget-background-hidden' : ''} ${item.settings?.showWidgetBorder === false ? 'widget-border-hidden' : ''} ${transparentContainer ? 'container-shell-transparent' : ''}" data-screensaver-widget data-item-id="${escapeHtml(item.id)}">${widgetCustomStyle(item)}${widgetElementLayoutStyle(item)}${composeWidgetContent(item, nativeContent)}</article>`;
}

function renderScreensaverUnlock(settings) {
  const animationClass = state.screensaverExiting ? 'is-hiding' : '';
  return `<section class="dashboard-screensaver screensaver-unlock-view ${animationClass}" aria-label="Locked screensaver">
    <div class="screensaver-shade"></div>
    <form class="screensaver-unlock-card" data-screensaver-unlock-form>
      <div class="screensaver-lock-icon">${materialSymbol('lock', 38)}</div>
      <h2>Screensaver locked</h2>
      <p>Enter the screensaver PIN to return to the dashboard.${settings.lockPinHint ? ` Hint: ${escapeHtml(settings.lockPinHint)}` : ''}</p>
      <input class="settings-input screensaver-pin-input" type="password" inputmode="numeric" autocomplete="off" name="pin" placeholder="PIN" required autofocus>
      <div class="screensaver-unlock-actions"><button type="button" class="pill-button" data-action="cancel-screensaver-unlock">Cancel</button><button type="submit" class="pill-button primary">Unlock</button></div>
    </form>
  </section>`;
}

function renderScreensaver() {
  if (!state.screensaverActive) return '';
  const settings = screensaverSettings();
  if (state.screensaverUnlockPrompt && settings.lockEnabled && settings.lockPinHash) return renderScreensaverUnlock(settings);
  const animationClass = state.screensaverExiting ? 'is-hiding' : '';
  const activeTrigger = state.screensaverTrigger;
  const triggerWidget = activeTrigger ? allDashboardItems().find((item) => item.id === activeTrigger.widgetId) : null;
  const mode = ['clock', 'image', 'clock_image'].includes(settings.mode) ? settings.mode : 'clock';
  const hasImage = Boolean(settings.image) && mode !== 'clock';
  const level = runtimeBatteryLevel();
  const movementDuration = Math.max(30, Math.min(1800, Number(settings.movementDuration) || 180));
  const contentScale = Math.max(50, Math.min(180, Number(settings.contentScale) || 100)) / 100;
  const clockScale = Math.max(50, Math.min(180, Number(settings.clockSize) || 100)) / 100;
  const widgetColumns = Math.max(1, Math.min(4, Number(settings.widgetColumns) || 2));
  const triggerSpan = Math.max(1, Math.min(widgetColumns, Number(activeTrigger?.columnSpan) || 1));
  const backgroundStyle = `--screensaver-background:${escapeHtml(settings.background || '#000000')};--screensaver-foreground:${escapeHtml(settings.foreground || '#ffffff')};--screensaver-overlay:${Math.max(0, Math.min(100, Number(settings.overlay ?? 25))) / 100};--screensaver-image:${hasImage ? `url(&quot;${escapeHtml(settings.image)}&quot;)` : 'none'};--screensaver-movement-duration:${movementDuration}s;--screensaver-content-scale:${contentScale};--screensaver-clock-scale:${clockScale};--screensaver-image-fit:${escapeHtml(settings.imageFit || 'cover')};--screensaver-widget-columns:${widgetColumns};--screensaver-widget-span:${triggerSpan}`;
  const triggerPanel = triggerWidget ? `<div class="screensaver-trigger-reserved" data-screensaver-trigger-region><article class="screensaver-trigger-panel ${state.screensaverWidgetFullscreen ? 'is-fullscreen' : ''}"><div class="screensaver-trigger-head"><div>${materialSymbol('sensors',22)}<span>${escapeHtml(activeTrigger.title || (activeTrigger.entityId ? localName(state.entities.get(activeTrigger.entityId)?.name, '') : '') || screensaverWidgetLabel(triggerWidget))}</span></div><button type="button" class="screensaver-trigger-fullscreen" data-action="toggle-screensaver-widget-fullscreen" aria-label="${state.screensaverWidgetFullscreen ? 'Exit widget full screen' : 'Show widget full screen'}" title="${state.screensaverWidgetFullscreen ? 'Exit full screen' : 'Full screen'}">${materialSymbol(state.screensaverWidgetFullscreen ? 'fullscreen_exit' : 'fullscreen',24)}</button></div><div class="screensaver-trigger-widget-stage">${renderScreensaverTriggeredWidget(triggerWidget)}</div></article></div>` : '';
  return `<section class="dashboard-screensaver screensaver-composed-view ${hasImage ? 'has-image' : ''} ${triggerWidget ? 'has-trigger-widget' : ''} ${state.screensaverWidgetFullscreen ? 'trigger-widget-fullscreen' : ''} ${animationClass}" style="${backgroundStyle}" data-action="request-screensaver-wake" aria-label="Screensaver. Tap to return.">
    <div class="screensaver-shade"></div>
    <div class="screensaver-layout-stack">
      <div class="screensaver-content ${settings.movement !== false && !triggerWidget ? 'movement' : ''}" data-screensaver-clock>
        ${settings.title ? `<small>${marquee(settings.title)}</small>` : ''}
        ${mode !== 'image' ? `<strong data-screensaver-time>${escapeHtml(currentTime({ showSeconds: false }))}</strong>${settings.showDate !== false ? `<span data-screensaver-date>${escapeHtml(currentDate())}</span>` : ''}` : ''}
        ${(settings.showBattery !== false && Number.isFinite(level)) || settings.showConnection ? `<div class="screensaver-meta">${settings.showBattery !== false && Number.isFinite(level) ? `<span>${icon(runtimeBatteryCharging() ? 'bolt' : 'battery', 20)} ${Math.round(level)}%</span>` : ''}${settings.showConnection ? `<span>${icon('wifi', 20)} ${escapeHtml(translateDashboardValue(state.connectionMessage || (state.connected ? 'connected' : 'disconnected')))}</span>` : ''}</div>` : ''}
      </div>
      ${triggerPanel}
    </div>
    ${settings.showWakeHint === false || state.screensaverWidgetFullscreen ? '' : `<span class="screensaver-wake-hint">${settings.lockEnabled && settings.lockPinHash ? 'Tap to unlock' : 'Tap to wake'}</span>`}
  </section>`;
}


function beginScreensaver({ relockDashboards = true } = {}) {
  if (relockDashboards) relockAllDashboards();
  state.screensaverActive = true;
  state.screensaverExiting = false;
  state.screensaverUnlockPrompt = false;
  state.screensaverWidgetFullscreen = false;
}

function finishScreensaverExit() {
  clearTimeout(state.screensaverExitTimer);
  state.screensaverExitTimer = null;
  state.screensaverActive = false;
  state.screensaverExiting = false;
  state.screensaverUnlockPrompt = false;
  state.screensaverTrigger = null;
  state.screensaverWidgetFullscreen = false;
  clearTimeout(state.screensaverTriggerTimer);
  state.lastActivityAt = Date.now();
  render();
}

function deactivateScreensaver() {
  if (!state.screensaverActive || state.screensaverExiting) return;
  state.screensaverUnlockPrompt = false;
  state.screensaverExiting = true;
  render();
  clearTimeout(state.screensaverExitTimer);
  state.screensaverExitTimer = setTimeout(finishScreensaverExit, 300);
}

function requestScreensaverWake() {
  const settings = screensaverSettings();
  state.lastActivityAt = Date.now();
  if (settings.lockEnabled && settings.lockPinHash) {
    state.screensaverUnlockPrompt = true;
    state.screensaverExiting = false;
    render();
    requestAnimationFrame(() => app.querySelector('[data-screensaver-unlock-form] [name="pin"]')?.focus());
    return;
  }
  deactivateScreensaver();
}

function scheduleScreensaver() {
  clearTimeout(state.screensaverTimer);
  state.screensaverTimer = null;
  const settings = screensaverSettings();
  if (!settings.enabled || state.screensaverActive || state.editMode || state.drawerOpen || state.modal) return;
  const seconds = Math.max(15, Math.min(86400, Number(settings.timeoutSeconds) || 300));
  const remaining = Math.max(250, seconds * 1000 - (Date.now() - state.lastActivityAt));
  state.screensaverTimer = setTimeout(() => {
    if (!state.config || state.editMode || state.drawerOpen || state.modal || screensaverSettings().enabled === false) return scheduleScreensaver();
    beginScreensaver();
    if (!evaluateScreensaverTriggers()) render();
  }, remaining);
}

function registerUserActivity({ wake = true } = {}) {
  state.lastActivityAt = Date.now();
  touchDashboardUnlock();
  clearTimeout(state.screensaverTimer);
  if (state.screensaverActive && wake) {
    if (state.screensaverUnlockPrompt) return;
    requestScreensaverWake();
  } else {
    scheduleScreensaver();
  }
}


function editorFormModalOpen() {
  return Boolean(state.modal && ['widget-settings', 'statusbar-settings', 'navigation-settings', 'settings', 'background', 'prompt'].includes(state.modal.type));
}

function renderLockedDashboard(dashboard) {
  return `<section class="locked-dashboard-gate" aria-label="Locked dashboard">
    <div class="locked-dashboard-icon">${materialSymbol('lock', 46)}</div>
    <h2>${escapeHtml(dashboard?.name || 'Dashboard')}</h2>
    <p>This dashboard is locked.${dashboard?.pinHint ? ` Hint: ${escapeHtml(dashboard.pinHint)}` : ''}</p>
    <button type="button" class="pill-button primary" data-action="open-dashboard-unlock" data-dashboard-id="${escapeHtml(dashboard?.id || '')}">${materialSymbol('lock_open', 19)} Unlock dashboard</button>
  </section>`;
}


function pendingPlacementDisplay(columns = getColumns()) {
  const pending = state.pendingWidgetPlacement;
  if (!pending?.item) return null;
  const base = pending.item;
  return { w: Math.min(columns, Math.max(1, Number(base.w) || 1)), h: Math.max(1, Number(base.h) || 1) };
}

function placementCandidateFromPointer(grid, event) {
  const pending = pendingPlacementDisplay(Number.parseInt(getComputedStyle(grid).getPropertyValue('--grid-columns')) || getColumns());
  if (!pending) return null;
  const styles = getComputedStyle(grid);
  const columns = Number.parseInt(styles.getPropertyValue('--grid-columns')) || getColumns();
  const gap = Number.parseFloat(styles.columnGap) || 0;
  const rowGap = Number.parseFloat(styles.rowGap) || gap;
  const rowHeight = Number.parseFloat(styles.gridAutoRows) || 84;
  const rect = grid.getBoundingClientRect();
  const cellWidth = Math.max(1, (grid.clientWidth - gap * (columns - 1)) / columns);
  const rawX = Math.floor((event.clientX - rect.left) / Math.max(1, cellWidth + gap));
  const rawY = Math.floor((event.clientY - rect.top) / Math.max(1, rowHeight + rowGap));
  const x = Math.max(0, Math.min(columns - pending.w, rawX));
  const y = Math.max(0, rawY);
  const placed = displayLayout(currentDashboard()?.items || [], columns);
  const candidate = { id: '__pending__', x, y, w: pending.w, h: pending.h };
  return { ...candidate, columns, valid: slotIsFree(placed, candidate) };
}

function updatePlacementGhost(candidate) {
  state.placementHover = candidate;
  const ghost = app.querySelector('[data-widget-placement-ghost]');
  if (!ghost || !candidate) return;
  ghost.style.gridColumn = `${candidate.x + 1} / span ${candidate.w}`;
  ghost.style.gridRow = `${candidate.y + 1} / span ${candidate.h}`;
  ghost.classList.toggle('invalid', !candidate.valid);
  ghost.querySelector('small').textContent = translateDashboardText(candidate.valid ? `${candidate.w} × ${candidate.h} cells` : 'Space is occupied');
}

function renderWidgetPlacementGhost(columns) {
  if (!state.pendingWidgetPlacement?.item) return '';
  const size = pendingPlacementDisplay(columns);
  const hover = state.placementHover && state.placementHover.columns === columns ? state.placementHover : { x:0, y:0, ...size, valid:true };
  return `<article class="widget-placement-ghost ${hover.valid ? '' : 'invalid'}" data-widget-placement-ghost style="grid-column:${hover.x + 1} / span ${hover.w};grid-row:${hover.y + 1} / span ${hover.h}"><span>${materialSymbol('add_box',26)}</span><strong>${escapeHtml(state.pendingWidgetPlacement.label || 'New widget')}</strong><small>${hover.valid ? `${hover.w} × ${hover.h} cells` : 'Space is occupied'}</small></article>`;
}

function beginWidgetPlacement(item, label) {
  if (!item) return;
  state.pendingWidgetPlacement = { item, label: String(label || 'New widget') };
  state.placementHover = null;
  state.editMode = true;
  state.drawerOpen = false;
  state.modal = null;
  render({ preserveModal:false });
  toast('Choose a grid field to place the widget', '', { key:'widget-placement' });
}

function cancelWidgetPlacement() {
  dismissToast('widget-placement');
  state.pendingWidgetPlacement = null;
  state.placementHover = null;
  render();
}

function commitWidgetPlacement(candidate) {
  const pending = state.pendingWidgetPlacement;
  const dashboard = currentDashboard();
  if (!pending?.item || !dashboard || !candidate) return;
  if (!candidate.valid) return toast('That grid area is already occupied', 'error');
  Object.assign(pending.item, { x:candidate.x, y:candidate.y, w:candidate.w, h:candidate.h });
  dashboard.items.push(pending.item);
  const itemId = pending.item.id;
  const label = pending.label;
  state.pendingWidgetPlacement = null;
  state.placementHover = null;
  state.modal = { type:'widget-settings', itemId, isNew:true };
  persistConfig();
  render({ preserveModal:false });
  dismissToast('widget-placement');
  toast(`${label} placed`);
}

function render(options = {}) {
  if (!state.config) return;
  captureDashboardViewState();
  pruneDashboardViewStates();
  const preserveModal = options.preserveModal ?? editorFormModalOpen();
  if (!options.preserveFrozen) {
    cleanupCustomWidgetScripts();
    discardFrozenDashboardShells();
  }
  const dashboard = currentDashboard();
  const dashboardLocked = Boolean(dashboard?.pinHash && !dashboardIsUnlocked(dashboard));
  const columns = getColumns();
  state.lastColumns = columns;
  const layout = displayLayout(dashboard?.items || [], columns);
  const layoutMap = new Map(layout.map((item) => [item.id, item]));
  const navigation = navigationSettings();
  document.body.classList.toggle('kiosk', state.kioskMode);
  document.body.classList.toggle('editing', state.editMode);
  document.body.dataset.navigationMode = navigation.mode;
  const background = resolvedDashboardBackground(dashboard?.background || {});
  const statusSettings = state.config?.ui?.statusBar || {};
  const statusVisible = statusSettings.visible !== false || state.editMode;
  const dashboardLockTop = statusVisible ? Math.max(28, Math.min(96, Number(statusSettings.height) || 40)) + 12 : 12;
  const backgroundStyle = `--dashboard-bg:${escapeHtml(background.color || '#000000')};--dashboard-overlay:${Math.max(0, Math.min(100, Number(background.overlay ?? 35))) / 100};--dashboard-image:${background.image ? `url(&quot;${escapeHtml(background.image)}&quot;)` : 'none'};--dashboard-fit:${escapeHtml(background.fit || 'cover')};--dashboard-position:${escapeHtml(background.position || 'center center')};--dashboard-attachment:${background.fixed === false ? 'scroll' : 'fixed'};--dashboard-lock-top:${dashboardLockTop}px`;
  const gridStyle = cachedDashboardGridStyle(dashboard, columns);

  cleanupWidgetCarouselObservers();
  const dashboardMarkup = `
    <div class="remote-shell ${state.kioskMode ? 'kiosk-shell' : ''} ${state.kioskMode && state.config?.ui?.kiosk?.scaleToFit ? `kiosk-scale-enabled kiosk-scale-width-${escapeHtml(state.config?.ui?.kiosk?.widthMode || 'fill')}` : ''} navigation-${escapeHtml(navigation.mode)} background-preset-${escapeHtml(background.preset || 'custom')}" data-dashboard-id="${escapeHtml(dashboard?.id || '')}" style="${backgroundStyle};--dashboard-nav-card-width:${navigation.cardWidth}px">
      <div class="kiosk-scale-stage" data-kiosk-scale-stage><div class="kiosk-scale-canvas" data-kiosk-scale-canvas>
      ${renderStatusBar(dashboard)}
      ${navigation.mode === 'top_tabs' ? renderDashboardNavigation(dashboard, 'top_tabs') : ''}
      <main class="remote-viewport">
        ${renderDashboardHero(dashboard)}
      ${renderEditBreadcrumbs()}
        ${state.editMode && !state.kioskMode && !dashboardLocked ? renderEditorBar() : ''}
        <section class="remote-page-content">
          ${dashboardLocked ? renderLockedDashboard(dashboard) : !dashboard || (dashboard.items.length === 0 && !state.pendingWidgetPlacement) ? renderEmptyDashboard() : `
            ${state.pendingWidgetPlacement ? `<div class="widget-placement-banner">${materialSymbol('grid_on',19)}<span>Choose a grid field for <strong>${escapeHtml(state.pendingWidgetPlacement.label)}</strong></span><button type="button" data-action="cancel-widget-placement">Cancel</button></div>` : ''}
            <div class="remote-entity-grid ${state.editMode ? 'editing' : ''} ${state.pendingWidgetPlacement ? 'placing-widget' : ''}" style="${gridStyle}" data-grid>
              ${dashboard.items.map((item) => renderWidget(item, layoutMap.get(item.id), columns)).join('')}
              ${renderWidgetPlacementGhost(columns)}
            </div>
          `}
        </section>
      </main></div></div>
      ${navigation.mode === 'right_cards' ? renderDashboardNavigation(dashboard, 'right_cards') : ''}
      ${navigation.mode === 'bottom_dock' ? renderDashboardNavigation(dashboard, 'bottom_dock') : ''}
      ${dashboard?.pinHash && !dashboardLocked ? `<button type="button" class="dashboard-relock-trigger" data-action="relock-current-dashboard" title="Lock dashboard" aria-label="Lock dashboard">${materialSymbol('lock', 22)}</button>` : ''}
      ${state.kioskMode ? '' : `<button class="remote-menu-trigger ${state.editMode ? 'editing' : ''}" data-action="open-page-menu" aria-label="Dashboard menu">${icon(state.editMode ? 'settings' : 'more', 26)}</button>`}
      ${renderScreensaver()}
    </div>`;
  setLocalizedDashboardHtml(app, dashboardMarkup);
  clearTimeout(window.__ucDashboardBootTimer);
  document.documentElement.classList.add('app-ready');

  syncDrawer();
  if (!preserveModal) renderModalRoot();
  requestAnimationFrame(() => {
    syncDashboardGridGeometry(app);
    applyWidgetElementLayouts(app);
    updateMarquees();
    updateLiveWidgets();
    runCustomWidgetScripts();
    ensureVisibleMediaBrowsers();
    initializeMediaSwipers();
    initializeWidgetCarousels();
    applyKioskScale();
    restoreDashboardViewState(dashboard?.id);
    scheduleScreensaver();
  });
}

function renderEditorBar() {
  return `<div class="remote-edit-strip ${state.editorDirty ? 'has-unsaved-changes' : ''}" aria-label="Dashboard editor">
    <div class="edit-strip-actions"><button class="remote-text-action" data-action="undo-dashboard" ${state.undoStack.length ? '' : 'disabled'} title="Undo">${materialSymbol('undo',20)}<span>Undo</span></button><button class="remote-text-action" data-action="redo-dashboard" ${state.redoStack.length ? '' : 'disabled'} title="Redo">${materialSymbol('redo',20)}<span>Redo</span></button><button class="remote-text-action" data-action="customize-background" title="Dashboard background">${icon('image',20)}<span>Background</span></button><button class="remote-text-action" data-action="open-navigation-editor" title="Navigation">${materialSymbol('navigation',20)}<span>Navigation</span></button><button class="remote-text-action" data-action="open-statusbar-editor" title="Status Bar">${icon('tune',20)}<span>Status Bar</span></button><button class="remote-text-action" data-action="open-drawer" title="Add widget">${icon('plus',20)}<span>Add</span></button>${dashboardClipboardCount() ? `<button class="remote-text-action" data-action="paste-dashboard-clipboard-last" title="Paste copied widget or entity">${materialSymbol('content_paste',20)}<span>Paste</span></button>` : ''}<button class="remote-text-action primary save-dashboard-action" data-action="save-dashboard" ${state.editorSaving ? 'disabled' : ''} title="Save dashboard">${icon(state.editorSaving ? 'refresh' : 'check',20)}<span>${state.editorSaving ? 'Saving…' : 'Save'}</span></button></div>
  </div>`;
}

function renderEmptyDashboard() {
  return `<section class="remote-empty">
    <span class="empty-icon">${icon('grid', 54)}</span>
    <h2>No widgets</h2>
    <p>${state.kioskMode ? 'Open the regular dashboard to add widgets.' : 'Add entity controls, weather, clocks, status widgets, and more.'}</p>
    ${state.kioskMode ? '' : '<button class="remote-primary-action" data-action="open-drawer">Add widget</button>'}
  </section>`;
}

function widgetTextMode(item) {
  return ['scroll', 'wrap', 'truncate'].includes(item.settings?.textOverflow) ? item.settings.textOverflow : 'scroll';
}

function scopeWidgetCss(css, selector) {
  const source = String(css || '').trim();
  if (!source) return '';
  if (source.includes(':host')) return source.replaceAll(':host', selector);
  if (!source.includes('{')) return `${selector} { ${source} }`;
  return source.replace(/(^|})\s*([^@}{][^{}]*)\{/g, (match, boundary, selectors) => {
    const scopedSelectors = selectors.split(',').map((entry) => {
      const value = entry.trim();
      if (!value || value.startsWith(selector)) return value;
      return `${selector} ${value}`;
    }).join(', ');
    return `${boundary} ${scopedSelectors} {`;
  });
}

function widgetCustomStyle(item) {
  const css = String(item.settings?.customCss || '').trim();
  if (!css) return '';
  const selector = `[data-item-id="${String(item.id).replaceAll('"', '\\"')}"]`;
  const globalScope = item.settings?.customCodeScope === 'dashboard';
  const output = globalScope ? css : scopeWidgetCss(css, selector);
  return `<style data-custom-widget-style data-custom-code-scope="${globalScope ? 'dashboard' : 'widget'}">${output.replaceAll('</style', '<\/style')}</style>`;
}

function composeWidgetContent(item, nativeContent) {
  const html = String(item.settings?.customHtml || '');
  if (!html) return nativeContent;
  const custom = `<div class="widget-custom-html">${html}</div>`;
  switch (item.settings?.customHtmlMode) {
    case 'replace': return custom;
    case 'prepend': return `${custom}<div class="widget-native-content">${nativeContent}</div>`;
    default: return `<div class="widget-native-content">${nativeContent}</div>${custom}`;
  }
}

function cleanupCustomWidgetScripts() {
  for (const cleanup of state.customScriptCleanups.values()) {
    try { cleanup?.(); } catch (error) { console.warn('Custom widget cleanup failed', error); }
  }
  state.customScriptCleanups.clear();
}

function runCustomWidgetScripts() {
  app.querySelectorAll('[data-widget][data-item-id], [data-nested-widget][data-item-id], [data-screensaver-widget][data-item-id]').forEach((widget, index) => {
    const itemId = widget.dataset.itemId;
    const { item } = findDashboardItem(itemId);
    const code = String(item?.settings?.customJs || '').trim();
    if (!item || !code || widget.dataset.customJsRunning === 'true') return;
    widget.dataset.customJsRunning = 'true';
    const entity = item.kind === 'entity' ? entityForItem(item) : null;
    const globalScope = item.settings?.customCodeScope === 'dashboard';
    const root = globalScope ? document : widget;
    const api = Object.freeze({
      executeCommand, toast, render, fetch: window.fetch.bind(window), root,
      getEntity: (id) => state.entities.get(id),
      entities: state.entities,
      config: state.config,
      dashboard: currentDashboard()
    });
    try {
      const cleanup = new Function('widget', 'entity', 'state', 'api', 'root', `"use strict";\n${code}`)(widget, entity, state, api, root);
      if (typeof cleanup === 'function') {
        const context = widget.hasAttribute('data-screensaver-widget') ? 'screensaver' : widget.hasAttribute('data-nested-widget') ? 'nested' : 'dashboard';
        state.customScriptCleanups.set(`${itemId}:${context}:${index}`, cleanup);
      }
    } catch (error) {
      console.error(`Custom JavaScript failed for ${itemId}`, error);
      const errorNode = document.createElement('pre');
      errorNode.className = 'custom-code-error';
      errorNode.textContent = error?.message || String(error);
      widget.append(errorNode);
    }
  });
}


const CONTENT_ALIGNMENT_WIDGET_TYPES = new Set(['clock','weather','connection','power','text','gauge','counter_statistics','timer_countdown','alert_center','entity_template']);

function supportsWidgetContentAlignment(type) {
  return CONTENT_ALIGNMENT_WIDGET_TYPES.has(String(type || ''));
}

function widgetContentAlignmentField(settings = {}) {
  const selected = ['default','left','center','right'].includes(String(settings.contentAlignment)) ? String(settings.contentAlignment) : 'default';
  return `<section class="settings-section widget-content-alignment-settings"><h3>Content alignment</h3><div class="field"><label>Align widget content</label><select class="settings-input" name="contentAlignment">${[['default','Widget default'],['left','Left'],['center','Center'],['right','Right']].map(([value,label])=>`<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('')}</select><small>Centers or aligns the complete native widget layout without requiring manual element offsets.</small></div></section>`;
}

const WIDGET_LAYOUT_ELEMENTS = {
  default: [
    ['title','Title',':is(.entity-copy h3,.system-widget-heading h3,.system-widget-heading strong,.camera-heading h3,.system-text h3,.activity-copy h3,.media-copy strong:first-child,.gauge-copy small,.system-status small)'],
    ['subtitle','Subtitle / state',':is(.entity-copy p,.system-widget-heading small,.system-text p,.activity-copy p,.media-copy span,.gauge-copy span,.system-status span)'],
    ['icon','Icon / artwork',':is(.entity-icon,.entity-leading,.media-visual,.media-artwork,.activity-artwork,.camera-frame,.gauge-ring,.system-status-icon,.weather-icon)'],
    ['value','Primary value',':is(.remote-value,.sensor-value,.gauge-value,.counter-stat-value,.timer-plain-value,.system-status strong,.weather-copy strong,.clock-time)'],
    ['controls','Controls',':is(.entity-control-zone,.media-controls,.activity-controls,.light-controls,.climate-controls,.cover-controls,.select-control,.button-control,.activity-primary-toggle,.remote-button-group,.remote-slider,.stepper)']
  ],
  activity: [
    ['image','Background image',':is(.activity-entity-overlay,.activity-icon)'],
    ['title','Activity name','.activity-copy h3'],
    ['state','State / description','.activity-copy p'],
    ['content','Activity content','.activity-entity-content'],
    ['related','Related entities',':is(.activity-related-entities,.activity-entity-actions)'],
    ['controls','Start / stop controls',':is(.activity-launch-button,.activity-controls)',{ positionOnly:true }]
  ],
  // Selectors must match renderMediaPlayer(): the copy block is
  // small.media-entity-name / h3 / p, and the volume slider lives inside .media-controls.
  // (The previous selectors matched every marquee <span> as "Artist / source", never
  // matched the media title or the volume slider, and transformed the artwork twice.)
  media_player: [
    ['artwork','Artwork',':is(.media-visual,.media-artwork)'],
    ['name','Entity name','.media-copy .media-entity-name'],
    ['title','Media title','.media-copy h3'],
    ['subtitle','Artist / state','.media-copy p'],
    ['progress','Progress','.media-progress'],
    ['playback','Playback controls','.media-buttons',{ positionOnly:true }],
    ['volume','Volume',':is(.media-widget > .remote-slider,.media-controls > .remote-slider)']
  ],
  sensor: [['lead','Icon and labels','.entity-lead'],['value','Value','.remote-value']],
  select: [['lead','Icon and labels','.entity-lead'],['control','Selection control','.remote-select']],
  button: [['lead','Icon and labels','.entity-lead'],['control','Press button','.widget-layout-control-shell.button-control-shell',{ positionOnly:true }]],
  light: [['lead','Icon and labels','.entity-lead'],['power','Power button','.widget-layout-control-shell.light-power-shell',{ positionOnly:true }],['brightness','Brightness','.remote-slider:not(.compact)'],['color','Color control','.light-color-control'],['temperature','Color temperature','.remote-slider.compact']],
  climate: [['lead','Icon and labels','.entity-lead'],['target','Target temperature','.climate-target'],['stepper','Temperature stepper','.stepper',{ positionOnly:true }],['modes','Mode controls','.remote-segmented']],
  cover: [['lead','Icon and labels','.entity-lead'],['buttons','Open / stop / close','.remote-button-group',{ positionOnly:true }],['position','Position slider','.remote-slider']],
  activity_launcher: [['heading','Heading','.system-widget-heading'],['activities','Activity grid','.activity-launch-grid'],['activeMedia','Active media panel','.activity-running-media'],['artwork','Media artwork','.activity-media-artwork'],['mediaControls','Media controls','.activity-media-buttons'],['volume','Media volume','.activity-media-volume'],['toggle','Start / stop button','.activity-primary-toggle']],
  camera: [['camera','Camera feed','.camera-frame'],['title','Camera title','.camera-heading']],
  conditional: [['content','Conditional content',':is(.conditional-grid,.conditional-message)']],
  divider_horizontal: [['divider','Divider line','.divider-widget span']],
  divider_vertical: [['divider','Divider line','.divider-widget span']],
  text: [['title','Heading','.system-text h3'],['titleDivider','Heading divider','.system-text h3 + .text-widget-divider'],['body','Body','.system-text p'],['bodyDivider','Body divider','.system-text p + .text-widget-divider']],
  connection: [['icon','Connection icon','.system-status-icon'],['title','Title','.system-status small'],['value','Connection state','.system-status strong'],['details','Message and entity count',':is(.system-status > div > span,.system-status > div > b)']],
  power: [['icon','Power icon','.system-status-icon'],['title','Title','.system-status small'],['value','Battery / power state','.system-status strong'],['details','Power details','.system-status > div > span']],
  clock: [['title','Optional title','.clock-title'],['value','Time','.clock-time'],['subtitle','Date','.clock-date']],
  weather: [['current','Current conditions','.weather-current'],['title','Title','.weather-copy small'],['value','Temperature','.weather-copy strong'],['condition','Condition','.weather-copy > span'],['icon','Weather icon','.weather-icon'],['metadata','Weather details','.weather-meta'],['forecast','Forecast','.weather-forecast']],
  icon_button: [['icon','Button icon','.command-button-icon']],
  text_button: [['title','Button label','.command-button-copy > strong'],['subtitle','Subtitle','.command-button-copy > small']],
  icon_text_button: [['icon','Button icon','.command-button-icon'],['title','Button label','.command-button-copy > strong'],['subtitle','Subtitle','.command-button-copy > small']],
  media_browser: [['heading','Heading','.system-widget-heading'],['toolbar','Browser toolbar','.media-browser-toolbar'],['location','Location and breadcrumbs','.media-browser-location'],['search','Search','.media-browser-search'],['browser','Browser content','.media-browser-content'],['items','Media cards',':is(.media-browser-grid,.media-browser-list,.media-browser-swiper-shell)'],['pagination','Pagination','.media-browser-pagination']],
  tab_container: [['heading','Heading','.system-widget-heading'],['tabs','Tabs','.tab-container-tabs'],['content','Tab content','.tab-container-panel']],
  carousel: [['heading','Heading','.system-widget-heading'],['slides','Slides','.carousel-stage'],['counter','Slide counter','[data-carousel-counter]']],
  entity_group: [['heading','Heading','.system-widget-heading'],['group','Group grid','.entity-group-grid']],
  gauge: [['gauge','Gauge ring','.gauge-widget > svg'],['title','Title','.gauge-copy small'],['value','Value','.gauge-copy strong'],['range','Range','.gauge-range']],
  scene_routine: [['heading','Heading','.system-widget-heading'],['actions','Routine actions','.routine-grid']],
  entity_table: [['heading','Heading','.system-widget-heading'],['table','Entity rows','.entity-table-list']],
  counter_statistics: [['heading','Heading','.system-widget-heading'],['value','Statistic','.counter-stat-value'],['breakdown','Breakdown','.counter-stat-breakdown']],
  timer_countdown: [['heading','Heading','.system-widget-heading'],['value','Timer value','.timer-plain-value'],['progress','Progress','.timer-progress',{ positionOnly:true }],['controls','Timer controls','.timer-controls',{ positionOnly:true }],['presets','Presets','.timer-presets',{ positionOnly:true }]],
  room_summary: [['heading','Heading','.system-widget-heading'],['metrics','Room metrics','.room-summary-grid']],
  history_graph: [['heading','Heading','.system-widget-heading'],['graph','Graph','.history-graph-stage'],['legend','Legend','.history-legend'],['statistics','Statistics','.history-stats']],
  alert_center: [['heading','Heading','.alert-center-heading'],['alerts','Alert list','.alert-center-list']],
  entity_template: [['content','Template content','.entity-template-elements']],
  custom_code: [['content','Custom content',':scope > :not(style)']],
  spacer: [['space','Spacer','.system-spacer']]
};


const EXCLUSIVE_WIDGET_LAYOUT_TYPES = new Set(Object.keys(WIDGET_LAYOUT_ELEMENTS).filter((key) => key !== 'default'));

function widgetLayoutElements(item) {
  const type = item.kind === 'system' ? item.widgetType : item.entityType || entityForItem(item)?.entity_type || 'default';
  const source = WIDGET_LAYOUT_ELEMENTS[type] || WIDGET_LAYOUT_ELEMENTS.default;
  const merged = [...source];
  if (source !== WIDGET_LAYOUT_ELEMENTS.default && !EXCLUSIVE_WIDGET_LAYOUT_TYPES.has(type)) {
    for (const entry of WIDGET_LAYOUT_ELEMENTS.default) if (!merged.some((candidate) => candidate[0] === entry[0])) merged.push(entry);
  }
  return merged;
}

function widgetElementLayoutStyle(item) {
  const itemType = item.kind === 'system' ? item.widgetType : item.entityType || entityForItem(item)?.entity_type;
  if (ENTITY_GRID_LAYOUT_TYPES.has(itemType)) return '';
  const layout = item.settings?.elementLayout || {};
  const definitions = [];
  for (const [key,, target, options = {}] of widgetLayoutElements(item)) {
    const value = layout[key];
    if (!value?.enabled && !value?.hidden) continue;
    definitions.push({
      key,
      target,
      positionOnly: Boolean(options.positionOnly),
      hidden: Boolean(value.hidden),
      scale: Math.max(25, Math.min(200, Number(value.scale) || 100)),
      x: Math.max(-100, Math.min(100, Number(value.x) || 0)),
      y: Math.max(-100, Math.min(100, Number(value.y) || 0)),
      width: Math.max(5, Math.min(100, Number(value.width) || 100)),
      height: Math.max(5, Math.min(100, Number(value.height) || 25))
    });
  }
  return definitions.length ? `<style data-widget-element-layout data-layout="${escapeHtml(JSON.stringify(definitions))}"></style>` : '';
}

const widgetElementLayoutBases = new WeakMap();
const WIDGET_ELEMENT_LAYOUT_INLINE_PROPERTIES = [
  'position','left','right','top','bottom','inset','width','height','min-width','min-height','max-width','max-height',
  'margin','margin-left','margin-right','margin-top','margin-bottom','overflow','z-index','box-sizing','transform','transform-origin',
  'align-self','justify-self','display','visibility','opacity','pointer-events'
];

function widgetElementLayoutSelectors(target) {
  const selector = String(target || '').trim();
  if (selector.startsWith(':is(') && selector.endsWith(')')) return selector.slice(4, -1).split(',').map((entry) => entry.trim()).filter(Boolean);
  return selector ? [selector] : [];
}

function captureWidgetElementLayoutBase(node) {
  let base = widgetElementLayoutBases.get(node);
  if (base) return base;
  const inline = {};
  for (const property of WIDGET_ELEMENT_LAYOUT_INLINE_PROPERTIES) inline[property] = [node.style.getPropertyValue(property), node.style.getPropertyPriority(property)];
  base = { inline };
  widgetElementLayoutBases.set(node, base);
  return base;
}

function restoreWidgetElementLayoutBase(node, base) {
  for (const property of WIDGET_ELEMENT_LAYOUT_INLINE_PROPERTIES) {
    const [value, priority] = base.inline[property] || ['', ''];
    if (value) node.style.setProperty(property, value, priority);
    else node.style.removeProperty(property);
  }
  node.classList.remove('widget-layout-position-only','widget-layout-absolute');
}

function applyWidgetElementLayouts(root = app) {
  root.querySelectorAll('style[data-widget-element-layout]').forEach((marker) => {
    const widget = marker.closest('[data-item-id]');
    if (!widget) return;
    let definitions = [];
    try { definitions = JSON.parse(marker.dataset.layout || '[]'); } catch { return; }

    const records = [];
    for (const definition of definitions) {
      for (const selector of widgetElementLayoutSelectors(definition.target)) {
        let matches = [];
        try { matches = widget.querySelectorAll(selector); } catch { continue; }
        for (const node of matches) {
          if (node.closest('[data-item-id]') !== widget) continue;
          const base = captureWidgetElementLayoutBase(node);
          restoreWidgetElementLayoutBase(node, base);
          records.push({ node, definition, base });
        }
      }
    }

    widget.classList.toggle('widget-custom-layout-active', records.length > 0);
    if (!records.length) return;

    // Measure every native element before removing any of them from normal flow. This
    // keeps the editor preview and the live dashboard anchored to the same baseline.
    const widgetRect = widget.getBoundingClientRect();
    const widgetWidth = Math.max(1, widget.clientWidth || widgetRect.width);
    const widgetHeight = Math.max(1, widget.clientHeight || widgetRect.height);
    for (const record of records) {
      const rect = record.node.getBoundingClientRect();
      const offsetParent = record.node.offsetParent && widget.contains(record.node.offsetParent) ? record.node.offsetParent : widget;
      const anchorRect = offsetParent.getBoundingClientRect();
      record.native = {
        left: rect.left - anchorRect.left,
        top: rect.top - anchorRect.top,
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height)
      };
    }

    for (const { node, definition, native } of records) {
      const offsetX = widgetWidth * Math.max(-100, Math.min(100, Number(definition.x) || 0)) / 100;
      const offsetY = widgetHeight * Math.max(-100, Math.min(100, Number(definition.y) || 0)) / 100;
      const positionOnly = Boolean(definition.positionOnly) || node.matches('button,.remote-power,.remote-circle-command');
      if (definition.hidden) {
        node.style.setProperty('display', 'none', 'important');
        node.style.setProperty('pointer-events', 'none', 'important');
        continue;
      }
      node.style.setProperty('box-sizing', 'border-box');
      node.style.setProperty('z-index', '4');

      if (positionOnly) {
        // Position-only controls keep their native dimensions and border radius. A
        // relative offset moves the control without stretching circles into ellipses.
        node.classList.add('widget-layout-position-only');
        node.style.setProperty('position', 'relative', 'important');
        node.style.setProperty('left', `${offsetX}px`, 'important');
        node.style.setProperty('top', `${offsetY}px`, 'important');
        const scale = Math.max(.25, Math.min(2, Number(definition.scale) / 100 || 1));
        const scaledWidth = native.width * scale;
        const scaledHeight = native.height * scale;
        node.style.setProperty('width', `${scaledWidth}px`, 'important');
        node.style.setProperty('height', `${scaledHeight}px`, 'important');
        node.style.setProperty('min-width', `${scaledWidth}px`, 'important');
        node.style.setProperty('min-height', `${scaledHeight}px`, 'important');
        node.style.setProperty('max-width', `${scaledWidth}px`, 'important');
        node.style.setProperty('max-height', `${scaledHeight}px`, 'important');
        node.style.setProperty('overflow', 'visible');
        continue;
      }

      // Custom geometry is converted to pixels against the widget itself. Percent
      // sizes no longer depend on an element's internal parent grid, eliminating the
      // preview/live mismatch seen in light and climate controls.
      const width = widgetWidth * Math.max(5, Math.min(100, Number(definition.width) || 100)) / 100;
      const height = widgetHeight * Math.max(5, Math.min(100, Number(definition.height) || 25)) / 100;
      node.classList.add('widget-layout-absolute');
      node.style.setProperty('position', 'absolute', 'important');
      node.style.setProperty('left', `${native.left + offsetX}px`, 'important');
      node.style.setProperty('top', `${native.top + offsetY}px`, 'important');
      node.style.setProperty('right', 'auto', 'important');
      node.style.setProperty('bottom', 'auto', 'important');
      node.style.setProperty('width', `${Math.max(1, width)}px`, 'important');
      node.style.setProperty('height', `${Math.max(1, height)}px`, 'important');
      node.style.setProperty('min-width', '0', 'important');
      node.style.setProperty('min-height', '0', 'important');
      node.style.setProperty('max-width', 'none', 'important');
      node.style.setProperty('max-height', 'none', 'important');
      node.style.setProperty('margin', '0', 'important');
    }
  });
}

function renderWidgetLayoutSettings(item) {
  const itemType = item.kind === 'system' ? item.widgetType : item.entityType || entityForItem(item)?.entity_type;
  if (ENTITY_GRID_LAYOUT_TYPES.has(itemType)) return renderEntityGridLayoutSettings(item, itemType);
  const layout = item.settings?.elementLayout || {};
  const elements = widgetLayoutElements(item);
  const selectedKey = elements[0]?.[0] || '';
  const selector = `<div class="layout-element-selector" role="listbox" aria-label="Widget elements">${elements.map(([key,label,,options = {}],index) => { const customized = Boolean(layout[key]?.enabled || layout[key]?.hidden); return `<button type="button" class="${index === 0 ? 'active' : ''} ${customized ? 'customized' : ''}" data-action="select-layout-element" data-layout-element="${escapeHtml(key)}" aria-selected="${index === 0}"><span>${materialSymbol(customized ? 'tune' : 'select_all',18)}</span><b>${escapeHtml(label)}</b><small>${customized ? (options.positionOnly ? 'Custom position' : 'Custom layout') : 'Native layout'}</small></button>`; }).join('')}</div>`;
  const cards = elements.map(([key,label,,options = {}],index) => {
    const value = layout[key] || {};
    const enabled = Boolean(value.enabled);
    const x = Math.max(-100, Math.min(100, Number(value.x) || 0));
    const y = Math.max(-100, Math.min(100, Number(value.y) || 0));
    const positionOnly = Boolean(options.positionOnly);
    return `<article data-element-layout-card data-layout-element-card="${escapeHtml(key)}" ${index ? 'hidden' : ''}><div class="element-layout-card-head"><div><small>SELECTED ELEMENT</small><strong>${escapeHtml(label)}</strong></div><button type="button" class="pill-button" data-action="reset-layout-element" data-layout-element="${escapeHtml(key)}">${materialSymbol('restart_alt',17)} Reset</button></div><label class="checkbox-row"><input type="checkbox" name="layoutHidden:${escapeHtml(key)}" ${value.hidden ? 'checked' : ''}> Hide this element</label><label class="checkbox-row"><input type="checkbox" name="layoutEnabled:${escapeHtml(key)}" ${enabled ? 'checked' : ''}> Enable custom ${positionOnly ? 'position and proportional size' : 'position and size'}</label><div class="element-layout-controls ${positionOnly ? 'position-only' : ''}"><label><span>X offset <output data-layout-range-output>${x}%</output></span><input type="range" min="-100" max="100" step="1" name="layoutX:${escapeHtml(key)}" value="${escapeHtml(x)}"></label><label><span>Y offset <output data-layout-range-output>${y}%</output></span><input type="range" min="-100" max="100" step="1" name="layoutY:${escapeHtml(key)}" value="${escapeHtml(y)}"></label>${positionOnly ? `<label><span>Size <output data-layout-range-output>${escapeHtml(value.scale ?? 100)}%</output></span><input type="range" min="25" max="200" name="layoutScale:${escapeHtml(key)}" value="${escapeHtml(value.scale ?? 100)}"></label><input type="hidden" name="layoutWidth:${escapeHtml(key)}" value="100"><input type="hidden" name="layoutHeight:${escapeHtml(key)}" value="25">` : `<input type="hidden" name="layoutScale:${escapeHtml(key)}" value="100"><label><span>Width <output data-layout-range-output>${escapeHtml(value.width ?? 100)}%</output></span><input type="range" min="5" max="100" name="layoutWidth:${escapeHtml(key)}" value="${escapeHtml(value.width ?? 100)}"></label><label><span>Height <output data-layout-range-output>${escapeHtml(value.height ?? 25)}%</output></span><input type="range" min="5" max="100" name="layoutHeight:${escapeHtml(key)}" value="${escapeHtml(value.height ?? 25)}"></label>`}</div></article>`;
  }).join('');
  return `<section class="settings-section widget-element-layout-editor" data-layout-editor data-initial-layout-element="${escapeHtml(selectedKey)}"><div class="settings-section-heading"><div><h3>Interactive element layout</h3><p class="muted">Choose an element here or tap it in the preview. The preview uses the widget's current dashboard dimensions and the same renderer as the live dashboard.</p></div></div>${selector}<div class="layout-selection-status" data-layout-selection-status></div><div class="element-layout-list">${cards}</div></section>`;
}

function selectLayoutEditorElement(form, requested, { scroll = false } = {}) {
  if (!form) return;
  const valid = widgetLayoutElements(findDashboardItem(form.dataset.itemId).item || {}).map(([key]) => key);
  const key = valid.includes(requested) ? requested : valid[0] || '';
  form.dataset.layoutSelectedElement = key;
  form.querySelectorAll('[data-action="select-layout-element"]').forEach((button) => {
    const active = button.dataset.layoutElement === key;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  form.querySelectorAll('[data-layout-element-card]').forEach((card) => { card.hidden = card.dataset.layoutElementCard !== key; });
  annotateWidgetLayoutPreview(form);
  if (scroll) form.querySelector(`[data-layout-element-card="${CSS.escape(key)}"]`)?.scrollIntoView?.({ block:'nearest', behavior:'smooth' });
}

function annotateWidgetLayoutPreview(form) {
  if (!form?.matches('[data-widget-settings-form]')) return;
  const previewRoot = form.querySelector('[data-widget-preview]');
  const { item } = findDashboardItem(form.dataset.itemId);
  const widget = previewRoot?.querySelector('[data-item-id]');
  if (!item || !widget) return;
  widget.querySelectorAll('[data-layout-element-key]').forEach((node) => { node.removeAttribute('data-layout-element-key'); node.classList.remove('layout-element-selectable','layout-element-selected'); });
  const selectedKey = form.dataset.layoutSelectedElement || widgetLayoutElements(item)[0]?.[0] || '';
  let selectedMatches = 0;
  for (const [key,,target] of widgetLayoutElements(item)) {
    for (const selector of widgetElementLayoutSelectors(target)) {
      let matches = [];
      try { matches = widget.querySelectorAll(selector); } catch { continue; }
      for (const node of matches) {
        if (node.closest('[data-item-id]') !== widget) continue;
        node.dataset.layoutElementKey = key;
        node.classList.add('layout-element-selectable');
        if (key === selectedKey) { node.classList.add('layout-element-selected'); selectedMatches += 1; }
      }
    }
  }
  const status = form.querySelector('[data-layout-selection-status]');
  const label = widgetLayoutElements(item).find(([key]) => key === selectedKey)?.[1] || 'Element';
  if (status) status.innerHTML = selectedMatches ? `${materialSymbol('ads_click',17)} <span><strong>${escapeHtml(label)}</strong> is highlighted in the preview. Tap another preview element to select it.</span>` : `${materialSymbol('visibility_off',17)} <span><strong>${escapeHtml(label)}</strong> is not currently rendered by this widget configuration.</span>`;
}

function resetLayoutEditorElement(form, key) {
  if (!form || !key) return;
  const set = (name, value, checked = null) => { const input = form.querySelector(`[name="${CSS.escape(name)}"]`); if (!input) return; if (checked !== null) input.checked = checked; else input.value = String(value); input.dispatchEvent(new Event('input',{bubbles:true})); };
  set(`layoutEnabled:${key}`,'',false); set(`layoutHidden:${key}`,'',false); set(`layoutX:${key}`,0); set(`layoutY:${key}`,0); set(`layoutScale:${key}`,100); set(`layoutWidth:${key}`,100); set(`layoutHeight:${key}`,25);
  form.querySelector(`[data-action="select-layout-element"][data-layout-element="${CSS.escape(key)}"]`)?.classList.remove('customized');
  scheduleWidgetEditorPreview(form);
}


function elementLayoutFromForm(data, item) {
  const result = {};
  for (const [key] of widgetLayoutElements(item)) {
    result[key] = {
      enabled: data.get(`layoutEnabled:${key}`) === 'on',
      hidden: data.get(`layoutHidden:${key}`) === 'on',
      scale: Math.max(25, Math.min(200, Number(data.get(`layoutScale:${key}`)) || 100)),
      x: Math.max(-100, Math.min(100, Number(data.get(`layoutX:${key}`)) || 0)),
      y: Math.max(-100, Math.min(100, Number(data.get(`layoutY:${key}`)) || 0)),
      width: Math.max(5, Math.min(100, Number(data.get(`layoutWidth:${key}`)) || 100)),
      height: Math.max(5, Math.min(100, Number(data.get(`layoutHeight:${key}`)) || 25))
    };
  }
  return result;
}

function renderWidget(item, layout, columns) {
  const isSystem = item.kind === 'system';
  const entity = isSystem ? null : entityForItem(item);
  const unavailable = entity ? isUnavailable(entity) : false;
  const visible = widgetConditionsMatch(item);
  const unavailableMode = widgetUnavailableMode(item);
  if ((!visible || unavailableMode === 'hide') && !state.editMode) { const fallback=normalizeFallback(item.settings?.fallback); if(fallback.mode==='hide'||fallback.mode==='none')return ''; }
  const type = isSystem ? item.widgetType : entity.entity_type;
  const accessDenied = !isSystem && !entityAccessAllowed(entity?.entity_id);
  const responsive=normalizeResponsiveSettings(item.settings?.responsive);
  const baseW=responsive.desktop.enabled&&responsive.desktop.w!==''?responsive.desktop.w:layout.w; const baseH=responsive.desktop.enabled&&responsive.desktop.h!==''?responsive.desktop.h:layout.h;
  const style = `grid-column:${layout.x + 1} / span ${baseW};grid-row:${layout.y + 1} / span ${baseH};${responsiveStyle(item)}`;
  const tools = state.editMode ? `<div class="widget-tools">${isSystem && CONTAINER_WIDGET_TYPES.has(type) ? `<button class="widget-tool" data-action="edit-container-contents" data-item-id="${escapeHtml(item.id)}" title="Edit contents">${materialSymbol('account_tree',17)}</button><button class="widget-tool" data-action="toggle-container-collapse" data-item-id="${escapeHtml(item.id)}" title="Collapse or expand">${materialSymbol(state.collapsedContainers.has(item.id) ? 'unfold_more' : 'unfold_less',17)}</button>` : ''}
      <button class="widget-tool" data-action="configure-widget" data-item-id="${escapeHtml(item.id)}" title="Customize">${icon('tune', 17)}</button>
      <button class="widget-tool" data-action="copy-dashboard-widget" data-item-id="${escapeHtml(item.id)}" title="Copy widget">${materialSymbol('content_copy', 17)}</button>
      <button class="widget-tool danger" data-action="remove-widget" data-item-id="${escapeHtml(item.id)}" title="Remove">${icon('trash', 17)}</button>
    </div><div class="resize-handle" data-resize-handle></div>` : '';
  const nativeContent = isSystem ? renderSystemWidget(item, { nestedDepth: 0 }) : renderEntityWidget(entity, item);
  const content = composeWidgetContent(item, nativeContent);
  const transparentContainer = isSystem && ['carousel', 'entity_group'].includes(type) && item.settings?.containerStyle === false;
  const containerRoot = isSystem && CONTAINER_WIDGET_TYPES.has(type);
  const editorLabel = isSystem ? SYSTEM_WIDGETS[type]?.label || type : localName(entity?.name, entity?.entity_id || 'Entity');
  const runtimeStyle = widgetRuntimeStyle(item);
  const interactionClass = widgetHasActions(item) ? 'widget-interactive' : '';
  const visibilityClass = visible ? '' : `widget-condition-hidden transition-${escapeHtml(item.settings?.visibilityTransition || 'fade')}`;
  const unavailableClass = unavailableMode ? `widget-unavailable-${escapeHtml(unavailableMode)}` : '';
  const activeTarget = state.editContainerId ? findDashboardItem(state.editContainerId).item : null;
  const activeContainerClass = !state.editContainerId ? ''
    : item.id === state.editContainerId ? 'edit-container-active'
      : dashboardItemContains(item, state.editContainerId) ? 'edit-ancestor'
        : activeTarget && dashboardItemContains(activeTarget, item.id) ? 'edit-descendant'
          : 'edit-unrelated';
  return `<article class="remote-entity ${state.editMode ? 'editable' : ''} ${unavailable ? 'unavailable' : ''} ${unavailableClass} ${visibilityClass} ${interactionClass} ${activeContainerClass} ${responsiveClasses(item)} ${isSystem ? 'system-widget' : 'entity-widget'} type-${escapeHtml(type || 'unknown')} text-overflow-${widgetTextMode(item)} ${item.settings?.showWidgetTitle === false ? 'widget-title-hidden' : ''} widget-content-align-${escapeHtml(item.settings?.contentAlignment || 'default')} ${item.settings?.showWidgetBackground === false ? 'widget-background-hidden' : ''} ${item.settings?.showWidgetBorder === false ? 'widget-border-hidden' : ''} ${transparentContainer ? 'container-shell-transparent' : ''}"
      style="${style}${runtimeStyle ? `;${runtimeStyle}` : ''}" data-widget ${containerRoot ? `data-container-root data-edit-label="${escapeHtml(editorLabel)}"` : ''} data-widget-interaction="${widgetHasActions(item)}" data-item-id="${escapeHtml(item.id)}" ${isSystem && RUNTIME_WIDGET_TYPES.has(type) ? `data-runtime-signature="${escapeHtml(runtimeWidgetSignature(item))}"` : ''} data-x="${layout.x}" data-y="${layout.y}" data-w="${layout.w}" data-h="${layout.h}" data-columns="${columns}">
      ${widgetCustomStyle(item)}${widgetElementLayoutStyle(item)}${tools}${(!visible||unavailableMode==='hide')?fallbackContent(item):content}${unavailableMode === 'overlay' ? '<div class="widget-unavailable-overlay">Unavailable</div>' : ''}
    </article>`;
}

function renderEntityWidget(entity, item) {
  const renderedItem = { ...item, settings: templatedWidgetSettings(item, item.settings || {}, entity) };
  item = renderedItem;
  switch (entity.entity_type) {
    case 'activity': return renderActivity(entity, item);
    case 'sensor': return renderSensor(entity, item);
    case 'select': return renderSelect(entity, item);
    case 'button': return renderButton(entity, item);
    case 'light': return renderLight(entity, item);
    case 'climate': return renderClimate(entity, item);
    case 'cover': return renderCover(entity, item);
    case 'media_player': return renderMediaPlayer(entity, item);
    default: return renderUnknown(entity, item);
  }
}

function entityLead(entity, item, active = false, secondary = '', options = {}) {
  const elements = itemElements(item, entity.entity_type);
  const showIcon = options.showIcon ?? elements.showIcon;
  const showName = options.showName ?? elements.showName;
  const showState = options.showState ?? true;
  const title = item.settings?.customTitle || localName(entity.name, entity.entity_id);
  const stateText = item.settings?.customSubtitle || secondary || translatedEntityState(entity);
  const hasCopy = showName || (showState && stateText);
  if (!showIcon && !hasCopy) return '';
  return `<div class="entity-lead ${!showIcon ? 'without-icon' : ''} ${!hasCopy ? 'icon-only' : ''}">
    ${showIcon ? `<span class="entity-icon ${active ? 'active' : ''}">${renderWidgetIcon(item, entity.entity_type, 66)}</span>` : ''}
    ${hasCopy ? `<div class="entity-copy">${showName ? `<h3>${marquee(title)}</h3>` : ''}${showState && stateText ? `<p>${marquee(stateText)}</p>` : ''}</div>` : ''}
  </div>`;
}

function localizedValue(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((entry) => localizedValue(entry)).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    const looksLocalized = keys.length > 0 && keys.every((key) => /^[a-z]{2}(?:-[A-Z]{2})?$/.test(key));
    if (looksLocalized) return localName(value, fallback);
    for (const key of ['name', 'title', 'label', 'description', 'value']) {
      if (value[key] !== undefined) {
        const text = localizedValue(value[key], '');
        if (text) return text;
      }
    }
    return keys.slice(0, 4).map((key) => {
      const text = localizedValue(value[key], '');
      return text ? `${String(key).replaceAll('_', ' ')}: ${text}` : '';
    }).filter(Boolean).join(' · ');
  }
  return fallback;
}

function activityImage(entity) {
  const attrs = entity.attributes || {};
  const options = entity.options || {};
  return attrs.image_url || attrs.image || attrs.icon_url || options.image_url || options.image || entity.image || '';
}

function activityDescription(entity) {
  const attrs = entity.attributes || {};
  return localizedValue(attrs.description ?? entity.description ?? entity.options?.description, '');
}

function collectActivityEntityReferences(value, path = '', found = new Map(), depth = 0) {
  if (depth > 10 || value === null || value === undefined) return found;
  if (typeof value === 'string') {
    const related = state.entities.get(value);
    if (related?.entity_id && related.entity_type !== 'activity') {
      const segments = path.split('.').filter((segment) => segment && !/^\d+$/.test(segment) && !['attributes', 'options', 'ui', 'items'].includes(segment));
      const role = (segments.at(-1) || related.entity_type).replaceAll('_', ' ');
      if (!found.has(related.entity_id)) found.set(related.entity_id, { entity: related, role });
    }
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectActivityEntityReferences(entry, `${path}.${index}`, found, depth + 1));
    return found;
  }
  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (['image', 'image_url', 'icon', 'icon_url'].includes(key)) continue;
      collectActivityEntityReferences(entry, path ? `${path}.${key}` : key, found, depth + 1);
    }
  }
  return found;
}

function activityRelatedEntities(entity) {
  const found = new Map();
  collectActivityEntityReferences(entity.attributes || {}, 'attributes', found);
  collectActivityEntityReferences(entity.options || {}, 'options', found);
  return [...found.values()].slice(0, 24);
}

function activityLauncherConfig(settings, activityId) {
  const configs = settings?.activityConfigs && typeof settings.activityConfigs === 'object' && !Array.isArray(settings.activityConfigs) ? settings.activityConfigs : {};
  const configured = configs[activityId] && typeof configs[activityId] === 'object' ? configs[activityId] : {};
  let mediaEntityId = String(configured.mediaEntityId || '');
  if (!mediaEntityId && configured.artworkEntityId && configured.artworkEntityId !== 'none' && state.entities.get(configured.artworkEntityId)?.entity_type === 'media_player') mediaEntityId = configured.artworkEntityId;
  if (!mediaEntityId) {
    const legacyIds = [...(Array.isArray(configured.metadataEntityIds) ? configured.metadataEntityIds : []), ...(Array.isArray(configured.relatedEntityIds) ? configured.relatedEntityIds : [])];
    mediaEntityId = legacyIds.find((id) => state.entities.get(id)?.entity_type === 'media_player') || '';
  }
  return {
    mediaEntityId,
    artworkEntityId: configured.artworkEntityId === 'none' ? '' : String(configured.artworkEntityId || ''),
    playbackEntityId: String(configured.playbackEntityId || ''),
    volumeEntityId: String(configured.volumeEntityId || ''),
    mediaBrowserEntityId: String(configured.mediaBrowserEntityId || ''),
    artworkSource: ['media', 'activity', 'none'].includes(configured.artworkSource) ? configured.artworkSource : (configured.artworkEntityId === 'none' ? 'none' : configured.artworkEntityId ? 'media' : 'activity'),
    showArtwork: configured.showArtwork !== false,
    showPrevious: configured.showPrevious !== false,
    showPlayPause: configured.showPlayPause !== false,
    showNext: configured.showNext !== false,
    showVolume: configured.showVolume !== false,
    showMediaBrowser: Boolean(configured.showMediaBrowser)
  };
}

function activityCandidateEntities(entity) {
  const found = new Map(activityRelatedEntities(entity).map((reference) => [reference.entity.entity_id, reference]));
  for (const candidate of state.entities.values()) {
    if (candidate.entity_type === 'activity' || !ENTITY_TYPES.includes(candidate.entity_type) || found.has(candidate.entity_id)) continue;
    found.set(candidate.entity_id, { entity: candidate, role: 'available entity' });
  }
  return [...found.values()].sort((a, b) => {
    const aRelated = a.role !== 'available entity' ? 0 : 1;
    const bRelated = b.role !== 'available entity' ? 0 : 1;
    return aRelated - bRelated || localName(a.entity.name).localeCompare(localName(b.entity.name));
  });
}

function mappedActivityActions(entity) {
  const mappings = entity.options?.button_mapping || entity.options?.button_mappings || entity.attributes?.button_mapping || entity.attributes?.button_mappings;
  const actions = [];
  const add = (button, press, value) => {
    if (!value || typeof value !== 'object') return;
    const entityId = value.entity_id || value.entityId;
    const command = value.cmd_id || value.command || value.cmdId;
    if (!entityId || !command) return;
    const buttonLabel = localizedValue(button, String(button || 'Mapped button'));
    const pressLabel = press && !['action', 'command'].includes(press) ? ` · ${metadataLabel(press)}` : '';
    actions.push({
      id: `mapping:${String(button)}:${String(press || 'action')}:${entityId}:${command}`,
      label: `${buttonLabel}${pressLabel}`,
      icon: 'button', entityId, command, params: value.params && typeof value.params === 'object' ? value.params : undefined
    });
  };
  const visitEntry = (button, value) => {
    if (!value || typeof value !== 'object') return;
    if (value.entity_id || value.entityId) { add(button, 'action', value); return; }
    for (const [press, action] of Object.entries(value)) add(button, press, action);
  };
  if (Array.isArray(mappings)) {
    mappings.forEach((mapping, index) => {
      const button = mapping?.button || mapping?.name || mapping?.id || `Button ${index + 1}`;
      visitEntry(button, mapping);
    });
  } else if (mappings && typeof mappings === 'object') {
    for (const [button, value] of Object.entries(mappings)) visitEntry(button, value);
  }
  return actions;
}

function actionIcon(command) {
  return ({
    start: 'play', stop: 'stop', previous: 'previous', play_pause: 'play', next: 'next', mute_toggle: 'mute',
    on: 'power', off: 'power', open: 'up', close: 'down', push: 'button'
  })[command] || 'button';
}

function activityActionOptions(entity) {
  const options = [];
  for (const reference of activityCandidateEntities(entity)) {
    for (const action of commandActionsForEntity(reference.entity)) {
      options.push({
        id: action.params ? `entity:${action.entityId}:${action.command}:${encodeURIComponent(JSON.stringify(action.params))}` : `entity:${action.entityId}:${action.command}`,
        label: action.label,
        icon: action.icon || actionIcon(action.command),
        entityId: action.entityId,
        command: action.command,
        params: action.params
      });
    }
  }
  options.push(...mappedActivityActions(entity));
  return options;
}

function activityMediaPlayer(entity, config, role = 'playback') {
  const roleKeys = { artwork:'artworkEntityId', playback:'playbackEntityId', volume:'volumeEntityId', browser:'mediaBrowserEntityId' };
  const roleEntity = state.entities.get(config?.[roleKeys[role]] || '');
  if (roleEntity?.entity_type === 'media_player') return roleEntity;
  const defaultEntity = state.entities.get(config?.mediaEntityId || '');
  if (defaultEntity?.entity_type === 'media_player') return defaultEntity;
  return activityRelatedEntities(entity).map((reference) => reference.entity).find((candidate) => candidate.entity_type === 'media_player') || null;
}

function activityReferencesByIds(ids, role = 'selected') {
  return (Array.isArray(ids) ? ids : []).map((id) => state.entities.get(id)).filter(Boolean).map((entity) => ({ entity, role }));
}

function entityMetadataValue(entity, field) {
  const attrs = entity?.attributes || {};
  const values = {
    name: localName(entity?.name),
    state: translatedEntityState(entity),
    value: relatedEntityValue(entity),
    media_title: attrs.media_title || '',
    media_artist: attrs.media_artist || '',
    media_album: attrs.media_album || '',
    media_source: attrs.media_source || attrs.source || '',
    volume: attrs.volume === undefined ? '' : `${Math.round(Number(attrs.volume) || 0)}%`,
    integration: entity?.integration_id || ''
  };
  return localizedValue(values[field], '');
}

function activityLauncherMetadataWidgets(config) {
  if (config.metadataMode !== 'selected') return '';
  const fields = Array.isArray(config.metadataFields) ? config.metadataFields : [];
  const sourceIds = Array.isArray(config.metadataEntityIds) && config.metadataEntityIds.length
    ? config.metadataEntityIds
    : config.artworkEntityId && config.artworkEntityId !== 'none' ? [config.artworkEntityId] : [];
  const rows = activityReferencesByIds(sourceIds, 'metadata source').map(({ entity }) => {
    const values = fields.map((field) => {
      const value = entityMetadataValue(entity, field);
      return value ? `<span><small>${escapeHtml(metadataLabel(field))}</small><b>${marquee(value)}</b></span>` : '';
    }).filter(Boolean).join('');
    return values ? `<section class="activity-selected-metadata-entity"><strong>${marquee(localName(entity.name))}</strong><div>${values}</div></section>` : '';
  }).filter(Boolean);
  return rows.length ? `<div class="activity-launch-selected-metadata">${rows.join('')}</div>` : '';
}

function renderActivity(entity, item) {
  const elements = itemElements(item, 'activity');
  const active = activityIsActive(entity);
  const image = elements.showImage ? artworkUrl(activityImage(entity)) : '';
  const description = activityDescription(entity);
  const metadata = activityMetadata(entity);
  const browserEntity = elements.showMediaBrowser ? activityBrowserEntity(entity, item) : null;
  return `<div class="activity-entity-card ${active ? 'active' : ''} ${image ? 'has-image' : ''}" ${image ? `style="--activity-image:url(&quot;${escapeHtml(image)}&quot;)"` : ''}>
    <div class="activity-entity-overlay"></div>
    <div class="activity-entity-content">
      ${elements.showIcon ? `<span class="activity-icon">${renderWidgetIcon(item, 'activity', 52)}</span>` : ''}
      <div class="activity-copy">
        ${elements.showName ? `<h3>${marquee(item.settings?.customTitle || localName(entity.name))}</h3>` : ''}
        ${elements.showState ? `<p>${marquee(item.settings?.customSubtitle || translatedEntityState(entity))}</p>` : ''}
        ${elements.showDescription && description ? `<span>${marquee(description)}</span>` : ''}
        ${elements.showIntegration && entity.integration_id ? `<small>${marquee(entity.integration_id)}</small>` : ''}
      </div>
      <div class="activity-entity-actions">${browserEntity ? mediaBrowserButton(browserEntity.entity_id, `Browse media for ${localName(entity.name)}`) : ''}${elements.showControls ? `<button class="activity-launch-button ${active ? 'stop' : ''}" data-command="${active ? 'stop' : 'start'}" data-entity-id="${escapeHtml(entity.entity_id)}">${icon(active ? 'stop' : 'play', 24)}<span>${active ? 'Stop' : 'Start'}</span></button>` : ''}</div>
    </div>
    ${elements.showMetadata ? renderActivityMetadata(metadata) : ''}
    ${renderActivityRelatedEntities(entity, elements)}
  </div>`;
}

function activityLauncherConfigFields(settings) {
  const activities = selectedActivities(settings);
  if (!activities.length) return '<p class="muted">No activity entities are available.</p>';
  const mediaPlayers = accessibleEntities().filter((entity) => entity.entity_type === 'media_player').sort((a, b) => localName(a.name).localeCompare(localName(b.name)));
  return `<section class="settings-section activity-source-settings"><h3>Active media controls</h3><p class="muted">Start and Stop stay on the right of every activity. The selected media controls below appear only while that activity is running.</p>${activities.map((activity) => {
    const config = activityLauncherConfig(settings, activity.entity_id);
    const key = encodeURIComponent(activity.entity_id);
    return `<details class="activity-config-panel"><summary><span>${icon('activity', 24)}</span><strong>${marquee(localName(activity.name))}</strong></summary><input type="hidden" name="configuredActivityId" value="${escapeHtml(activity.entity_id)}"><div class="activity-config-fields">
      <div class="field"><label>Default media player</label><select class="settings-input" name="activityConfig:${key}:mediaEntityId"><option value="">Automatically detected related media player</option>${mediaPlayers.map((entity) => `<option value="${escapeHtml(entity.entity_id)}" ${config.mediaEntityId === entity.entity_id ? 'selected' : ''}>${escapeHtml(localName(entity.name))}</option>`).join('')}</select><small>Used for every role that does not have an override below.</small></div>
      <div class="activity-media-role-grid">
        ${[['artworkEntityId','Artwork media player'],['playbackEntityId','Playback controls'],['volumeEntityId','Volume controls'],['mediaBrowserEntityId','Media browser']].map(([name,label]) => `<div class="field"><label>${label}</label><select class="settings-input" name="activityConfig:${key}:${name}"><option value="">Use default media player</option>${mediaPlayers.map((entity) => `<option value="${escapeHtml(entity.entity_id)}" ${config[name] === entity.entity_id ? 'selected' : ''}>${escapeHtml(localName(entity.name))}</option>`).join('')}</select></div>`).join('')}
      </div>
      <div class="field"><label>Artwork source</label><select class="settings-input" name="activityConfig:${key}:artworkSource">${[['media','Artwork media player'],['activity','Activity artwork'],['none','No artwork']].map(([value,label]) => `<option value="${value}" ${config.artworkSource === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
      ${[['showArtwork','Show artwork'],['showPrevious','Previous'],['showPlayPause','Play / pause'],['showNext','Next'],['showVolume','Volume slider'],['showMediaBrowser','Media browser button']].map(([name,label]) => `<label class="checkbox-row"><input type="checkbox" name="activityConfig:${key}:${name}" ${config[name] ? 'checked' : ''}> ${label}</label>`).join('')}
    </div></details>`;
  }).join('')}</section>`;
}

function readActivityLauncherConfigs(data, existing = {}) {
  const configs = existing && typeof existing === 'object' && !Array.isArray(existing) ? structuredClone(existing) : {};
  for (const activityId of data.getAll('configuredActivityId').map(String)) {
    const key = encodeURIComponent(activityId);
    configs[activityId] = {
      mediaEntityId: String(data.get(`activityConfig:${key}:mediaEntityId`) || ''),
      artworkEntityId: String(data.get(`activityConfig:${key}:artworkEntityId`) || ''),
      playbackEntityId: String(data.get(`activityConfig:${key}:playbackEntityId`) || ''),
      volumeEntityId: String(data.get(`activityConfig:${key}:volumeEntityId`) || ''),
      mediaBrowserEntityId: String(data.get(`activityConfig:${key}:mediaBrowserEntityId`) || ''),
      artworkSource: String(data.get(`activityConfig:${key}:artworkSource`) || 'media'),
      showArtwork: data.get(`activityConfig:${key}:showArtwork`) === 'on',
      showPrevious: data.get(`activityConfig:${key}:showPrevious`) === 'on',
      showPlayPause: data.get(`activityConfig:${key}:showPlayPause`) === 'on',
      showNext: data.get(`activityConfig:${key}:showNext`) === 'on',
      showVolume: data.get(`activityConfig:${key}:showVolume`) === 'on',
      showMediaBrowser: data.get(`activityConfig:${key}:showMediaBrowser`) === 'on'
    };
  }
  return configs;
}

function metadataLabel(key) {
  return String(key || '').replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function activityMetadata(entity) {
  const attrs = entity.attributes || {};
  const options = entity.options || {};
  const ignored = new Set([
    'state', 'image', 'image_url', 'icon', 'icon_url', 'description', 'ui',
    'button_mapping', 'button_mappings', 'pages', 'entity_id', 'media_player_id'
  ]);
  const entries = [];
  const add = (key, value) => {
    if (ignored.has(key) || value === null || value === undefined || entries.some(([existing]) => existing === key)) return;
    if (typeof value === 'object' && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (!keys.length || !keys.every((entry) => /^[a-z]{2}(?:-[A-Z]{2})?$/.test(entry))) return;
    }
    if (Array.isArray(value) && value.some((entry) => typeof entry === 'object')) return;
    const text = localizedValue(value, '');
    if (text && text.toLowerCase() !== '[object object]') entries.push([key, text]);
  };

  ['source', 'room', 'area', 'input', 'profile', 'active'].forEach((key) => add(key, attrs[key] ?? options[key]));
  Object.entries(attrs).forEach(([key, value]) => { if (entries.length < 6) add(key, value); });
  Object.entries(options).forEach(([key, value]) => { if (entries.length < 8) add(key, value); });

  const pages = Array.isArray(options.ui?.pages) ? options.ui.pages : [];
  if (pages.length) {
    const pageNames = pages.map((page) => localizedValue(page?.name ?? page?.title, '')).filter(Boolean);
    entries.push(['pages', pageNames.length ? pageNames.join(', ') : String(pages.length)]);
  }

  const mappings = options.button_mapping || options.button_mappings;
  if (Array.isArray(mappings)) entries.push(['button mappings', String(mappings.length)]);
  else if (mappings && typeof mappings === 'object') entries.push(['button mappings', String(Object.keys(mappings).length)]);

  const related = activityRelatedEntities(entity);
  const typeCounts = related.reduce((counts, reference) => {
    const type = reference.entity.entity_type || 'entity';
    counts[type] = (counts[type] || 0) + 1;
    return counts;
  }, {});
  for (const [type, count] of Object.entries(typeCounts)) entries.push([`${type}s`, String(count)]);
  return entries.slice(0, 12);
}

function activityIsActive(entity) {
  return ['ACTIVE', 'ON', 'RUNNING', 'STARTED'].includes(entityState(entity));
}

function relatedActivitySettings(settings = {}) {
  return {
    showArtwork: settings.relatedShowArtwork !== false,
    showIcon: settings.relatedShowIcon !== false,
    showName: settings.relatedShowName !== false,
    showRole: settings.relatedShowRole !== false,
    showState: settings.relatedShowState !== false,
    showValue: settings.relatedShowValue !== false,
    showMedia: settings.relatedShowMedia !== false,
    showControls: Boolean(settings.relatedShowControls),
    showVolume: Boolean(settings.relatedShowVolume)
  };
}

function relatedEntityValue(entity) {
  const attrs = entity.attributes || {};
  switch (entity.entity_type) {
    case 'sensor': {
      const value = attrs.value ?? attrs.state ?? '—';
      const unit = attrs.unit || entity.options?.custom_unit || '';
      return `${value}${unit ? ` ${unit}` : ''}`;
    }
    case 'select': return attrs.current_option || attrs.state || '—';
    case 'light': {
      if (entityState(entity) !== 'ON') return 'Off';
      const brightness = Math.max(0, Math.min(255, Number(attrs.brightness ?? 255)));
      return `${Math.round(brightness / 255 * 100)}%`;
    }
    case 'climate': {
      const unit = entity.options?.temperature_unit === 'FAHRENHEIT' ? '°F' : '°C';
      const current = attrs.current_temperature;
      const target = attrs.target_temperature ?? attrs.target_temperature_low;
      return [current !== undefined ? `${current}${unit}` : '', target !== undefined ? `Target ${target}${unit}` : ''].filter(Boolean).join(' · ');
    }
    case 'cover': return `${Math.max(0, Math.min(100, Number(attrs.position ?? (entityState(entity) === 'OPEN' ? 100 : 0))))}% open`;
    default: return translatedEntityState(entity);
  }
}

function renderRelatedEntityHeader(reference, view, artwork = '') {
  const entity = reference.entity;
  const visual = artwork && view.showArtwork
    ? `<div class="activity-related-artwork"><img src="${escapeHtml(artwork)}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>`
    : (view.showIcon ? `<span class="activity-related-icon">${icon(entity.entity_type, 30)}</span>` : '');
  const copy = (view.showName || view.showRole || view.showState || view.showValue)
    ? `<div class="activity-related-copy">${view.showName ? `<strong>${marquee(localName(entity.name))}</strong>` : ''}${view.showRole ? `<small class="activity-related-role">${marquee(metadataLabel(reference.role))}</small>` : ''}${view.showValue ? `<span>${marquee(relatedEntityValue(entity))}</span>` : ''}${view.showState ? `<small>${marquee(translatedEntityState(entity))}</small>` : ''}</div>`
    : '';
  return `${visual}${copy}`;
}

function renderActivityRelatedEntity(reference, settings = {}) {
  const entity = reference.entity;
  const attrs = entity.attributes || {};
  const view = relatedActivitySettings(settings);
  const type = entity.entity_type;
  let controls = '';
  let extra = '';
  let artwork = '';

  if (type === 'media_player') {
    artwork = artworkUrl(mediaArtwork(entity));
    const playing = entityState(entity) === 'PLAYING';
    const volume = Math.max(0, Math.min(100, Number(attrs.volume ?? 0)));
    const mediaTitle = attrs.media_title || attrs.media_source || '';
    const artist = attrs.media_artist || attrs.media_album || '';
    if (view.showMedia && (mediaTitle || artist)) extra = `<div class="activity-related-media-copy">${mediaTitle ? `<span>${marquee(mediaTitle)}</span>` : ''}${artist ? `<small>${marquee(artist)}</small>` : ''}</div>`;
    if (view.showControls) controls = `<div class="activity-related-controls"><button data-command="previous" data-entity-id="${escapeHtml(entity.entity_id)}">${icon('previous', 18)}</button><button class="primary" data-command="play_pause" data-entity-id="${escapeHtml(entity.entity_id)}">${icon(playing ? 'pause' : 'play', 20)}</button><button data-command="next" data-entity-id="${escapeHtml(entity.entity_id)}">${icon('next', 18)}</button></div>`;
    if (view.showVolume) extra += `<label class="activity-related-volume"><span>${icon(attrs.muted ? 'mute' : 'volume', 17)}</span><input type="range" min="0" max="100" value="${volume}" style="--range-value:${volume}%" data-range-command="volume" data-range-param="volume" data-entity-id="${escapeHtml(entity.entity_id)}"></label>`;
  } else if (view.showControls && type === 'select') {
    const options = Array.isArray(attrs.options) ? attrs.options : [];
    controls = `<select class="activity-related-select" data-select-entity="${escapeHtml(entity.entity_id)}">${options.map((option) => `<option value="${escapeHtml(option)}" ${option === attrs.current_option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select>`;
  } else if (view.showControls && type === 'button') {
    controls = `<button class="activity-related-action primary" data-command="push" data-entity-id="${escapeHtml(entity.entity_id)}">${icon('button', 19)}<span>Press</span></button>`;
  } else if (view.showControls && type === 'light') {
    const on = entityState(entity) === 'ON';
    const brightness = Math.max(0, Math.min(255, Number(attrs.brightness ?? 255)));
    const percent = Math.round(brightness / 255 * 100);
    controls = `<button class="activity-related-action ${on ? 'primary' : ''}" data-command="${on ? 'off' : 'on'}" data-entity-id="${escapeHtml(entity.entity_id)}">${icon('power', 19)}<span>${on ? 'Off' : 'On'}</span></button>`;
    if (entity.features?.includes('dim')) extra = `<label class="activity-related-volume"><span>${icon('light', 17)}</span><input type="range" min="0" max="255" value="${brightness}" style="--range-value:${percent}%" data-range-command="on" data-range-param="brightness" data-entity-id="${escapeHtml(entity.entity_id)}"></label>`;
  } else if (view.showControls && type === 'cover') {
    controls = `<div class="activity-related-controls"><button data-command="open" data-entity-id="${escapeHtml(entity.entity_id)}">${icon('up', 18)}</button><button class="primary" data-command="stop" data-entity-id="${escapeHtml(entity.entity_id)}">${icon('stop', 18)}</button><button data-command="close" data-entity-id="${escapeHtml(entity.entity_id)}">${icon('down', 18)}</button></div>`;
  } else if (view.showControls && type === 'climate') {
    const unit = entity.options?.temperature_unit === 'FAHRENHEIT' ? '°F' : '°C';
    const step = Number(entity.options?.target_temperature_step || (unit === '°F' ? 1 : 0.5));
    controls = `<div class="activity-related-controls"><button data-temp-adjust="-${step}" data-entity-id="${escapeHtml(entity.entity_id)}">${icon('minus', 18)}</button><button class="primary" data-temp-adjust="${step}" data-entity-id="${escapeHtml(entity.entity_id)}">${icon('plus', 18)}</button></div>`;
  }

  const header = renderRelatedEntityHeader(reference, view, artwork);
  if (!header && !controls && !extra) return '';
  return `<section class="activity-related activity-related-${escapeHtml(type || 'entity')} ${!header ? 'controls-only' : ''}">${header}${extra}${controls}</section>`;
}

function renderActivityRelatedEntities(entity, settings = {}, selectedIds = null) {
  if (!settings.showRelatedEntities) return '';
  const related = selectedIds === null ? activityRelatedEntities(entity) : activityReferencesByIds(selectedIds, 'selected entity');
  if (!related.length) return '';
  const widgets = related.map((reference) => renderActivityRelatedEntity(reference, settings)).filter(Boolean);
  return widgets.length ? `<div class="activity-related-list">${widgets.join('')}</div>` : '';
}

function renderActivityMetadata(metadata, className = 'activity-metadata') {
  if (!metadata.length) return '';
  return `<div class="${className}">${metadata.map(([key, value]) => `<span><small>${escapeHtml(metadataLabel(key))}</small><b>${marquee(value)}</b></span>`).join('')}</div>`;
}



function entityLayoutPresenceClasses(leadHtml, controlsHtml) {
  const hasLead = Boolean(String(leadHtml || '').trim());
  const hasControls = Boolean(String(controlsHtml || '').trim());
  if (hasLead && hasControls) return '';
  if (hasLead) return ' layout-lead-only';
  if (hasControls) return ' layout-controls-only';
  return ' layout-empty';
}

function layoutControlShell(content, className = '') {
  return content ? `<span class="widget-layout-control-shell ${escapeHtml(className)}">${content}</span>` : '';
}

function renderSensor(entity, item) {
  const attrs = entity.attributes || {};
  const elements = itemElements(item, 'sensor');
  const decimals = Number.isInteger(entity.options?.decimals) ? entity.options.decimals : null;
  const raw = attrs.value ?? attrs.state ?? '—';
  const value = typeof raw === 'number' && decimals !== null ? raw.toFixed(decimals) : raw;
  const unit = attrs.unit || entity.options?.custom_unit || '';
  const secondary = elements.showDeviceClass ? (entity.device_class || 'Sensor') : '';
  const lead = entityLead(entity, item, true, secondary, { showState: elements.showDeviceClass });
  const valueBlock = elements.showValue ? `<div class="remote-value"><strong>${marquee(value, 'value-marquee')}</strong>${elements.showUnit && unit ? `<span>${escapeHtml(unit)}</span>` : ''}</div>` : '';
  return `<div class="entity-layout sensor-layout${entityLayoutPresenceClasses(lead, valueBlock)}">${lead}${valueBlock}</div>`;
}
function renderSelect(entity, item) {
  const attrs = entity.attributes || {};
  const elements = itemElements(item, 'select');
  const options = Array.isArray(attrs.options) ? attrs.options : [];
  const lead = entityLead(entity, item, true, attrs.current_option || 'No selection', { showState: elements.showState });
  const controls = elements.showControl ? `<div class="entity-control-zone"><select class="remote-select" data-select-entity="${escapeHtml(entity.entity_id)}" ${isUnavailable(entity) ? 'disabled' : ''}>${options.map((option) => `<option value="${escapeHtml(option)}" ${option === attrs.current_option ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></div>` : '';
  return `<div class="entity-layout${entityLayoutPresenceClasses(lead, controls)}">${lead}${controls}</div>`;
}
function renderButton(entity, item) {
  const elements = itemElements(item, 'button');
  const lead = entityLead(entity, item, true, 'Press', { showState: elements.showState });
  const button = elements.showControl ? `<button class="remote-circle-command" data-command="push" data-entity-id="${escapeHtml(entity.entity_id)}" ${isUnavailable(entity) ? 'disabled' : ''}>${icon('button', 38)}</button>` : '';
  const controls = layoutControlShell(button, 'button-control-shell');
  return `<div class="entity-layout button-layout${entityLayoutPresenceClasses(lead, controls)}">${lead}${controls}</div>`;
}
function hsvToHex(hue, saturation255, value = 1) {
  const h = ((Number(hue) % 360) + 360) % 360;
  const s = Math.max(0, Math.min(1, Number(saturation255) / 255));
  const v = Math.max(0, Math.min(1, Number(value)));
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let [r, g, b] = h < 60 ? [c,x,0] : h < 120 ? [x,c,0] : h < 180 ? [0,c,x] : h < 240 ? [0,x,c] : h < 300 ? [x,0,c] : [c,0,x];
  return `#${[r,g,b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function hexToHueSaturation(hex) {
  const match = String(hex || '').match(/^#([0-9a-f]{6})$/i);
  if (!match) return { hue: 0, saturation: 0 };
  const value = parseInt(match[1], 16);
  const r = ((value >> 16) & 255) / 255, g = ((value >> 8) & 255) / 255, b = (value & 255) / 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { hue: Math.round(hue), saturation: Math.round((max ? delta / max : 0) * 255) };
}

function hexToHsv(hex) {
  const color = normalizeHexColor(hex, '#000000');
  const value = parseInt(color.slice(1), 16);
  const r = ((value >> 16) & 255) / 255, g = ((value >> 8) & 255) / 255, b = (value & 255) / 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  return { hue: Math.round(hue), saturation: Math.round((max ? delta / max : 0) * 255), value: max };
}

function lightWheelCursor(hue, saturation255) {
  const angle = ((Number(hue) || 0) - 90) * Math.PI / 180;
  const radius = Math.max(0, Math.min(1, Number(saturation255) / 255)) * 44;
  return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius };
}

function normalizeHexColor(value, fallback = '#000000') {
  const normalize = (candidate) => {
    const raw = String(candidate || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(raw)) return `#${raw.slice(1).split('').map((character) => character + character).join('')}`.toLowerCase();
    return '';
  };
  return normalize(value) || normalize(fallback) || '#000000';
}

function renderColorPicker(name, value, options = {}) {
  const color = normalizeHexColor(value, options.fallback || '#000000');
  const { hue, saturation, value: brightness } = hexToHsv(color);
  const cursor = lightWheelCursor(hue, saturation);
  const className = String(options.className || '').replace(/[^a-z0-9_-]/gi, ' ').trim();
  const title = options.title || 'Choose color';
  const presets = ['#000000','#ffffff','#d0d0d0','#7f8c8d','#e53935','#ff9800','#fdd835','#43a047','#00acc1','#1e88e5','#5e35b1','#d81b60'];
  return `<div class="custom-color-picker ${escapeHtml(className)}" data-custom-color-picker data-brightness="${brightness}" style="--picker-color:${escapeHtml(color)};--picker-x:${cursor.x}%;--picker-y:${cursor.y}%">
    <input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(color)}" data-custom-color-value>
    <button type="button" class="custom-color-trigger" data-action="toggle-custom-color-picker" aria-expanded="false" title="${escapeHtml(title)}"><span class="custom-color-trigger-swatch"></span><code data-custom-color-label>${escapeHtml(color.toUpperCase())}</code>${materialSymbol('expand_more',18)}</button>
    <div class="custom-color-popover" data-custom-color-popover hidden>
      <button type="button" class="custom-color-wheel" data-custom-color-wheel data-hue="${hue}" data-saturation="${saturation}" aria-label="Color wheel"><span class="custom-color-wheel-cursor"></span></button>
      <label class="custom-color-brightness"><span>Brightness</span><input type="range" min="0" max="100" value="${Math.round(brightness * 100)}" data-custom-color-brightness></label>
      <label class="custom-color-hex-field"><span>Hex</span><input class="settings-input" value="${escapeHtml(color.toUpperCase())}" maxlength="7" inputmode="text" autocomplete="off" spellcheck="false" data-custom-color-hex></label>
      <div class="custom-color-presets" aria-label="Color presets">${presets.map((preset) => `<button type="button" data-action="set-custom-color" data-color="${preset}" style="--preset-color:${preset}" title="${preset}"></button>`).join('')}</div>
    </div>
  </div>`;
}

function setCustomColorPickerValue(picker, value, { emit = true, hsv = null } = {}) {
  if (!picker) return false;
  const color = normalizeHexColor(value, picker.querySelector('[data-custom-color-value]')?.value || '#000000');
  const derived = hsv || hexToHsv(color);
  const hue = Math.max(0, Math.min(360, Number(derived.hue) || 0));
  const saturation = Math.max(0, Math.min(255, Number(derived.saturation) || 0));
  const brightness = Math.max(0, Math.min(1, Number(derived.value) || 0));
  const cursor = lightWheelCursor(hue, saturation);
  picker.dataset.brightness = String(brightness);
  picker.style.setProperty('--picker-color', color);
  picker.style.setProperty('--picker-x', `${cursor.x}%`);
  picker.style.setProperty('--picker-y', `${cursor.y}%`);
  const wheel = picker.querySelector('[data-custom-color-wheel]');
  if (wheel) { wheel.dataset.hue = String(hue); wheel.dataset.saturation = String(saturation); }
  const input = picker.querySelector('[data-custom-color-value]');
  if (input) input.value = color;
  const brightnessInput = picker.querySelector('[data-custom-color-brightness]');
  if (brightnessInput && document.activeElement !== brightnessInput) brightnessInput.value = String(Math.round(brightness * 100));
  const hexInput = picker.querySelector('[data-custom-color-hex]');
  if (hexInput && document.activeElement !== hexInput) hexInput.value = color.toUpperCase();
  const label = picker.querySelector('[data-custom-color-label]');
  if (label) label.textContent = color.toUpperCase();
  if (emit && input) input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

function closeCustomColorPickers(except = null) {
  document.querySelectorAll('[data-custom-color-picker]').forEach((picker) => {
    if (picker === except) return;
    const popover = picker.querySelector('[data-custom-color-popover]');
    const trigger = picker.querySelector('[data-action="toggle-custom-color-picker"]');
    if (popover) popover.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
  });
}

function updateCustomColorWheelFromPointer(wheel, event) {
  const picker = wheel?.closest('[data-custom-color-picker]');
  if (!picker) return;
  const rect = wheel.getBoundingClientRect();
  const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const rawDistance = Math.hypot(dx, dy);
  const distance = Math.min(radius, rawDistance);
  const saturation = Math.round(distance / radius * 255);
  const hue = Math.round((Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360);
  const storedBrightness = Math.max(0, Math.min(1, Number(picker.dataset.brightness) || 0));
  const brightness = storedBrightness > .01 ? storedBrightness : 1;
  const color = hsvToHex(hue, saturation, brightness);
  wheel.dataset.hue = String(hue);
  wheel.dataset.saturation = String(saturation);
  setCustomColorPickerValue(picker, color, { hsv: { hue, saturation, value: brightness } });
}

function startCustomColorInteraction(event) {
  const wheel = event.target.closest?.('[data-custom-color-wheel]');
  if (!wheel) return false;
  state.customColorDrag = { wheel, pointerId: event.pointerId };
  wheel.setPointerCapture?.(event.pointerId);
  updateCustomColorWheelFromPointer(wheel, event);
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function moveCustomColorInteraction(event) {
  const drag = state.customColorDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  updateCustomColorWheelFromPointer(drag.wheel, event);
  event.preventDefault();
}

function endCustomColorInteraction(event) {
  const drag = state.customColorDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  updateCustomColorWheelFromPointer(drag.wheel, event);
  try { drag.wheel.releasePointerCapture?.(event.pointerId); } catch {}
  state.customColorDrag = null;
}

function updateLightColorWheelFromPointer(wheel, event, commit = false) {
  const rect = wheel.getBoundingClientRect();
  const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const distance = Math.min(radius, Math.hypot(dx, dy));
  const saturation = Math.round(distance / radius * 255);
  const hue = Math.round((Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360);
  const normalizedDistance = distance ? distance / Math.max(distance, Math.hypot(dx, dy)) : 0;
  const x = 50 + (dx * normalizedDistance / radius) * 50;
  const y = 50 + (dy * normalizedDistance / radius) * 50;
  const selectedColor = hsvToHex(hue, saturation, 1);
  wheel.dataset.hue = String(hue);
  wheel.dataset.saturation = String(saturation);
  wheel.style.setProperty('--light-wheel-x', `${x}%`);
  wheel.style.setProperty('--light-wheel-y', `${y}%`);
  wheel.style.setProperty('--light-wheel-color', selectedColor);
  wheel.setAttribute('aria-valuetext', `Hue ${hue} degrees, saturation ${Math.round(saturation / 255 * 100)} percent`);
  const control = wheel.closest('.light-color-control');
  control?.querySelector('.light-color-swatch')?.style.setProperty('--light-wheel-color', selectedColor);
  const value = control?.querySelector('[data-light-color-value]');
  if (value) value.textContent = `${hue}° · ${Math.round(saturation / 255 * 100)}%`;
  if (commit && wheel.dataset.entityId) executeCommand(wheel.dataset.entityId, 'on', { hue, saturation });
  return { hue, saturation };
}

function startLightColorInteraction(event) {
  const wheel = event.target.closest('[data-light-color-wheel]');
  if (!wheel) return false;
  state.lightColorDrag = { wheel, pointerId: event.pointerId };
  wheel.setPointerCapture?.(event.pointerId);
  updateLightColorWheelFromPointer(wheel, event, false);
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function moveLightColorInteraction(event) {
  const drag = state.lightColorDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  updateLightColorWheelFromPointer(drag.wheel, event, false);
  event.preventDefault();
}

function endLightColorInteraction(event) {
  const drag = state.lightColorDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const color = updateLightColorWheelFromPointer(drag.wheel, event, false);
  try { drag.wheel.releasePointerCapture?.(event.pointerId); } catch { /* pointer capture already released */ }
  state.lightColorDrag = null;
  if (drag.wheel.dataset.entityId) executeCommand(drag.wheel.dataset.entityId, 'on', color);
}


const ENTITY_GRID_LAYOUT_TYPES = new Set(['light','climate','cover']);
const ENTITY_GRID_LAYOUT_DEFAULTS = Object.freeze({
  light: {
    rows: [{ columns:2, weight:1 },{ columns:1, weight:1 },{ columns:1, weight:2 },{ columns:1, weight:1 }],
    placements: { lead:{row:1,column:1,span:1}, power:{row:1,column:2,span:1}, brightness:{row:2,column:1,span:1}, color:{row:3,column:1,span:1}, temperature:{row:4,column:1,span:1} }
  },
  climate: {
    rows: [{ columns:2, weight:1 },{ columns:2, weight:1 }],
    placements: { lead:{row:1,column:1,span:1}, target:{row:1,column:2,span:1}, stepper:{row:2,column:1,span:1}, modes:{row:2,column:2,span:1} }
  },
  cover: {
    rows: [{ columns:2, weight:1 },{ columns:1, weight:1 }],
    placements: { lead:{row:1,column:1,span:1}, buttons:{row:1,column:2,span:1}, position:{row:2,column:1,span:1} }
  }
});

function normalizeEntityGridLayout(item, type) {
  const defaults = ENTITY_GRID_LAYOUT_DEFAULTS[type] || { rows:[{columns:1,weight:1}], placements:{} };
  const source = item?.settings?.entityGrid && typeof item.settings.entityGrid === 'object' ? item.settings.entityGrid : {};
  const sourceRows = Array.isArray(source.rows) && source.rows.length ? source.rows : defaults.rows;
  const rows = sourceRows.slice(0,6).map((row) => ({
    columns: Math.max(1, Math.min(6, Number(row?.columns) || 1)),
    weight: Math.max(.25, Math.min(6, Number(row?.weight) || 1))
  }));
  while (!rows.length) rows.push({ columns:1, weight:1 });
  const placements = {};
  for (const [key, fallback] of Object.entries(defaults.placements || {})) {
    const value = source.placements?.[key] || fallback;
    const row = Math.max(1, Math.min(rows.length, Number(value?.row) || fallback.row || 1));
    const columns = rows[row - 1].columns;
    const column = Math.max(1, Math.min(columns, Number(value?.column) || fallback.column || 1));
    placements[key] = {
      row,
      column,
      span: Math.max(1, Math.min(columns - column + 1, Number(value?.span) || fallback.span || 1)),
      align: ['stretch','start','center','end'].includes(value?.align) ? value.align : 'stretch',
      hidden: Boolean(value?.hidden),
      scale: Math.max(25, Math.min(200, Number(value?.scale) || 100))
    };
  }
  return { rows, placements };
}

function renderEntityGridLayout(item, type, cells = {}) {
  const grid = normalizeEntityGridLayout(item, type);
  const renderedRows = grid.rows.map((row, index) => {
    const rowNumber = index + 1;
    const entries = Object.entries(cells).filter(([key, html]) => html && !grid.placements[key]?.hidden && (grid.placements[key]?.row || 1) === rowNumber);
    if (!entries.length) return null;
    const only = entries.length === 1;
    const html = `<div class="entity-widget-grid-row" data-entity-grid-row="${rowNumber}" style="--entity-grid-columns:${row.columns}">${entries.map(([key,content]) => {
      const placement = grid.placements[key] || { column:1, span:1, align:'stretch' };
      const column = only ? 1 : Math.max(1, Math.min(row.columns, placement.column));
      const span = only ? row.columns : Math.max(1, Math.min(row.columns - column + 1, placement.span));
      return `<div class="entity-widget-grid-cell grid-element-${escapeHtml(key)} align-${escapeHtml(placement.align)}" data-entity-grid-element="${escapeHtml(key)}" style="grid-column:${column} / span ${span};--entity-element-scale:${Math.max(25,Math.min(200,Number(placement.scale)||100))/100}"><div class="entity-widget-grid-element-inner">${content}</div></div>`;
    }).join('')}</div>`;
    return { html, weight: row.weight };
  }).filter(Boolean);
  const activeWeights = renderedRows.map((row) => `${row.weight}fr`);
  return `<div class="entity-widget-grid type-${escapeHtml(type)}" style="grid-template-rows:${escapeHtml(activeWeights.join(' ') || '1fr')}">${renderedRows.map((row)=>row.html).join('')}</div>`;
}

function entityGridLayoutFromForm(data, item) {
  const type = item?.entityType || entityForItem(item)?.entity_type || '';
  if (!ENTITY_GRID_LAYOUT_TYPES.has(type)) return item?.settings?.entityGrid || undefined;
  const defaults = ENTITY_GRID_LAYOUT_DEFAULTS[type];
  const count = Math.max(1, Math.min(6, Number(data.get('entityGridRowCount')) || defaults.rows.length));
  const rows = Array.from({length:count}, (_,index) => ({
    columns: Math.max(1, Math.min(6, Number(data.get(`entityGridColumns:${index+1}`)) || defaults.rows[index]?.columns || 1)),
    weight: Math.max(.25, Math.min(6, Number(data.get(`entityGridWeight:${index+1}`)) || defaults.rows[index]?.weight || 1))
  }));
  const placements = {};
  for (const key of Object.keys(defaults.placements)) {
    const row = Math.max(1, Math.min(count, Number(data.get(`entityGridRow:${key}`)) || defaults.placements[key].row));
    const columns = rows[row-1].columns;
    const column = Math.max(1, Math.min(columns, Number(data.get(`entityGridColumn:${key}`)) || defaults.placements[key].column));
    placements[key] = {
      row,
      column,
      span: Math.max(1, Math.min(columns-column+1, Number(data.get(`entityGridSpan:${key}`)) || defaults.placements[key].span || 1)),
      align: ['stretch','start','center','end'].includes(String(data.get(`entityGridAlign:${key}`))) ? String(data.get(`entityGridAlign:${key}`)) : 'stretch',
      hidden: data.get(`entityGridHidden:${key}`) === 'on',
      scale: Math.max(25, Math.min(200, Number(data.get(`entityGridScale:${key}`)) || 100))
    };
  }
  return { rows, placements };
}

function renderEntityGridLayoutSettings(item, type) {
  const grid = normalizeEntityGridLayout(item, type);
  const elements = (WIDGET_LAYOUT_ELEMENTS[type] || []).map(([key,label]) => [key,label]);
  const rowEditors = Array.from({length:6},(_,index) => {
    const row = grid.rows[index] || { columns:1, weight:1 };
    return `<article class="entity-grid-row-editor" data-entity-grid-row-editor="${index+1}" ${index>=grid.rows.length?'hidden':''}><strong>Row ${index+1}</strong><div class="field-row"><div class="field"><label>Columns</label><input class="settings-input" type="number" min="1" max="6" name="entityGridColumns:${index+1}" value="${escapeHtml(row.columns)}"></div><div class="field"><label>Height weight</label><input class="settings-input" type="number" min="0.25" max="6" step="0.25" name="entityGridWeight:${index+1}" value="${escapeHtml(row.weight)}"><small>Rows with a larger weight receive more vertical space.</small></div></div></article>`;
  }).join('');
  const placementEditors = elements.map(([key,label]) => {
    const placement = grid.placements[key] || {row:1,column:1,span:1,align:'stretch'};
    return `<article class="entity-grid-element-editor"><div class="element-layout-card-head"><div><small>WIDGET ELEMENT</small><strong>${escapeHtml(label)}</strong></div></div><label class="checkbox-row"><input type="checkbox" name="entityGridHidden:${escapeHtml(key)}" ${placement.hidden?'checked':''}> Hide this element</label><div class="field-row entity-grid-placement-fields"><div class="field"><label>Row</label><select class="settings-input" name="entityGridRow:${escapeHtml(key)}">${Array.from({length:6},(_,index)=>`<option value="${index+1}" ${placement.row===index+1?'selected':''}>${index+1}</option>`).join('')}</select></div><div class="field"><label>Column</label><input class="settings-input" type="number" min="1" max="6" name="entityGridColumn:${escapeHtml(key)}" value="${escapeHtml(placement.column)}"></div><div class="field"><label>Column span</label><input class="settings-input" type="number" min="1" max="6" name="entityGridSpan:${escapeHtml(key)}" value="${escapeHtml(placement.span)}"></div><div class="field"><label>Size</label><input class="settings-input" type="number" min="25" max="200" name="entityGridScale:${escapeHtml(key)}" value="${escapeHtml(placement.scale||100)}"></div><div class="field"><label>Alignment</label><select class="settings-input" name="entityGridAlign:${escapeHtml(key)}">${[['stretch','Stretch'],['start','Start'],['center','Center'],['end','End']].map(([value,labelText])=>`<option value="${value}" ${placement.align===value?'selected':''}>${labelText}</option>`).join('')}</select></div></div></article>`;
  }).join('');
  return `<section class="settings-section entity-grid-layout-editor" data-entity-grid-layout-editor><div class="settings-section-heading"><div><h3>Widget grid layout</h3><p class="muted">Each row has its own column count. Elements are assigned to independent grid cells, so moving one element never stacks the others on top of it.</p></div></div><div class="field"><label>Grid rows</label><input class="settings-input" type="number" min="1" max="6" name="entityGridRowCount" value="${grid.rows.length}" data-entity-grid-row-count></div><div class="entity-grid-row-editors">${rowEditors}</div></section><section class="settings-section"><h3>Element placement</h3><div class="entity-grid-element-editors">${placementEditors}</div></section>`;
}

function renderLight(entity, item) {
  const attrs = entity.attributes || {};
  const elements = itemElements(item, 'light');
  const on = entityState(entity) === 'ON';
  const brightness = Math.max(0, Math.min(255, Number(attrs.brightness ?? 255)));
  const brightnessPercent = Math.round(brightness / 255 * 100);
  const hasDim = entity.features?.includes('dim');
  const hasColor = entity.features?.includes('color');
  const hasTemperature = entity.features?.includes('color_temperature');
  const hue = Math.max(0, Math.min(360, Number(attrs.hue ?? 0)));
  const saturation = Math.max(0, Math.min(255, Number(attrs.saturation ?? 0)));
  const color = hsvToHex(hue, saturation, 1);
  const cursor = lightWheelCursor(hue, saturation);
  const lead = entityLead(entity, item, on, on ? `${brightnessPercent}%` : translateDashboardValue('off'), { showState: elements.showState });
  const cells = {
    lead,
    power: elements.showPower ? layoutControlShell(`<button class="remote-power ${on ? 'active' : ''}" data-command="${on ? 'off' : 'on'}" data-entity-id="${escapeHtml(entity.entity_id)}">${icon('power', 28)}</button>`, 'light-power-shell') : '',
    brightness: elements.showBrightness && hasDim ? `<label class="remote-slider"><span>${icon('light', 20)}</span><input type="range" min="0" max="255" value="${brightness}" style="--range-value:${brightnessPercent}%" data-range-command="on" data-range-param="brightness" data-entity-id="${escapeHtml(entity.entity_id)}"><b>${brightnessPercent}%</b></label>` : '',
    color: elements.showColor && hasColor ? `<div class="light-color-control"><button type="button" class="light-color-wheel-ui" data-light-color-wheel data-entity-id="${escapeHtml(entity.entity_id)}" data-hue="${hue}" data-saturation="${saturation}" role="slider" aria-label="Light color" aria-valuetext="Hue ${hue} degrees, saturation ${Math.round(saturation / 255 * 100)} percent" style="--light-wheel-x:${cursor.x}%;--light-wheel-y:${cursor.y}%;--light-wheel-color:${color}"><span class="light-color-wheel-cursor"></span></button><div class="light-color-readout"><span class="light-color-swatch" style="--light-wheel-color:${color}"></span><span><b>Color</b><small data-light-color-value>${Math.round(hue)}° · ${Math.round(saturation / 255 * 100)}%</small></span></div></div>` : '',
    temperature: elements.showColorTemperature && hasTemperature ? `<label class="remote-slider compact"><span>Cool</span><input type="range" min="0" max="100" value="${Number(attrs.color_temperature ?? 50)}" style="--range-value:${Number(attrs.color_temperature ?? 50)}%" data-range-command="on" data-range-param="color_temperature" data-entity-id="${escapeHtml(entity.entity_id)}"><b>Warm</b></label>` : ''
  };
  return renderEntityGridLayout(item, 'light', cells);
}
function renderClimate(entity, item) {
  const attrs = entity.attributes || {};
  const elements = itemElements(item, 'climate');
  const mode = String(attrs.state || attrs.hvac_mode || 'OFF').toUpperCase();
  const unit = entity.options?.temperature_unit === 'FAHRENHEIT' ? '°F' : '°C';
  const target = Number(attrs.target_temperature ?? attrs.target_temperature_low ?? 20);
  const current = attrs.current_temperature;
  const step = Number(entity.options?.target_temperature_step || (unit === '°F' ? 1 : 0.5));
  const modes = ['OFF'];
  if (entity.features?.includes('heat')) modes.push('HEAT');
  if (entity.features?.includes('cool')) modes.push('COOL');
  if (entity.features?.includes('fan')) modes.push('FAN');
  if (entity.features?.includes('heat') && entity.features?.includes('cool')) modes.push('AUTO');
  const secondary = [elements.showCurrentTemperature && current !== undefined ? `${current}${unit}` : '', elements.showMode ? translateDashboardValue(mode) : ''].filter(Boolean).join(' · ');
  const lead = entityLead(entity, item, mode !== 'OFF', secondary, { showState: Boolean(secondary) });
  const cells = {
    lead,
    target: elements.showTargetTemperature ? `<div class="climate-target"><strong>${escapeHtml(target)}${unit}</strong><small>${escapeHtml(translateDashboardValue('target'))}</small></div>` : '',
    stepper: elements.showStepper ? `<div class="stepper"><button data-temp-adjust="-${step}" data-entity-id="${escapeHtml(entity.entity_id)}">${icon('minus', 20)}</button><button data-temp-adjust="${step}" data-entity-id="${escapeHtml(entity.entity_id)}">${icon('plus', 20)}</button></div>` : '',
    modes: elements.showModes ? `<div class="remote-segmented">${[...new Set(modes)].map((entry) => `<button class="${entry === mode ? 'active' : ''}" data-climate-mode="${entry}" data-entity-id="${escapeHtml(entity.entity_id)}">${escapeHtml(translateDashboardValue(entry))}</button>`).join('')}</div>` : ''
  };
  return renderEntityGridLayout(item, 'climate', cells);
}
function renderCover(entity, item) {
  const attrs = entity.attributes || {};
  const elements = itemElements(item, 'cover');
  const position = Math.max(0, Math.min(100, Number(attrs.position ?? (entityState(entity) === 'OPEN' ? 100 : 0))));
  const secondary = [elements.showPosition ? translateDashboardValue('open_percent',{ value: position }) : '', elements.showState ? translatedEntityState(entity) : ''].filter(Boolean).join(' · ');
  const lead = entityLead(entity, item, position > 0, secondary, { showState: Boolean(secondary) });
  const cells = {
    lead,
    buttons: elements.showButtons ? `<div class="remote-button-group"><button data-command="open" data-entity-id="${escapeHtml(entity.entity_id)}">${icon('up', 24)}</button><button data-command="stop" data-entity-id="${escapeHtml(entity.entity_id)}">${icon('stop', 20)}</button><button data-command="close" data-entity-id="${escapeHtml(entity.entity_id)}">${icon('down', 24)}</button></div>` : '',
    position: elements.showSlider && entity.features?.includes('position') ? `<label class="remote-slider"><span>0</span><input type="range" min="0" max="100" value="${position}" style="--range-value:${position}%" data-range-command="position" data-range-param="position" data-entity-id="${escapeHtml(entity.entity_id)}"><b>${position}%</b></label>` : ''
  };
  return renderEntityGridLayout(item, 'cover', cells);
}
function mediaArtwork(entity) {
  const attrs = entity.attributes || {};
  return attrs.media_image_url || attrs.media_image || attrs.artwork_url || attrs.media_artwork || attrs.image_url || attrs.thumbnail || '';
}

function artworkUrl(value) {
  if (!value) return '';
  const raw = String(value);
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  try {
    const base = state.settings.remoteHttpUrl ? new URL(state.settings.remoteHttpUrl) : null;
    const target = new URL(raw, base || window.location.origin);
    if (base && target.origin === base.origin) return `/api/media-image?url=${encodeURIComponent(target.toString())}`;
    return target.toString();
  } catch {
    return '';
  }
}

function renderMediaPlayer(entity, item) {
  const attrs = entity.attributes || {};
  const elements = itemElements(item, 'media_player');
  const playing = entityState(entity) === 'PLAYING';
  const volume = Math.max(0, Math.min(100, Number(attrs.volume ?? 0)));
  const muted = Boolean(attrs.muted);
  const artwork = elements.showArtwork ? artworkUrl(mediaArtwork(entity)) : '';
  const title = attrs.media_title || item.settings?.customTitle || localName(entity.name);
  const artist = attrs.media_artist || attrs.media_album || attrs.media_source || attrs.media_type || '';
  const basePosition = Number(attrs.media_position ?? attrs.position ?? 0);
  const duration = Number(attrs.media_duration ?? attrs.duration ?? 0);
  const updatedAt = Date.parse(attrs.media_position_updated_at || attrs.position_updated_at || '');
  const position = playing && Number.isFinite(updatedAt) ? Math.min(duration || Number.POSITIVE_INFINITY, basePosition + Math.max(0, (Date.now() - updatedAt) / 1000)) : basePosition;
  const progress = duration > 0 ? Math.max(0, Math.min(100, position / duration * 100)) : 0;
  const showIconFallback = !artwork && elements.showIcon;
  const copyParts = [];
  if (elements.showName) copyParts.push(`<small class="media-entity-name">${marquee(item.settings?.customTitle || localName(entity.name))}</small>`);
  if (elements.showTitle) copyParts.push(`<h3>${marquee(title)}</h3>`);
  if (elements.showArtist && artist) copyParts.push(`<p>${marquee(artist)}</p>`);
  if (elements.showState) copyParts.push(`<p>${marquee(translatedEntityState(entity))}</p>`);
  const browserButton = elements.showMediaBrowser ? mediaBrowserButton(entity.entity_id, `Browse ${localName(entity.name)}`) : '';
  return `<div class="media-widget ${artwork ? 'has-artwork' : ''}">
    ${(artwork || showIconFallback) ? `<div class="media-visual">${artwork ? `<img src="${escapeHtml(artwork)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.media-visual').classList.add('image-error')">` : ''}<span class="media-fallback">${renderWidgetIcon(item, 'media_player', 64)}</span></div>` : ''}
    <div class="media-main">
      ${copyParts.length ? `<div class="media-copy">${copyParts.join('')}</div>` : ''}
      ${elements.showProgress && duration > 0 ? `<div class="media-progress" title="${Math.round(position)} / ${Math.round(duration)} seconds" data-media-progress data-entity-id="${escapeHtml(entity.entity_id)}" data-base-position="${escapeHtml(basePosition)}" data-duration="${escapeHtml(duration)}" data-updated-at="${escapeHtml(attrs.media_position_updated_at || attrs.position_updated_at || '')}" data-playing="${playing}"><i style="width:${progress}%"></i></div>` : ''}
      ${(elements.showPlayback || elements.showVolume || browserButton) ? `<div class="media-controls">
        ${elements.showPlayback ? `<div class="remote-button-group media-buttons"><button data-command="previous" data-entity-id="${escapeHtml(entity.entity_id)}">${icon('previous', 24)}</button><button class="primary" data-command="play_pause" data-entity-id="${escapeHtml(entity.entity_id)}">${icon(playing ? 'pause' : 'play', 28)}</button><button data-command="next" data-entity-id="${escapeHtml(entity.entity_id)}">${icon('next', 24)}</button></div>` : ''}
        ${browserButton}
        ${elements.showVolume ? `<label class="remote-slider"><button class="inline-icon-button" data-command="mute_toggle" data-entity-id="${escapeHtml(entity.entity_id)}">${icon(muted ? 'mute' : 'volume', 20)}</button><input type="range" min="0" max="100" value="${volume}" style="--range-value:${volume}%" data-range-command="volume" data-range-param="volume" data-entity-id="${escapeHtml(entity.entity_id)}"><b>${volume}</b></label>` : ''}
      </div>` : ''}
    </div>
  </div>`;
}

function renderUnknown(entity, item) {
  return `<div class="entity-layout">${entityLead(entity, item, false, 'Unsupported entity type')}</div>`;
}

function entityReading(entityId) {
  const entity = state.entities.get(entityId);
  if (!entity) return { value: '—', unit: '', text: '' };
  const attrs = entity.attributes || {};
  const value = attrs.value ?? attrs.current_option ?? attrs.state ?? '—';
  const unit = attrs.unit || entity.options?.custom_unit || '';
  return { value, unit, text: `${value}${unit ? ` ${unit}` : ''}`, entity };
}

function weatherIcon(condition) {
  const text = String(condition || '').toLowerCase();
  if (/(thunder|storm|lightning)/.test(text)) return 'storm';
  if (/(snow|sleet|ice|hail)/.test(text)) return 'snow';
  if (/(rain|drizzle|shower)/.test(text)) return 'rain';
  if (/(fog|mist|haze)/.test(text)) return 'fog';
  if (/(sun|clear)/.test(text)) return 'sun';
  if (/(cloud|overcast)/.test(text)) return 'cloud';
  return 'weather';
}

function selectedActivities(settings) {
  const selected = String(settings.activityEntityIds || '').split(',').map((value) => value.trim()).filter(Boolean);
  const activities = accessibleEntities().filter((entity) => entity.entity_type === 'activity');
  return (selected.length ? selected.map((id) => state.entities.get(id)).filter(Boolean) : activities).sort((a, b) => localName(a.name).localeCompare(localName(b.name)));
}

function renderActivityLauncher(item, settings) {
  const activities = selectedActivities(settings);
  const columns = Math.max(1, Math.min(4, Number(settings.columns) || 2));
  return `<div class="activity-launcher"><div class="system-widget-heading"><h3>${marquee(settings.title || 'Activities')}</h3>${settings.showCount !== false ? `<span>${activities.length}</span>` : ''}</div><div class="activity-launch-grid" style="--activity-columns:${columns}">${activities.length ? activities.map((entity) => {
    const active = activityIsActive(entity);
    const config = activityLauncherConfig(settings, entity.entity_id);
    const artworkMedia = activityMediaPlayer(entity, config, 'artwork');
    const playbackMedia = activityMediaPlayer(entity, config, 'playback');
    const volumeMedia = activityMediaPlayer(entity, config, 'volume');
    const browserMedia = activityMediaPlayer(entity, config, 'browser');
    const playbackAttrs = playbackMedia?.attributes || {};
    const volumeAttrs = volumeMedia?.attributes || {};
    const playing = String(playbackAttrs.state || '').toUpperCase() === 'PLAYING';
    const volume = Math.max(0, Math.min(100, Number(volumeAttrs.volume ?? 0)));
    let artwork = '';
    if (active && config.showArtwork && config.artworkSource !== 'none') {
      artwork = config.artworkSource === 'activity' ? artworkUrl(activityImage(entity)) : artworkUrl(artworkMedia ? mediaArtwork(artworkMedia) : '');
    }
    const showPlayback = Boolean(playbackMedia && (config.showPrevious || config.showPlayPause || config.showNext));
    const showVolume = Boolean(volumeMedia && config.showVolume);
    const showBrowser = Boolean(browserMedia && config.showMediaBrowser);
    const mediaControls = active && (artwork || showPlayback || showVolume || showBrowser) ? `<div class="activity-running-media ${artwork ? 'has-artwork' : ''}">
      ${artwork ? `<img class="activity-media-artwork" src="${escapeHtml(artwork)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
      ${showPlayback ? `<div class="remote-button-group activity-media-buttons">${config.showPrevious ? `<button data-command="previous" data-entity-id="${escapeHtml(playbackMedia.entity_id)}">${icon('previous', 22)}</button>` : ''}${config.showPlayPause ? `<button class="primary" data-command="play_pause" data-entity-id="${escapeHtml(playbackMedia.entity_id)}">${icon(playing ? 'pause' : 'play', 26)}</button>` : ''}${config.showNext ? `<button data-command="next" data-entity-id="${escapeHtml(playbackMedia.entity_id)}">${icon('next', 22)}</button>` : ''}</div>` : ''}
      ${showBrowser ? mediaBrowserButton(browserMedia.entity_id, `Browse media for ${localName(entity.name)}`, 'activity-media-browser') : ''}
      ${showVolume ? `<label class="remote-slider activity-media-volume"><span>${icon('volume', 19)}</span><input type="range" min="0" max="100" value="${volume}" style="--range-value:${volume}%" data-range-command="volume" data-range-param="volume" data-entity-id="${escapeHtml(volumeMedia.entity_id)}"><b>${Math.round(volume)}</b></label>` : ''}
    </div>` : '';
    return `<div class="activity-launch-tile ${active ? 'active' : ''}"><div class="activity-launch-content">${settings.showIcon ? `<span>${renderWidgetIcon(item, 'activity', 32)}</span>` : ''}<div>${settings.showName ? `<strong>${marquee(localName(entity.name))}</strong>` : ''}${settings.showState ? `<small>${marquee(translatedEntityState(entity))}</small>` : ''}</div><button class="activity-primary-toggle ${active ? 'stop' : 'start'}" data-command="${active ? 'stop' : 'start'}" data-entity-id="${escapeHtml(entity.entity_id)}" aria-label="${active ? 'Stop' : 'Start'} ${escapeHtml(localName(entity.name))}" title="${active ? 'Stop' : 'Start'}">${icon(active ? 'stop' : 'play', 24)}</button></div>${mediaControls}</div>`;
  }).join('') : '<div class="empty-inline">No activity entities are available.</div>'}</div></div>`;
}

function inferCameraType(settings) {
  const selected = String(settings.sourceType || 'auto').toLowerCase();
  if (selected !== 'auto') return selected;
  const url = String(settings.sourceUrl || '').toLowerCase();
  if (url.startsWith('rtsp://') || url.startsWith('rtsps://')) {
    try {
      const target = new URL(url);
      return target.port === '8554' ? 'go2rtc' : 'rtsp';
    } catch { return 'rtsp'; }
  }
  if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/.test(url)) return 'image';
  return 'video';
}

function parseGo2RtcSource(settings) {
  try {
    const explicitStreamName = String(settings.go2rtcStreamName || '').trim();
    const explicitApiUrl = String(settings.go2rtcApiUrl || '').trim();
    const rawSource = String(settings.sourceUrl || '').trim();
    const selectedType = String(settings.sourceType || 'auto').toLowerCase();
    let streamName = explicitStreamName;
    let api = explicitApiUrl ? new URL(explicitApiUrl) : null;
    if (rawSource) {
      const source = new URL(rawSource);
      if ((source.protocol === 'rtsp:' || source.protocol === 'rtsps:') && explicitApiUrl && selectedType !== 'generic_rtsp' && !streamName) {
        streamName = rawSource;
      } else if ((source.protocol === 'rtsp:' || source.protocol === 'rtsps:') && (source.port === '8554' || selectedType === 'go2rtc')) {
        streamName ||= decodeURIComponent(source.pathname.replace(/^\/+/, ''));
        api ||= new URL(`${window.location.protocol === 'https:' ? 'https:' : 'http:'}//${source.hostname}:1984`);
      } else if ((source.protocol === 'http:' || source.protocol === 'https:') && (/\/api\/(?:stream|frame)/.test(source.pathname) || /\/(?:stream|webrtc)\.html$/.test(source.pathname))) {
        streamName ||= source.searchParams.get('src') || '';
        api ||= new URL(source.origin);
      } else if (selectedType === 'go2rtc') {
        streamName ||= source.searchParams.get('src') || decodeURIComponent(source.pathname.replace(/^\/+/, ''));
        api ||= new URL(source.origin);
      }
    }
    if (!streamName || !api) return null;
    api.pathname = api.pathname.replace(/\/(?:api\/ws|api|stream\.html|webrtc\.html)?$/, '').replace(/\/$/, '');
    api.search = '';
    api.hash = '';
    return { streamName, api };
  } catch { return null; }
}

function go2rtcPlayerUrl(settings) {
  const parsed = parseGo2RtcSource(settings);
  if (!parsed) return '';
  const basePath = parsed.api.pathname === '/' ? '' : parsed.api.pathname.replace(/\/$/, '');
  const muted = settings.muted !== false;
  const page = muted ? 'webrtc.html' : 'stream.html';
  const url = new URL(`${basePath}/${page}`, parsed.api.origin);
  url.searchParams.set('src', parsed.streamName);
  if (muted) {
    url.searchParams.set('media', 'video');
  } else {
    url.searchParams.set('mode', String(settings.go2rtcMode || 'webrtc,webrtc/tcp,mse,hls,mjpeg,mp4'));
    url.searchParams.set('background', 'true');
    url.searchParams.set('width', '100%');
  }
  return url.toString();
}

function go2rtcWebSocketUrl(settings) {
  const parsed = parseGo2RtcSource(settings);
  if (!parsed) return '';
  const basePath = parsed.api.pathname === '/' ? '' : parsed.api.pathname.replace(/\/$/, '');
  const url = new URL(`${basePath}/api/ws`, parsed.api.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('src', parsed.streamName);
  return url.toString();
}

function go2rtcFallbackUrl(settings) {
  const parsed = parseGo2RtcSource(settings);
  if (!parsed) return '';
  const basePath = parsed.api.pathname === '/' ? '' : parsed.api.pathname.replace(/\/$/, '');
  const url = new URL(`${basePath}/api/stream.mp4`, parsed.api.origin);
  url.searchParams.set('src', parsed.streamName);
  return url.toString();
}

function renderCameraWidget(item, settings) {
  let type = inferCameraType(settings);
  if (type === 'generic_rtsp') type = 'rtsp';
  if (state.settings.onRemote && type === 'rtsp') {
    return `<div class="camera-placeholder"><div>${materialSymbol('videocam_off',42)}<strong>go2rtc required</strong><small>Remote Two and Remote 3 do not include FFmpeg. Configure this camera through go2rtc or run UC Dashboard externally.</small></div></div>`;
  }
  const streamUrl = `/api/camera-stream?widget=${encodeURIComponent(item.id)}`;
  const imageUrl = `/api/camera-image?widget=${encodeURIComponent(item.id)}&t=${Math.floor(Date.now() / (Math.max(2, Number(settings.refreshSeconds) || 10) * 1000))}`;
  const poster = settings.posterUrl ? escapeHtml(settings.posterUrl) : '';
  let media;
  const explicitGo2Rtc = Boolean(String(settings.go2rtcStreamName || '').trim() && String(settings.go2rtcApiUrl || '').trim());
  const parsedGo2Rtc = parseGo2RtcSource(settings);
  if (!settings.sourceUrl && !explicitGo2Rtc) {
    media = `<div class="camera-placeholder">${renderWidgetIcon(item, 'camera', 64)}<span>Configure a stream URL, or provide a go2rtc API URL and stream name.</span></div>`;
  } else if (type === 'image') {
    media = `<img src="${imageUrl}" alt="${escapeHtml(settings.title || 'Camera')}" style="object-fit:${escapeHtml(settings.objectFit || 'cover')}" referrerpolicy="no-referrer" data-camera-session data-camera-image data-widget-id="${escapeHtml(item.id)}" data-refresh-seconds="${escapeHtml(settings.refreshSeconds || 10)}">`;
  } else if (type === 'go2rtc' || parsedGo2Rtc) {
    const playerUrl = go2rtcPlayerUrl(settings);
    const fallbackUrl = go2rtcFallbackUrl(settings);
    const zoom = Math.max(100, Math.min(160, Number(settings.cameraZoom) || 112)) / 100;
    media = playerUrl ? `<div class="go2rtc-embed ${settings.controls ? 'show-controls' : 'hide-controls'} ${settings.muted !== false ? 'is-muted' : ''}" style="--camera-zoom:${zoom}" data-camera-session data-camera-widget-id="${escapeHtml(item.id)}"><iframe src="${escapeHtml(playerUrl)}" title="${escapeHtml(translateDashboardText(settings.title || 'Camera'))}" allow="autoplay; fullscreen; picture-in-picture" loading="eager" referrerpolicy="no-referrer" scrolling="no" frameborder="0" data-camera-native-frame></iframe><div class="camera-fallback-actions"><a href="${escapeHtml(playerUrl)}" target="_blank" rel="noopener">Open player</a>${fallbackUrl ? `<a href="${escapeHtml(fallbackUrl)}" target="_blank" rel="noopener">Open MP4 fallback</a>` : ''}</div></div>` : `<div class="camera-placeholder">${renderWidgetIcon(item, 'camera', 64)}<span>Unable to derive the go2rtc stream name or API URL.</span></div>`;
    type = 'go2rtc';
  } else if (type === 'rtsp') {
    media = `<uc-camera-player data-camera-session engine="ffmpeg" src="${streamUrl}" ${poster ? `poster="${poster}"` : ''} ${settings.autoplay ? 'autoplay' : ''} ${settings.muted ? 'muted' : ''} ${settings.controls ? 'controls' : ''} object-fit="${escapeHtml(settings.objectFit || 'cover')}"></uc-camera-player>`;
  } else {
    media = `<uc-camera-player data-camera-session engine="http" src="${streamUrl}" ${poster ? `poster="${poster}"` : ''} ${settings.autoplay ? 'autoplay' : ''} ${settings.muted ? 'muted' : ''} ${settings.controls ? 'controls' : ''} object-fit="${escapeHtml(settings.objectFit || 'cover')}"></uc-camera-player>`;
  }
  const heading = settings.showTitle ? `<div class="camera-heading camera-overlay-heading"><h3>${marquee(settings.title || 'Camera')}</h3><span>${type.toUpperCase()}</span></div>` : '';
  return `<div class="camera-widget camera-fullbleed"><div class="camera-frame">${media}${heading}</div></div>`;
}

function conditionValue(entity) {
  const attrs = entity?.attributes || {};
  return attrs.value ?? attrs.current_option ?? attrs.state ?? '';
}

function conditionMatches(settings) {
  const entity = state.entities.get(settings.conditionEntityId);
  if (!entity) return false;
  const actual = conditionValue(entity);
  const expected = settings.compareValue;
  let result = false;
  switch (settings.operator) {
    case 'not_equals': result = String(actual).toLowerCase() !== String(expected).toLowerCase(); break;
    case 'contains': result = String(actual).toLowerCase().includes(String(expected).toLowerCase()); break;
    case 'greater': result = Number(actual) > Number(expected); break;
    case 'less': result = Number(actual) < Number(expected); break;
    case 'truthy': result = ['on', 'true', 'active', 'open', 'playing', 'home'].includes(String(actual).toLowerCase()) || Boolean(actual) === true; break;
    case 'equals': default: result = String(actual).toLowerCase() === String(expected).toLowerCase();
  }
  return settings.invert ? !result : result;
}

function renderNestedWidget(item, options = {}) {
  const isSystem = item.kind === 'system';
  const entity = isSystem ? null : entityForItem(item);
  const visible = widgetConditionsMatch(item);
  const unavailableMode = widgetUnavailableMode(item);
  if ((!visible || unavailableMode === 'hide') && !state.editMode) { const fallback=normalizeFallback(item.settings?.fallback); if(fallback.mode==='hide'||fallback.mode==='none')return ''; }
  const standalone = Boolean(options.standalone);
  const standaloneCard = Boolean(options.standaloneCard);
  const depth = Math.max(1, Math.min(8, Number(options.depth) || 1));
  const columns = Math.max(1, Number(options.columns) || 1);
  const rows = Math.max(1, Number(options.rows) || 1);
  const width = Math.max(1, Math.min(columns, Number(item.w) || Math.min(3, columns)));
  const height = Math.max(1, Math.min(rows, Number(item.h) || Math.min(2, rows)));
  const layoutStyle = standalone ? `grid-column:span ${width};grid-row:span ${height}` : '';
  const isContainer = isSystem && CONTAINER_WIDGET_TYPES.has(item.widgetType);
  const tools = state.editMode && !state.renderingPreview && !options.suppressTools ? `<div class="widget-tools nested-tools">${isContainer ? `<button class="widget-tool" data-action="edit-container-contents" data-item-id="${escapeHtml(item.id)}" title="Edit contents">${materialSymbol('account_tree',15)}</button><button class="widget-tool" data-action="toggle-container-collapse" data-item-id="${escapeHtml(item.id)}" title="Collapse or expand">${materialSymbol(state.collapsedContainers.has(item.id) ? 'unfold_more' : 'unfold_less',15)}</button>` : ''}<button class="widget-tool" data-action="move-nested-widget" data-item-id="${escapeHtml(item.id)}" data-direction="-1" title="Move earlier">${materialSymbol('arrow_back',15)}</button><button class="widget-tool" data-action="move-nested-widget" data-item-id="${escapeHtml(item.id)}" data-direction="1" title="Move later">${materialSymbol('arrow_forward',15)}</button><button class="widget-tool" data-action="configure-widget" data-item-id="${escapeHtml(item.id)}" title="Customize ${escapeHtml(isSystem ? SYSTEM_WIDGETS[item.widgetType]?.label || item.widgetType : localName(entity?.name, entity?.entity_id || 'widget'))}">${icon('tune', 15)}</button><button class="widget-tool" data-action="copy-dashboard-widget" data-item-id="${escapeHtml(item.id)}" title="Copy widget">${materialSymbol('content_copy',15)}</button><button class="widget-tool danger" data-action="remove-widget" data-item-id="${escapeHtml(item.id)}" title="Remove">${icon('trash', 15)}</button></div>` : '';
  const nativeContent = isSystem ? renderSystemWidget(item, { nestedDepth: depth }) : renderEntityWidget(entity, item);
  const classes = standalone ? 'remote-entity conditional-child-widget' : standaloneCard ? 'remote-entity container-child-standalone' : 'nested-widget';
  const editorLabel = isSystem ? SYSTEM_WIDGETS[item.widgetType]?.label || item.widgetType : localName(entity?.name, entity?.entity_id || 'Entity');
  const childLayout = normalizeChildLayout(item.settings?.containerLayout);
  const childStyle = `${layoutStyle ? `${layoutStyle};` : ''}--child-width:${childLayout.width};--child-height:${childLayout.height};align-self:${childLayout.align};${responsiveStyle(item)};${widgetRuntimeStyle(item)}`;
  const collapsed = isContainer && state.editMode && state.collapsedContainers.has(item.id);
  const activeTarget = state.editContainerId ? findDashboardItem(state.editContainerId).item : null;
  const editClass = !state.editContainerId ? ''
    : item.id === state.editContainerId ? 'edit-container-active'
      : dashboardItemContains(item, state.editContainerId) ? 'edit-ancestor'
        : activeTarget && dashboardItemContains(activeTarget, item.id) ? 'edit-descendant'
          : 'edit-unrelated';
  return `<article class="${classes} nested-depth-${depth} ${visible ? '' : `widget-condition-hidden transition-${escapeHtml(item.settings?.visibilityTransition || 'fade')}`} ${unavailableMode ? `widget-unavailable-${escapeHtml(unavailableMode)}` : ''} ${collapsed ? 'container-collapsed' : ''} ${editClass} ${responsiveClasses(item)} ${isSystem ? 'system-widget' : 'entity-widget'} type-${escapeHtml(isSystem ? item.widgetType : entity?.entity_type || item.entityType || 'unknown')} text-overflow-${widgetTextMode(item)} ${item.settings?.showWidgetTitle === false ? 'widget-title-hidden' : ''} widget-content-align-${escapeHtml(item.settings?.contentAlignment || 'default')} ${item.settings?.showWidgetBackground === false ? 'widget-background-hidden' : ''} ${item.settings?.showWidgetBorder === false ? 'widget-border-hidden' : ''}" style="${childStyle}" draggable="${state.editMode}" data-widget-interaction="${widgetHasActions(item)}" data-nested-widget data-nesting-depth="${depth}" data-edit-label="${escapeHtml(editorLabel)}" data-item-id="${escapeHtml(item.id)}">${widgetCustomStyle(item)}${widgetElementLayoutStyle(item)}${tools}${(!visible||unavailableMode==='hide')?fallbackContent(item):composeWidgetContent(item, nativeContent)}${unavailableMode === 'overlay' ? '<div class="widget-unavailable-overlay">Unavailable</div>' : ''}</article>`;
}

function renderConditionalContainer(item, settings, context = {}) {
  const configured = Boolean(settings.conditionEntityId);
  const matches = configured ? conditionMatches(settings) : true;
  const runtimeHidden = configured && !matches && settings.hideWhenFalse;
  if (runtimeHidden && !state.editMode) return `<div class="conditional-hidden" aria-hidden="true"></div>`;
  const children = Array.isArray(settings.items) ? settings.items : [];
  if (state.editMode && state.collapsedContainers.has(item.id)) return `<div class="container-collapsed-placeholder">Conditional contents collapsed in edit mode · ${children.length} widgets</div>`;
  const columns = Math.max(1, Math.min(12, Number(item.w) || 8));
  const rows = Math.max(1, Number(item.h) || 5);
  const status = !configured ? 'Configure condition' : matches ? 'Condition matched' : 'Hidden at runtime';
  const editBadge = state.editMode && !state.renderingPreview ? `<div class="conditional-edit-badge">${materialSymbol('rule', 15)}<span>${marquee(settings.title || 'Conditional group')}</span><small>${escapeHtml(status)}</small></div>` : '';
  const body = !configured
    ? `<div class="conditional-message configure-message">${icon('tune', 28)}<span>Configure the condition and choose contained widgets.</span></div>`
    : matches || state.editMode
      ? `<div class="conditional-grid" style="--conditional-columns:${columns};--conditional-rows:${rows}">${children.length ? children.map((child) => renderNestedWidget(child, { standalone: true, columns, rows, depth: Math.max(0, Number(context.nestedDepth) || 0) + 1 })).join('') : '<div class="empty-inline">Add widgets to this condition in its settings.</div>'}</div>`
      : `<div class="conditional-message">${marquee(settings.falseText || 'Condition not met')}</div>`;
  return `<div class="conditional-container conditional-transparent ${matches ? 'condition-true' : 'condition-false'} ${!configured ? 'condition-unconfigured' : ''}">${editBadge}${body}</div>`;
}

function renderCustomCodeWidget(item, settings) {
  if (String(settings.customHtml || '').trim()) return '';
  return `<div class="custom-code-placeholder">${renderWidgetIcon(item, 'code_blocks', 48)}<strong>${escapeHtml(SYSTEM_WIDGETS[item.widgetType]?.label || 'Custom widget')}</strong><span>Open widget settings to add HTML, CSS or JavaScript.</span></div>`;
}

function encodeCommandAction(action) {
  return encodeURIComponent(JSON.stringify({ entityId: action.entityId, command: action.command, params: action.params || null }));
}

function decodeCommandAction(value) {
  try {
    const parsed = JSON.parse(decodeURIComponent(String(value || '')));
    if (!parsed?.entityId || !parsed?.command) return null;
    return parsed;
  } catch { return null; }
}

function commandActionsForEntity(entity) {
  const actions = [];
  const add = (command, label, params, iconName = actionIcon(command)) => actions.push({
    entityId: entity.entity_id, command, params, icon: iconName,
    label: `${localName(entity.name)} · ${label}`
  });
  switch (entity.entity_type) {
    case 'activity':
      add('start', 'Start'); add('stop', 'Stop');
      actions.push(...mappedActivityActions(entity).map((entry) => ({ ...entry, label: `${localName(entity.name)} · ${entry.label}` })));
      break;
    case 'media_player':
      add('previous', 'Previous'); add('play_pause', 'Play / pause'); add('next', 'Next'); add('mute_toggle', 'Mute toggle'); add('on', 'Power on'); add('off', 'Power off');
      break;
    case 'light':
      add('on', 'Turn on'); add('off', 'Turn off'); add('toggle', 'Toggle');
      break;
    case 'cover':
      add('open', 'Open'); add('stop', 'Stop'); add('close', 'Close');
      break;
    case 'button':
      add('push', 'Press');
      break;
    case 'climate': {
      add('on', 'Turn on'); add('off', 'Turn off');
      const modes = ['HEAT', 'COOL', 'FAN', 'AUTO'].filter((mode) => mode === 'AUTO' ? entity.features?.includes('heat') && entity.features?.includes('cool') : entity.features?.includes(mode.toLowerCase()));
      modes.forEach((mode) => add('hvac_mode', `Set ${mode.toLowerCase()}`, { hvac_mode: mode }, 'climate'));
      break;
    }
    case 'select': {
      const options = Array.isArray(entity.attributes?.options) ? entity.attributes.options : [];
      options.forEach((option) => add('select_option', `Select ${option}`, { option }, 'select'));
      break;
    }
  }
  return actions;
}

function allCommandActions() {
  return [...state.entities.values()]
    .filter((entity) => ENTITY_TYPES.includes(entity.entity_type))
    .flatMap(commandActionsForEntity)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function renderCommandButton(item, settings, forcedMode = '') {
  const action = decodeCommandAction(settings.commandAction);
  const entity = action ? state.entities.get(action.entityId) : null;
  const disabled = !action || !entity || isUnavailable(entity);
  const displayMode = ['text', 'icon', 'both'].includes(forcedMode) ? forcedMode : ['text', 'icon', 'both'].includes(settings.displayMode) ? settings.displayMode : 'both';
  const label = settings.label || (entity ? localName(entity.name) : 'Choose a command');
  const subtitle = settings.subtitle || (action ? metadataLabel(action.command) : 'Configure this widget');
  const fallbackIcon = action ? actionIcon(action.command) : 'command';
  const iconSize = displayMode === 'icon' ? Math.max(16, Math.min(160, Number(settings.iconSize) || 64)) : 44;
  return `<button class="command-button-widget display-${escapeHtml(displayMode)}" style="--command-icon-size:${iconSize}px" aria-label="${escapeHtml(label)}" title="${escapeHtml(subtitle ? `${label} · ${subtitle}` : label)}" ${action ? `data-command="${escapeHtml(action.command)}" data-entity-id="${escapeHtml(action.entityId)}"` : ''} ${action?.params ? `data-command-params="${escapeHtml(encodeURIComponent(JSON.stringify(action.params)))}"` : ''} ${settings.confirmCommand ? `data-confirm-command="${escapeHtml(label)}"` : ''} ${disabled ? 'disabled' : ''}>
    ${displayMode !== 'text' ? `<span class="command-button-icon">${renderWidgetIcon(item, fallbackIcon, iconSize)}</span>` : ''}
    ${displayMode !== 'icon' ? `<span class="command-button-copy"><strong>${marquee(label)}</strong>${subtitle ? `<small>${marquee(subtitle)}</small>` : ''}</span>` : ''}
  </button>`;
}


function mediaBrowserEntry(itemId) {
  if (!state.mediaBrowsers.has(itemId)) state.mediaBrowsers.set(itemId, { loading: false, loaded: false, error: '', media: null, pagination: null, path: [], page: 1, query: '', searchResults: null, cache: new Map(), requestToken: 0 });
  const browser = state.mediaBrowsers.get(itemId);
  if (!(browser.cache instanceof Map)) browser.cache = new Map();
  return browser;
}

function mediaBrowserCacheKey(settings, browser, searchQuery = '', path = browser.path) {
  const current = path.at(-1);
  return JSON.stringify({
    entityId: settings.mediaEntityId || '',
    mediaId: current && Object.prototype.hasOwnProperty.call(current, 'mediaId') ? current.mediaId : null,
    mediaType: current && Object.prototype.hasOwnProperty.call(current, 'mediaType') ? current.mediaType : null,
    page: browser.page || 1,
    limit: Math.max(10, Math.min(100, Number(settings.pageSize) || 12)),
    query: searchQuery || ''
  });
}


function normalizeMediaItem(value) {
  const source = value && typeof value === 'object' ? value : {};
  const has = (snake, camel) => Object.prototype.hasOwnProperty.call(source, snake) || Object.prototype.hasOwnProperty.call(source, camel);
  const read = (snake, camel, fallback = undefined) => Object.prototype.hasOwnProperty.call(source, snake) ? source[snake] : Object.prototype.hasOwnProperty.call(source, camel) ? source[camel] : fallback;
  const normalized = {
    title: String(source.title || 'Untitled'),
    subtitle: source.subtitle == null ? '' : String(source.subtitle),
    artist: source.artist == null ? '' : String(source.artist),
    album: source.album == null ? '' : String(source.album),
    thumbnail: source.thumbnail || source.image || '',
    duration: Number(source.duration) || 0,
    media_class: read('media_class', 'mediaClass', ''),
    can_browse: Boolean(read('can_browse', 'canBrowse', false)),
    can_play: Boolean(read('can_play', 'canPlay', false)),
    can_search: Boolean(read('can_search', 'canSearch', false))
  };
  if (has('media_id', 'mediaId')) normalized.media_id = read('media_id', 'mediaId');
  if (has('media_type', 'mediaType')) normalized.media_type = read('media_type', 'mediaType');
  const children = Array.isArray(source.items) ? source.items : Array.isArray(source.children) ? source.children : [];
  if (children.length) normalized.items = children.map(normalizeMediaItem);
  return normalized;
}

function normalizeMediaResult(result, search = false) {
  if (search) {
    const source = Array.isArray(result?.media) ? result.media : Array.isArray(result?.items) ? result.items : [];
    return source.map(normalizeMediaItem);
  }
  const source = result?.media && typeof result.media === 'object' ? result.media : result && typeof result === 'object' ? result : null;
  return source ? normalizeMediaItem(source) : null;
}

function decodeMediaBrowserPayload(value) {
  try { return JSON.parse(decodeURIComponent(String(value || ''))); } catch { return null; }
}

function mediaPathEntry(media) {
  const entry = { title: String(media?.title || 'Media') };
  if (media && Object.prototype.hasOwnProperty.call(media, 'mediaId')) entry.mediaId = media.mediaId;
  if (media && Object.prototype.hasOwnProperty.call(media, 'mediaType')) entry.mediaType = media.mediaType;
  return entry;
}

function mediaBrowserPayload(itemData) {
  const media = normalizeMediaItem(itemData);
  const payload = {
    title: media.title || '',
    canBrowse: Boolean(media.can_browse),
    canPlay: Boolean(media.can_play)
  };
  if (Object.prototype.hasOwnProperty.call(media, 'media_id')) payload.mediaId = media.media_id;
  if (Object.prototype.hasOwnProperty.call(media, 'media_type')) payload.mediaType = media.media_type;
  return escapeHtml(encodeURIComponent(JSON.stringify(payload)));
}

function mediaClassIcon(mediaClass) {
  return ({ directory: 'folder', album: 'album', artist: 'artist', playlist: 'queue_music', track: 'music_note', music: 'music_note', podcast: 'podcasts', episode: 'podcasts', radio: 'radio', movie: 'movie', tv_show: 'tv', video: 'video_library', app: 'apps', game: 'sports_esports', image: 'image' })[String(mediaClass || '').toLowerCase()] || 'audio_file';
}

function mediaBrowserThumbnail(media, showArtwork = true) {
  if (!showArtwork || !media?.thumbnail) return `<span class="media-browser-fallback">${materialSymbol(mediaClassIcon(media?.media_class), 34)}</span>`;
  const raw = String(media.thumbnail);
  if (raw.startsWith('icon://uc:')) return `<span class="media-browser-fallback">${materialSymbol(raw.slice('icon://uc:'.length) || mediaClassIcon(media.media_class), 34)}</span>`;
  const url = artworkUrl(raw);
  return url ? `<img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : `<span class="media-browser-fallback">${materialSymbol(mediaClassIcon(media.media_class), 34)}</span>`;
}

function renderMediaBrowser(item, settings, options = {}) {
  const browser = mediaBrowserEntry(item.id);
  const entity = state.entities.get(settings.mediaEntityId);
  const rootMedia = browser.media ? normalizeMediaItem(browser.media) : null;
  const items = (browser.searchResults || rootMedia?.items || []).map(normalizeMediaItem);
  const pagination = browser.pagination || {};
  const page = Math.max(1, Number(pagination.page || browser.page) || 1);
  const limit = Math.max(10, Number(pagination.limit || settings.pageSize) || 12);
  const count = Number(pagination.count);
  const pages = Number.isFinite(count) ? Math.max(1, Math.ceil(count / limit)) : Math.max(page, items.length >= limit ? page + 1 : page);
  const canSearch = Boolean(entity?.features?.includes?.('search_media') || rootMedia?.can_search);
  const currentFolder = browser.searchResults ? `Search: ${browser.query}` : browser.path.at(-1)?.title || rootMedia?.title || 'Media library';
  const canGoBack = Boolean(browser.searchResults || browser.path.length);
  const breadcrumbButtons = [`<button type="button" class="media-browser-crumb home" data-action="media-browser-root" data-item-id="${escapeHtml(item.id)}" title="Media library">${materialSymbol('home', 18)}</button>`, ...browser.path.map((entry, index) => `<button type="button" class="media-browser-crumb" data-action="media-browser-path" data-item-id="${escapeHtml(item.id)}" data-path-index="${index}" title="${escapeHtml(entry.title)}">${marquee(entry.title)}</button>`)].join(`<span class="media-browser-crumb-separator">${materialSymbol('chevron_right', 15)}</span>`);
  const renderEntry = (media, slide = false) => {
    const payload = mediaBrowserPayload(media);
    const primaryAction = media.can_browse ? 'media-browser-open' : 'media-browser-play';
    const detail = settings.showSubtitle !== false ? (media.subtitle || media.artist || media.album || media.media_class || '') : '';
    return `<article class="media-browser-item ${slide ? 'swiper-media-card' : ''} ${media.can_browse ? 'is-container' : 'is-playable'}">
      <button type="button" class="media-browser-item-main" data-action="${primaryAction}" data-item-id="${escapeHtml(item.id)}" data-media-payload="${payload}" ${!media.can_browse && !media.can_play ? 'disabled' : ''}>
        <span class="media-browser-artwork">${mediaBrowserThumbnail(media, settings.showArtwork !== false)}<span class="media-browser-kind">${materialSymbol(media.can_browse ? 'folder' : mediaClassIcon(media.media_class), 16)}</span></span>
        <span class="media-browser-copy"><strong>${marquee(media.title || 'Untitled')}</strong>${detail ? `<small>${marquee(detail)}</small>` : ''}</span>
      </button>
      <span class="media-browser-item-actions">${media.can_play ? `<button type="button" class="media-browser-quick-play" data-action="media-browser-play" data-item-id="${escapeHtml(item.id)}" data-media-payload="${payload}" title="Play ${escapeHtml(media.title || 'media')}">${materialSymbol('play_arrow', 19)}</button>` : ''}${media.can_browse ? `<button type="button" class="media-browser-open-indicator" data-action="media-browser-open" data-item-id="${escapeHtml(item.id)}" data-media-payload="${payload}" title="Open ${escapeHtml(media.title || 'folder')}">${materialSymbol('chevron_right', 20)}</button>` : ''}</span>
    </article>`;
  };

  let content;
  if (!settings.mediaEntityId) content = `<div class="media-browser-empty">${renderWidgetIcon(item, 'library_music', 54)}<span>Select a media-player entity in this widget's settings.</span></div>`;
  else if (browser.loading && !browser.loaded) content = `<div class="media-browser-empty"><span class="media-browser-spinner"></span><span>Loading media…</span></div>`;
  else if (browser.error) content = `<div class="media-browser-empty error">${materialSymbol('error', 42)}<span>${escapeHtml(browser.error)}</span><button data-action="media-browser-reload" data-item-id="${escapeHtml(item.id)}">Retry</button></div>`;
  else if (!items.length) content = '<div class="media-browser-empty"><span>No media items found.</span></div>';
  else if (String(settings.layoutMode || 'grid').startsWith('swiper_')) {
    const effect = String(settings.layoutMode).replace('swiper_', '');
    content = `<div class="media-browser-swiper-shell effect-${escapeHtml(effect)}"><swiper-container class="media-browser-swiper" init="false" data-media-swiper data-swiper-effect="${escapeHtml(effect)}" data-slides-per-view="${escapeHtml(settings.swiperSlidesPerView || 3)}" data-space-between="${escapeHtml(settings.swiperSpaceBetween || 18)}" data-centered="${settings.swiperCentered !== false}" data-loop="${Boolean(settings.swiperLoop)}" data-navigation="${settings.swiperNavigation !== false}" data-pagination="${settings.swiperPagination !== false}">${items.map((media) => `<swiper-slide><div class="swiper-slide-transform">${renderEntry(media, true)}</div></swiper-slide>`).join('')}</swiper-container></div>`;
  } else if (settings.layoutMode === 'list') {
    content = `<div class="media-browser-list">${items.map((media) => renderEntry(media)).join('')}</div>`;
  } else {
    content = `<div class="media-browser-grid" style="--media-browser-columns:${Math.max(2, Math.min(6, Number(settings.columns) || 4))}">${items.map((media) => renderEntry(media)).join('')}</div>`;
  }

  const search = settings.showSearch !== false && settings.mediaEntityId && canSearch ? `<div class="media-browser-search" data-media-browser-search data-item-id="${escapeHtml(item.id)}" role="search"><span>${materialSymbol('search', 19)}</span><input type="search" name="query" value="${escapeHtml(browser.query || '')}" placeholder="Search this library" autocomplete="off"><button type="button" data-action="media-browser-search" data-item-id="${escapeHtml(item.id)}" title="Search">${materialSymbol('arrow_forward', 19)}</button>${browser.searchResults ? `<button type="button" data-action="media-browser-clear-search" data-item-id="${escapeHtml(item.id)}" title="Clear search">${materialSymbol('close', 19)}</button>` : ''}</div>` : '';
  const paginationHtml = settings.mediaEntityId && !browser.error && items.length ? `<div class="media-browser-pagination"><button data-action="media-browser-page" data-item-id="${escapeHtml(item.id)}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>${materialSymbol('chevron_left', 20)}</button><span>Page ${page} of ${pages}</span><button data-action="media-browser-page" data-item-id="${escapeHtml(item.id)}" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>${materialSymbol('chevron_right', 20)}</button></div>` : '';
  return `<div class="media-browser-widget ${options.modal ? 'media-browser-modal-content' : ''} layout-${escapeHtml(settings.layoutMode || 'grid')} ${browser.loading ? 'is-loading' : ''}" data-media-browser data-media-browser-id="${escapeHtml(item.id)}">
    <div class="system-widget-heading"><h3>${marquee(settings.title || 'Media')}</h3><span>${entity ? escapeHtml(localName(entity.name)) : 'Configure'}</span></div>
    <div class="media-browser-toolbar"><button type="button" class="media-browser-back" data-action="media-browser-back" data-item-id="${escapeHtml(item.id)}" ${canGoBack ? '' : 'disabled'} title="Back">${materialSymbol('arrow_back', 20)}</button><div class="media-browser-location"><strong>${marquee(currentFolder)}</strong><div class="media-browser-breadcrumbs">${breadcrumbButtons}</div></div>${search}</div>
    <div class="media-browser-content" data-media-layout="${escapeHtml(settings.layoutMode || 'grid')}">${content}${browser.loading && browser.loaded ? `<div class="media-browser-loading-overlay"><span class="media-browser-spinner"></span></div>` : ''}</div>
    ${paginationHtml}
  </div>`;
}

function mediaBrowserDomNodes(itemId) {
  return [...document.querySelectorAll('[data-media-browser-id]')].filter((node) => node.dataset.mediaBrowserId === itemId);
}

function setMediaBrowserBusy(itemId, busy) {
  const browser = mediaBrowserEntry(itemId);
  for (const node of mediaBrowserDomNodes(itemId)) {
    node.classList.toggle('is-loading', busy);
    node.setAttribute('aria-busy', busy ? 'true' : 'false');
    const content = node.querySelector('.media-browser-content');
    if (!content) continue;
    const existing = content.querySelector(':scope > .media-browser-loading-overlay');
    if (!busy) { existing?.remove(); continue; }
    if (!browser.loaded) {
      setLocalizedDashboardHtml(content, '<div class="media-browser-empty"><span class="media-browser-spinner"></span><span>Loading media…</span></div>');
      continue;
    }
    if (!existing) content.insertAdjacentHTML('beforeend', '<div class="media-browser-loading-overlay"><span class="media-browser-spinner"></span></div>');
  }
}

function renderMediaBrowserRegion(itemId) {
  const context = getMediaBrowserContext(itemId);
  if (!context) return;
  const nodes = mediaBrowserDomNodes(itemId);
  if (!nodes.length) return;
  for (const node of nodes) {
    const contentScroll = node.querySelector('.media-browser-content')?.scrollTop || 0;
    const modalBody = node.closest('.modal-body');
    const modalScroll = modalBody?.scrollTop || 0;
    const focusedSearch = node.contains(document.activeElement) && document.activeElement?.matches?.('[data-media-browser-search] input');
    const selectionStart = focusedSearch ? document.activeElement.selectionStart : null;
    const template = document.createElement('template');
    template.innerHTML = localizedDashboardMarkup(renderMediaBrowser(context.item, context.settings, { modal: context.modal }).trim());
    const replacement = template.content.firstElementChild;
    if (!replacement) continue;
    node.replaceWith(replacement);
    const nextContent = replacement.querySelector('.media-browser-content');
    if (nextContent) nextContent.scrollTop = contentScroll;
    if (modalBody) modalBody.scrollTop = modalScroll;
    requestAnimationFrame(() => {
      updateMarquees(replacement);
      initializeMediaSwipers(replacement);
      if (focusedSearch) {
        const search = replacement.querySelector('[data-media-browser-search] input');
        if (search) {
          try { search.focus({ preventScroll: true }); } catch { search.focus(); }
          if (Number.isInteger(selectionStart)) search.setSelectionRange(selectionStart, selectionStart);
        }
      }
    });
  }
}

async function loadMediaBrowser(itemId, options = {}) {
  const context = getMediaBrowserContext(itemId);
  if (!context) return;
  const { settings } = context;
  const browser = mediaBrowserEntry(itemId);
  if (!settings.mediaEntityId) return;

  let targetPath = [...browser.path];
  const pathEntry = options.pathEntry;
  if (options.root) targetPath = [];
  else if (Number.isInteger(options.pathIndex)) targetPath = options.pathIndex < 0 ? [] : targetPath.slice(0, options.pathIndex + 1);
  else if (pathEntry) {
    const hasAddress = Object.prototype.hasOwnProperty.call(pathEntry, 'mediaId') || Object.prototype.hasOwnProperty.call(pathEntry, 'mediaType');
    if (!hasAddress) {
      toast('This media folder did not provide a browse identifier', 'error');
      return;
    }
    targetPath.push(pathEntry);
  }

  const pathChanges = Boolean(options.root || pathEntry || Number.isInteger(options.pathIndex));
  const targetPage = Math.max(1, Number(options.page) || 1);
  const searchQuery = Object.prototype.hasOwnProperty.call(options, 'searchQuery')
    ? String(options.searchQuery || '').trim()
    : (pathChanges ? '' : browser.searchResults ? browser.query : '');
  const cacheKey = mediaBrowserCacheKey(settings, { ...browser, page: targetPage }, searchQuery, targetPath);
  const cached = browser.cache.get(cacheKey);
  const token = ++browser.requestToken;

  if (cached && !options.force) {
    browser.path = targetPath;
    browser.page = targetPage;
    browser.error = '';
    browser.errorStatus = 0;
    browser.loaded = true;
    browser.loading = false;
    browser.pagination = cached.pagination || null;
    if (searchQuery) { browser.query = searchQuery; browser.searchResults = cached.media || []; }
    else { browser.query = ''; browser.searchResults = null; browser.media = cached.media || null; }
    renderMediaBrowserRegion(itemId);
    return;
  }

  browser.loading = true;
  browser.error = '';
  browser.errorStatus = 0;
  if (!options.silent) setMediaBrowserBusy(itemId, true);
  const current = targetPath.at(-1);
  const endpoint = searchQuery ? '/api/media/search' : '/api/media/browse';
  const payload = {
    entityId: settings.mediaEntityId,
    page: targetPage,
    limit: Math.max(10, Math.min(100, Number(settings.pageSize) || 12)),
    ...(current && Object.prototype.hasOwnProperty.call(current, 'mediaId') ? { mediaId: current.mediaId } : {}),
    ...(current && Object.prototype.hasOwnProperty.call(current, 'mediaType') ? { mediaType: current.mediaType } : {})
  };
  if (searchQuery) payload.query = searchQuery;

  try {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const requestError = new Error(result.error || `Media request failed (${response.status})`);
      requestError.status = response.status;
      requestError.details = result;
      throw requestError;
    }
    if (token !== browser.requestToken) return;
    const cachedValue = { media: normalizeMediaResult(result, Boolean(searchQuery)), pagination: result.pagination || null, savedAt: Date.now() };
    browser.cache.set(cacheKey, cachedValue);
    if (browser.cache.size > 80) browser.cache.delete(browser.cache.keys().next().value);
    browser.path = targetPath;
    browser.page = targetPage;
    if (searchQuery) { browser.query = searchQuery; browser.searchResults = cachedValue.media; }
    else { browser.query = ''; browser.searchResults = null; browser.media = cachedValue.media; }
    browser.pagination = cachedValue.pagination;
    browser.errorStatus = 0;
    browser.loaded = true;
  } catch (error) {
    if (token === browser.requestToken) {
      browser.error = error.message || String(error);
      browser.errorStatus = Number(error.status || 0);
      // Mark the request as completed even when it failed. This prevents every
      // subsequent entity/runtime render from issuing the same request again.
      browser.loaded = true;
    }
  } finally {
    if (token === browser.requestToken) {
      browser.loading = false;
      renderMediaBrowserRegion(itemId);
    }
  }
}

function initializeMediaSwipers(root = document) {
  root.querySelectorAll?.('swiper-container[data-media-swiper]').forEach((swiper) => {
    if (swiper.dataset.initialized === 'true') return;
    const effect = ['slide','cards','coverflow'].includes(swiper.dataset.swiperEffect) ? swiper.dataset.swiperEffect : 'coverflow';
    const cards = effect === 'cards';
    const params = {
      effect,
      slidesPerView: cards ? 1 : Math.max(1, Math.min(6, Number(swiper.dataset.slidesPerView) || 3)),
      spaceBetween: Math.max(0, Math.min(80, Number(swiper.dataset.spaceBetween) || 18)),
      centeredSlides: swiper.dataset.centered !== 'false',
      loop: swiper.dataset.loop === 'true' && swiper.children.length > 2,
      grabCursor: true,
      observer: true,
      observeParents: true,
      observeSlideChildren: true,
      resizeObserver: true,
      updateOnWindowResize: true,
      watchSlidesProgress: true,
      roundLengths: true,
      threshold: 10,
      touchAngle: 40,
      preventClicks: false,
      preventClicksPropagation: false,
      touchStartPreventDefault: false,
      keyboard: { enabled: true, onlyInViewport: true },
      navigation: swiper.dataset.navigation === 'true',
      pagination: swiper.dataset.pagination === 'true' ? { clickable: true } : false,
      cardsEffect: { slideShadows: false, perSlideOffset: 8, perSlideRotate: 0 },
      coverflowEffect: { rotate: 18, stretch: 0, depth: 90, modifier: 1, scale: .92, slideShadows: false },
      injectStyles: [`
        :host { --swiper-theme-color:#f4f4f4; --swiper-navigation-size:22px; }
        .swiper { overflow:visible; padding:8px 8px 34px; }
        .swiper-button-next,.swiper-button-prev { width:38px; height:38px; border:1px solid rgba(255,255,255,.18); border-radius:50%; background:rgba(8,8,8,.82); backdrop-filter:blur(10px); }
        .swiper-button-next::after,.swiper-button-prev::after { font-size:17px; font-weight:700; }
        .swiper-pagination { bottom:4px !important; }
        .swiper-pagination-bullet { width:7px; height:7px; background:#858585; opacity:.48; }
        .swiper-pagination-bullet-active { width:22px; border-radius:5px; background:#f4f4f4; opacity:1; }
      `]
    };
    Object.assign(swiper, params);
    swiper.initialize?.();
    swiper.dataset.initialized = 'true';
  });
}


function cleanupWidgetCarouselObservers(root = app) {
  root.querySelectorAll?.('swiper-container[data-widget-carousel]').forEach((swiper) => {
    try { swiper._ucResizeObserver?.disconnect(); } catch {}
    swiper._ucResizeObserver = null;
  });
}

function refreshWidgetCarouselGeometry(swiper) {
  if (!swiper?.isConnected) return;
  const instance = swiper.swiper;
  if (!instance) return;
  try {
    instance.updateSize?.();
    instance.updateSlides?.();
    instance.updateProgress?.();
    instance.updateSlidesClasses?.();
    instance.update?.();
  } catch {}
}

function scheduleWidgetCarouselGeometry(swiper) {
  requestAnimationFrame(() => requestAnimationFrame(() => refreshWidgetCarouselGeometry(swiper)));
}

function initializeWidgetCarousels(root = document) {
  root.querySelectorAll?.('swiper-container[data-widget-carousel]').forEach((swiper) => {
    if (swiper.dataset.initialized === 'true') return;
    const requestedEffect = ['slide','cards','coverflow'].includes(swiper.dataset.swiperEffect) ? swiper.dataset.swiperEffect : 'slide';
    const effect = requestedEffect === 'cards' ? 'slide' : requestedEffect;
    const count = swiper.children.length;
    const compactViewport = window.innerWidth < 600;
    const internalPadding = swiper.dataset.pagination === 'true' ? '0 0 30px' : '0';
    Object.assign(swiper, {
      effect,
      initialSlide: Math.max(0, Number(swiper.dataset.initialSlide) || 0),
      slidesPerView: 1,
      slidesPerGroup: 1,
      spaceBetween: 0,
      centeredSlides: false,
      loop: swiper.dataset.loop === 'true' && count > 2,
      grabCursor: true,
      observer: true,
      observeParents: true,
      observeSlideChildren: true,
      resizeObserver: true,
      updateOnWindowResize: true,
      watchSlidesProgress: true,
      roundLengths: true,
      threshold: 6,
      shortSwipes: true,
      longSwipes: true,
      longSwipesRatio: .2,
      resistanceRatio: .72,
      preventClicks: true,
      preventClicksPropagation: true,
      touchStartPreventDefault: false,
      noSwiping: true,
      noSwipingSelector: 'input,select,textarea,[contenteditable="true"],.widget-tools',
      navigation: swiper.dataset.navigation === 'true',
      pagination: swiper.dataset.pagination === 'true' ? { clickable: true } : false,
      autoplay: swiper.dataset.autoplay === 'true' && !state.editMode ? { delay: Math.max(2000,Number(swiper.dataset.autoplayDelay)||8000), disableOnInteraction: false, pauseOnMouseEnter: true } : false,
      coverflowEffect: { rotate: compactViewport ? 6 : 12, stretch: 0, depth: compactViewport ? 42 : 70, modifier: 1, scale: .94, slideShadows: false },
      injectStyles: [`:host{display:block;width:100%;max-width:100%;min-width:0;overflow:hidden;contain:layout paint;--swiper-theme-color:#f4f4f4;--swiper-navigation-size:${compactViewport ? 16 : 20}px}.swiper{box-sizing:border-box;width:100%;height:100%;max-width:100%;min-width:0;padding:${internalPadding};overflow:hidden}.swiper-wrapper{width:100%;max-width:100%;min-width:0}.swiper-slide{box-sizing:border-box;width:100%!important;max-width:100%;min-width:100%;height:auto;min-height:0;overflow:hidden;flex:0 0 100%}.swiper-button-next,.swiper-button-prev{width:${compactViewport ? 30 : 38}px;height:${compactViewport ? 30 : 38}px;border:1px solid rgba(255,255,255,.2);border-radius:50%;background:rgba(0,0,0,.86)}.swiper-button-next{right:${compactViewport ? 0 : 4}px}.swiper-button-prev{left:${compactViewport ? 0 : 4}px}.swiper-button-next::after,.swiper-button-prev::after{font-size:${compactViewport ? 13 : 16}px}.swiper-pagination{bottom:4px!important}.swiper-pagination-bullet{background:#777}.swiper-pagination-bullet-active{width:20px;border-radius:5px;background:#eee}`]
    });
    swiper.addEventListener('swiperslidechange', () => {
      const itemId = swiper.dataset.carouselItemId;
      const realIndex = Number(swiper.swiper?.realIndex ?? swiper.swiper?.activeIndex ?? 0);
      state.carouselIndexes.set(itemId, realIndex);
      const counter = swiper.closest('[data-carousel-item]')?.querySelector('[data-carousel-counter]');
      if (counter) counter.textContent = `${realIndex + 1} / ${count}`;
    });
    swiper.initialize?.();
    swiper.dataset.initialized = 'true';
    scheduleWidgetCarouselGeometry(swiper);
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(() => scheduleWidgetCarouselGeometry(swiper));
      observer.observe(swiper);
      const stage = swiper.closest('.carousel-stage');
      if (stage) observer.observe(stage);
      swiper._ucResizeObserver = observer;
    }
  });
}

function ensureVisibleMediaBrowsers() {
  app.querySelectorAll('[data-media-browser]').forEach((node) => {
    const itemId = node.dataset.mediaBrowserId;
    const browser = mediaBrowserEntry(itemId);
    const { item } = findDashboardItem(itemId);
    const entityId = item?.settings?.mediaEntityId || '';
    if (browser.entityId !== entityId) {
      state.mediaBrowsers.set(itemId, { loading: false, loaded: false, error: '', media: null, pagination: null, path: [], page: 1, query: '', searchResults: null, cache: new Map(), requestToken: 0, entityId });
    }
    const current = mediaBrowserEntry(itemId);
    if (entityId && !current.loading && !current.loaded && !current.error) loadMediaBrowser(itemId);
  });
}

function renderTabContainer(item, settings, context = {}) {
  const tabs = Array.isArray(settings.tabs) ? settings.tabs : [];
  if (state.editMode && state.collapsedContainers.has(item.id)) return `<div class="container-collapsed-placeholder">Tab contents collapsed in edit mode · ${tabs.length} tabs</div>`;
  const active = tabs.find((tab) => tab.id === settings.activeTabId) || tabs[0];
  return `<div class="tab-container-widget"><div class="system-widget-heading"><h3>${marquee(settings.title || 'Tabs')}</h3><span>${tabs.length}</span></div><div class="tab-container-tabs">${tabs.map((tab) => `<button class="${tab.id === active?.id ? 'active' : ''}" style="--tab-accent:${escapeHtml(tab.color || '#d0d0d0')}" data-action="select-container-tab" data-item-id="${escapeHtml(item.id)}" data-tab-id="${escapeHtml(tab.id)}">${tab.showIcon !== false ? renderChosenIcon(tab.icon || 'tab',20,'tab') : ''}${tab.showLabel !== false ? marquee(tab.name || 'Tab') : ''}</button>`).join('')}</div><div class="tab-container-panel" style="--tab-content-columns:${Math.max(1,Math.min(4,Number(active?.columns)||1))}">${active?.items?.length ? active.items.map((child) => renderNestedWidget(child, { depth: Math.max(0, Number(context.nestedDepth) || 0) + 1 })).join('') : '<div class="empty-inline">Assign widgets to this tab in settings.</div>'}</div></div>`;
}

function carouselIndex(item, count) {
  const stored = state.carouselIndexes.get(item.id);
  const configured = Number(item.settings?.activeIndex) || 0;
  const value = Number.isInteger(stored) ? stored : configured;
  return count ? ((value % count) + count) % count : 0;
}

function setCarouselIndex(itemId, index) {
  const { item } = findDashboardItem(itemId);
  const count = item?.settings?.items?.length || 0;
  if (!count) return;
  state.carouselIndexes.set(itemId, ((Number(index) % count) + count) % count);
  state.carouselNextAt.set(itemId, Date.now() + Math.max(2, Number(item.settings.intervalSeconds) || 8) * 1000);
  render();
}

function renderCarouselContainer(item, settings, context = {}) {
  const children = Array.isArray(settings.items) ? settings.items : [];
  if (state.editMode && state.collapsedContainers.has(item.id)) return `<div class="container-collapsed-placeholder">Carousel contents collapsed in edit mode · ${children.length} slides</div>`;
  const index = carouselIndex(item, children.length);
  const transparent = settings.containerStyle === false;
  const headingVisible = settings.showWidgetTitle !== false || settings.showCounter !== false;
  const heading = headingVisible ? `<div class="system-widget-heading">${settings.showWidgetTitle === false ? '<span></span>' : `<h3>${marquee(settings.title || 'Carousel')}</h3>`}${settings.showCounter === false ? '' : `<span data-carousel-counter>${children.length ? `${index + 1} / ${children.length}` : 'Empty'}</span>`}</div>` : '';
  const effect = ['slide','cards','coverflow'].includes(settings.swiperEffect) ? settings.swiperEffect : 'slide';
  const slides = children.length ? `<swiper-container class="widget-carousel-swiper effect-${effect}" init="false" data-widget-carousel data-carousel-item-id="${escapeHtml(item.id)}" data-swiper-effect="${effect}" data-slides-per-view="${escapeHtml(settings.swiperSlidesPerView || 1)}" data-space-between="${escapeHtml(settings.swiperSpaceBetween || 12)}" data-centered="${settings.swiperCentered !== false}" data-loop="${Boolean(settings.swiperLoop)}" data-navigation="${settings.showArrows !== false}" data-pagination="${settings.showDots !== false}" data-autoplay="${Boolean(settings.autoplay)}" data-autoplay-delay="${Math.max(2,Number(settings.intervalSeconds)||8)*1000}" data-initial-slide="${index}">${children.map((child) => `<swiper-slide style="box-sizing:border-box;width:100%;max-width:100%;min-width:100%;flex:0 0 100%;overflow:hidden">${renderNestedWidget(child, { standaloneCard: transparent, depth: Math.max(0, Number(context.nestedDepth) || 0) + 1 })}</swiper-slide>`).join('')}</swiper-container>` : '<div class="empty-inline">Assign widgets to this carousel in settings.</div>';
  return `<div class="carousel-container-widget swiper-carousel-container ${transparent ? 'transparent-container-style' : ''} ${headingVisible ? '' : 'without-heading'}" data-carousel-item="${escapeHtml(item.id)}">${heading}<div class="carousel-stage">${slides}</div></div>`;
}

function advanceAutoplayCarousels() {
  if (document.querySelector('[data-widget-carousel]')) return;
  if (!state.config || state.editMode || state.screensaverActive) return;
  const now = Date.now();
  app.querySelectorAll('[data-carousel-item]').forEach((node) => {
    const { item } = findDashboardItem(node.dataset.carouselItem);
    if (!item?.settings?.autoplay || (item.settings.items?.length || 0) < 2) return;
    const nextAt = state.carouselNextAt.get(item.id) || now + Math.max(2, Number(item.settings.intervalSeconds) || 8) * 1000;
    if (!state.carouselNextAt.has(item.id)) state.carouselNextAt.set(item.id, nextAt);
    if (now >= nextAt) setCarouselIndex(item.id, carouselIndex(item, item.settings.items.length) + 1);
  });
}

function renderEntityGroup(item, settings, context = {}) {
  const children = Array.isArray(settings.items) ? settings.items : [];
  const columns = Math.max(1, Math.min(4, Number(settings.columns) || 2));
  const transparent = settings.containerStyle === false;
  const collapsed = state.editMode && state.collapsedContainers.has(item.id);
  return `<div class="entity-group-widget ${transparent ? 'transparent-container-style' : ''} ${settings.showHeading === false ? 'without-heading' : ''} orientation-${escapeHtml(settings.orientation || 'grid')} ${settings.wrap===false?'no-wrap':''}" style="--entity-group-gap:${Math.max(0,Number(settings.gap)||12)}px;--entity-group-padding:${Math.max(0,Number(settings.padding)||0)}px">${settings.showHeading === false ? '' : `<div class="system-widget-heading"><h3>${marquee(settings.title || 'Entity group')}</h3><span>${children.length}</span></div>`}${collapsed ? '<div class="container-collapsed-placeholder">Contents collapsed in edit mode</div>' : `<div class="entity-group-grid" style="--entity-group-columns:${columns}">${children.length ? children.map((child) => renderNestedWidget(child, { standaloneCard: transparent, depth: Math.max(0, Number(context.nestedDepth) || 0) + 1 })).join('') : '<div class="empty-inline">Assign widgets to this group in settings.</div>'}</div>`}</div>`;
}

function gaugeReading(settings) {
  const entity = state.entities.get(settings.entityId);
  if (!entity) return { entity: null, value: NaN, unit: settings.unit || '' };
  const attrs = entity.attributes || {};
  const key = String(settings.valueAttribute || '').trim();
  const raw = key ? attrs[key] : (attrs.value ?? attrs.state);
  return { entity, value: Number(raw), unit: settings.unit || attrs.unit || entity.options?.custom_unit || '' };
}

function renderGauge(item, settings) {
  const reading = gaugeReading(settings);
  const min = Number(settings.min) || 0;
  const maxCandidate = Number(settings.max);
  const max = Number.isFinite(maxCandidate) && maxCandidate > min ? maxCandidate : min + 100;
  const value = Number.isFinite(reading.value) ? reading.value : min;
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const circumference = 2 * Math.PI * 52;
  const dash = circumference * ratio;
  const decimals = Math.max(0, Math.min(4, Number(settings.decimals) || 0));
  const display = Number.isFinite(reading.value) ? reading.value.toFixed(decimals) : '—';
  return `<div class="gauge-widget" style="--gauge-color:${escapeHtml(settings.color || '#d0d0d0')};--gauge-track:${escapeHtml(settings.trackColor || '#2a2a2a')}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="gauge-track" cx="60" cy="60" r="52"></circle><circle class="gauge-value" cx="60" cy="60" r="52" stroke-dasharray="${dash} ${circumference - dash}"></circle></svg><div class="gauge-copy">${settings.showName !== false ? `<small>${marquee(settings.title || (reading.entity ? localName(reading.entity.name) : 'Gauge'))}</small>` : ''}${settings.showValue !== false ? `<strong>${escapeHtml(display)}</strong>` : ''}${settings.showUnit !== false && reading.unit ? `<span>${marquee(reading.unit)}</span>` : ''}</div><div class="gauge-range"><span>${escapeHtml(min)}</span><span>${escapeHtml(max)}</span></div></div>`;
}


function routineActionButton(item, action, settings) {
  const decoded = decodeCommandAction(action.commandAction);
  const entity = decoded ? state.entities.get(decoded.entityId) : null;
  const disabled = !decoded || !entity || isUnavailable(entity);
  const detail = settings.showLastRun !== false && action.lastRunAt
    ? relativeTime(action.lastRunAt)
    : settings.showState !== false && entity ? translatedEntityState(entity) : '';
  return `<button class="routine-action" data-action="run-routine-action" data-item-id="${escapeHtml(item.id)}" data-routine-id="${escapeHtml(action.id)}" ${disabled ? 'disabled' : ''}><span>${renderChosenIcon(action.icon || 'play_arrow',28,'play_arrow')}</span><strong>${marquee(action.label || 'Action')}</strong>${detail ? `<small>${marquee(detail)}</small>` : ''}</button>`;
}

function renderSceneRoutine(item, settings) {
  const actions = Array.isArray(settings.routineActions) ? settings.routineActions : [];
  return `<div class="scene-routine-widget"><div class="system-widget-heading"><h3>${marquee(settings.title || 'Scenes & routines')}</h3><span>${actions.length}</span></div><div class="routine-grid" style="--routine-columns:${Math.max(1,Math.min(4,Number(settings.columns)||2))}">${actions.length ? actions.map((action) => routineActionButton(item, action, settings)).join('') : '<div class="empty-inline">Add commands in widget settings.</div>'}</div></div>`;
}

function selectedEntityIds(value) { return String(value || '').split(',').map((id) => id.trim()).filter(Boolean); }
function entityAttributeValue(entity, attribute = '') { return attribute ? entity?.attributes?.[attribute] : conditionValue(entity); }
function entityChangedAt(entity) {
  const raw = entity?.last_changed || entity?.lastChanged || entity?.updated_at || entity?.updatedAt || 0;
  if (typeof raw === 'number') return raw;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(raw || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}
function relativeTime(timestamp) {
  const value = Number(timestamp); if (!value) return '';
  const delta = Math.max(0, Date.now() - value); const seconds = Math.round(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`; const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`; const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`; return `${Math.round(hours / 24)}d ago`;
}

function renderEntityTable(item, settings) {
  const filter = String(settings.filter || '').trim().toLowerCase();
  let entities = selectedEntityIds(settings.entityIds).map((id) => state.entities.get(id)).filter(Boolean)
    .filter((entity) => !filter || `${localName(entity.name)} ${entity.entity_id} ${entityState(entity)}`.toLowerCase().includes(filter));
  const direction = settings.sortDirection === 'desc' ? -1 : 1;
  const sortBy = settings.sortBy || 'name';
  entities.sort((a,b) => {
    const av = sortBy === 'state' ? entityAttributeValue(a, settings.attribute) : sortBy === 'changed' ? entityChangedAt(a) : localName(a.name);
    const bv = sortBy === 'state' ? entityAttributeValue(b, settings.attribute) : sortBy === 'changed' ? entityChangedAt(b) : localName(b.name);
    return String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric:true }) * direction;
  });
  const row = (entity) => `<button class="entity-table-row" data-action="show-entity-info" data-entity-id="${escapeHtml(entity.entity_id)}">${settings.showIcon !== false ? `<span>${renderWidgetIcon({settings:{}},entity.entity_type,22)}</span>` : ''}<strong>${marquee(localName(entity.name))}</strong>${settings.showState !== false ? `<em>${marquee(localizedValue(entityAttributeValue(entity,settings.attribute), '—'))}</em>` : ''}${settings.showLastChanged !== false ? `<small>${escapeHtml(relativeTime(entityChangedAt(entity)))}</small>` : ''}</button>`;
  let rows = '';
  const groupBy = settings.groupBy || 'none';
  if (groupBy === 'none') rows = entities.map(row).join('');
  else {
    const groups = new Map();
    for (const entity of entities) {
      const key = groupBy === 'state' ? translatedEntityState(entity) : groupBy === 'device_class' ? String(entity.attributes?.device_class || 'Other') : TYPE_LABELS[entity.entity_type] || entity.entity_type;
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push(entity);
    }
    rows = [...groups.entries()].map(([key, values]) => `<section class="entity-table-group"><h4>${escapeHtml(key)}<span>${values.length}</span></h4>${values.map(row).join('')}</section>`).join('');
  }
  return `<div class="entity-table-widget ${settings.compact ? 'compact' : ''}"><div class="system-widget-heading"><h3>${marquee(settings.title || 'Entities')}</h3><span>${entities.length}</span></div><div class="entity-table-list">${rows || '<div class="empty-inline">Select entities or adjust the filter.</div>'}</div></div>`;
}

function statisticValues(settings) {
  return selectedEntityIds(settings.entityIds).map((id) => state.entities.get(id)).filter(Boolean).map((entity) => ({ entity, raw: entityAttributeValue(entity, settings.attribute), value: Number(entityAttributeValue(entity, settings.attribute)) }));
}
function renderCounterStatistics(item, settings) {
  const entries = statisticValues(settings); const operation = settings.operation || 'count_matching'; let value = 0;
  if (operation === 'count_matching') value = entries.filter((entry) => compareRule(entry.raw, settings.operator, settings.compareValue)).length;
  else if (operation === 'percent_matching') value = entries.length ? entries.filter((entry) => compareRule(entry.raw, settings.operator, settings.compareValue)).length / entries.length * 100 : 0;
  else { const numbers = entries.map((entry) => entry.value).filter(Number.isFinite); if (operation === 'sum') value = numbers.reduce((a,b)=>a+b,0); else if (operation === 'average') value = numbers.length ? numbers.reduce((a,b)=>a+b,0)/numbers.length : 0; else if (operation === 'min') value = numbers.length ? Math.min(...numbers) : 0; else if (operation === 'max') value = numbers.length ? Math.max(...numbers) : 0; }
  const decimals = Math.max(0,Math.min(4,Number(settings.decimals)||0)); const unit = settings.unit || (operation === 'percent_matching' ? '%' : '');
  return `<div class="counter-stat-widget"><div class="system-widget-heading"><h3>${marquee(settings.title || 'Statistic')}</h3><span>${entries.length} ${translateDashboardValue('sources')}</span></div><div class="counter-stat-value"><strong>${Number(value).toFixed(decimals)}</strong><span>${escapeHtml(unit)}</span></div>${settings.showBreakdown !== false ? `<div class="counter-stat-breakdown">${entries.slice(0,8).map(({entity,raw}) => `<span><b>${marquee(localName(entity.name))}</b><em>${marquee(localizedValue(raw,'—'))}</em></span>`).join('')}</div>` : ''}</div>`;
}

function timerStorageKey(itemId) { return `uc-wall-timer:${itemId}`; }
function timerState(item, settings) {
  if (!state.localTimers.has(item.id)) {
    let stored = null; try { stored = JSON.parse(localStorage.getItem(timerStorageKey(item.id)) || 'null'); } catch {}
    const duration = Math.max(1, Number(stored?.duration) || Number(settings.durationSeconds) || 300);
    state.localTimers.set(item.id, { mode: stored?.mode || settings.mode || 'countdown', duration, elapsed: Math.max(0,Number(stored?.elapsed)||0), startedAt: Number(stored?.startedAt)||0, running: Boolean(stored?.running), finished:Boolean(stored?.finished) });
  }
  return state.localTimers.get(item.id);
}
function timerElapsed(timer) { return timer.elapsed + (timer.running && timer.startedAt ? Math.max(0,(Date.now()-timer.startedAt)/1000) : 0); }
function persistTimer(itemId,timer) {
  const elapsed = timerElapsed(timer);
  localStorage.setItem(timerStorageKey(itemId), JSON.stringify({ mode:timer.mode, duration:timer.duration, elapsed, startedAt:timer.running ? Date.now() : 0, running:Boolean(timer.running), finished:Boolean(timer.finished) }));
}
function formatDuration(seconds) { const total=Math.max(0,Math.round(seconds)); const h=Math.floor(total/3600); const m=Math.floor(total%3600/60); const s=total%60; return h ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`; }
function playTimerFinishSound(item) {
  const source = String(item?.settings?.finishSound || '');
  if (!source || item?.settings?.playFinishSound === false) return;
  try {
    const audio = new Audio(source);
    audio.preload = 'auto';
    audio.volume = 1;
    const result = audio.play();
    if (result?.catch) result.catch((error) => console.warn('Timer completion audio could not be played', error));
  } catch (error) { console.warn('Timer completion audio failed', error); }
}
function renderTimerCountdown(item,settings) {
  const timer=timerState(item,settings); timer.mode=settings.mode||timer.mode; if (!Number.isFinite(Number(timer.duration)) || Number(timer.duration) <= 0) timer.duration=Math.max(1,Number(settings.durationSeconds)||300);
  const elapsed=timerElapsed(timer); const shown=timer.mode==='stopwatch'?elapsed:Math.max(0,timer.duration-elapsed); const progress=timer.mode==='stopwatch'?0:Math.max(0,Math.min(1,elapsed/timer.duration));
  const presets=String(settings.presets||'').split(',').map(Number).filter((v)=>v>0).slice(0,8);
  return `<div class="timer-widget"><div class="system-widget-heading"><h3>${marquee(settings.title||'Timer')}</h3><span>${timer.mode==='stopwatch'?translateDashboardValue('stopwatch'):translateDashboardValue('countdown')}</span></div>${settings.showProgress!==false?`<div class="timer-progress" style="--timer-progress:${progress*360}deg"><strong data-local-timer-value data-item-id="${escapeHtml(item.id)}">${formatDuration(shown)}</strong></div>`:`<strong class="timer-plain-value" data-local-timer-value data-item-id="${escapeHtml(item.id)}">${formatDuration(shown)}</strong>`}<div class="timer-controls"><button data-action="timer-toggle" data-item-id="${escapeHtml(item.id)}">${materialSymbol(timer.running?'pause':'play_arrow',23)}</button><button data-action="timer-reset" data-item-id="${escapeHtml(item.id)}">${materialSymbol('restart_alt',23)}</button></div>${timer.mode!=='stopwatch'&&settings.showPresets!==false&&presets.length?`<div class="timer-presets">${presets.map((seconds)=>`<button data-action="timer-preset" data-item-id="${escapeHtml(item.id)}" data-seconds="${seconds}">${formatDuration(seconds)}</button>`).join('')}</div>`:''}</div>`;
}


function csvEntityIds(value) { return String(value || '').split(',').map((id)=>id.trim()).filter(Boolean); }
function entityAreaName(entity) { const attrs=entity?.attributes||{}; return String(attrs.area_name||attrs.area||attrs.room||attrs.room_name||attrs.location||'').trim(); }
function entityDeviceClass(entity) { return String(entity?.device_class||entity?.attributes?.device_class||'').toLowerCase(); }
function entityRawValue(entity, attribute='') { if(!entity)return undefined; const attrs=entity.attributes||{}; return attribute ? attrs[attribute] : (attrs.value ?? attrs.current_temperature ?? attrs.state); }
function entityNumber(entity, attribute='') { const value=Number(entityRawValue(entity,attribute)); return Number.isFinite(value)?value:NaN; }
function activeEntity(entity) { return compareRule(entityRawValue(entity),'truthy',''); }
function entityUnit(entity) { return String(entity?.attributes?.unit||entity?.attributes?.unit_of_measurement||entity?.options?.custom_unit||''); }

function roomSummaryEntities(settings) {
  const manual = new Set([...csvEntityIds(settings.entityIds),...csvEntityIds(settings.warningEntityIds),settings.temperatureEntityId,settings.humidityEntityId,settings.occupancyEntityId,settings.climateEntityId,settings.mediaEntityId].filter(Boolean));
  const area=String(settings.area||'').trim().toLowerCase();
  const all=accessibleEntities();
  if(settings.autoDiscover!==false && area) for(const entity of all) if(entityAreaName(entity).toLowerCase()===area) manual.add(entity.entity_id);
  return [...manual].map((id)=>state.entities.get(id)).filter(Boolean);
}
function roomEntityByClass(entities, explicitId, classes=[]) { return state.entities.get(explicitId)||entities.find((entity)=>classes.includes(entityDeviceClass(entity)))||null; }
function renderRoomSummary(item,settings) {
  const entities=roomSummaryEntities(settings);
  const temperature=roomEntityByClass(entities,settings.temperatureEntityId,['temperature'])||entities.find((e)=>Number.isFinite(Number(e.attributes?.current_temperature)));
  const humidity=roomEntityByClass(entities,settings.humidityEntityId,['humidity']);
  const occupancy=state.entities.get(settings.occupancyEntityId)||entities.find((e)=>['occupancy','motion','presence'].includes(entityDeviceClass(e)));
  const climate=state.entities.get(settings.climateEntityId)||entities.find((e)=>e.entity_type==='climate');
  const media=state.entities.get(settings.mediaEntityId)||entities.find((e)=>e.entity_type==='media_player');
  const lights=entities.filter((e)=>e.entity_type==='light');
  const openings=entities.filter((e)=>e.entity_type==='cover'||['door','window','garage_door','opening'].includes(entityDeviceClass(e)));
  const warnings=entities.filter((e)=>csvEntityIds(settings.warningEntityIds).includes(e.entity_id)||['moisture','leak','smoke','gas','problem','safety'].includes(entityDeviceClass(e))).filter(activeEntity);
  const onLights=lights.filter(activeEntity).length; const openCount=openings.filter((e)=>activeEntity(e)||['open','opening'].includes(String(entityRawValue(e)).toLowerCase())).length;
  const metric=(iconName,label,value,entityId='')=>`<button class="room-summary-metric" ${entityId?`data-action="show-entity-info" data-entity-id="${escapeHtml(entityId)}"`:''}>${materialSymbol(iconName,24)}<span><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></span></button>`;
  const tempValue=temperature?`${localizedValue(entityRawValue(temperature),'—')}${entityUnit(temperature)?` ${entityUnit(temperature)}`:''}`:'—';
  const humidityValue=humidity?`${localizedValue(entityRawValue(humidity),'—')}${entityUnit(humidity)||'%'}`:'—';
  const mediaText=media?(media.attributes?.media_title||entityState(media).replaceAll('_',' ')):'—';
  const climateText=climate?`${localizedValue(climate.attributes?.current_temperature??climate.attributes?.target_temperature??entityState(climate),'—')}${climate.options?.temperature_unit==='CELSIUS'?' °C':climate.options?.temperature_unit==='FAHRENHEIT'?' °F':''}`:'—';
  return `<div class="room-summary-widget layout-${escapeHtml(settings.layout||'standard')}"><div class="system-widget-heading"><h3>${marquee(settings.title||settings.area||'Room')}</h3>${settings.navigateDashboardId?`<button data-action="navigate-dashboard" data-dashboard-id="${escapeHtml(settings.navigateDashboardId)}">${materialSymbol('arrow_forward',20)}</button>`:`<span>${entities.length}</span>`}</div><div class="room-summary-grid">${settings.showTemperature!==false?metric('thermostat',translateDashboardValue('temperature'),tempValue,temperature?.entity_id):''}${settings.showHumidity!==false?metric('humidity_percentage',translateDashboardValue('humidity'),humidityValue,humidity?.entity_id):''}${settings.showLights!==false?metric('lightbulb',translateDashboardValue('lights'),`${onLights} ${translateDashboardValue('on')} / ${lights.length}`,lights[0]?.entity_id):''}${settings.showOpenings!==false?metric('door_front',translateDashboardValue('openings'),`${openCount} ${translateDashboardValue('open')} / ${openings.length}`,openings[0]?.entity_id):''}${settings.showOccupancy!==false?metric('person',translateDashboardValue('occupancy'),occupancy?translateDashboardValue(activeEntity(occupancy)?'occupied':'clear'):'—',occupancy?.entity_id):''}${settings.showClimate!==false?metric('mode_fan',translateDashboardValue('climate'),climateText,climate?.entity_id):''}${settings.showMedia!==false?metric('play_circle',translateDashboardValue('media'),mediaText,media?.entity_id):''}${settings.showWarnings!==false?metric(warnings.length?'warning':'verified_user',translateDashboardValue('warnings'),warnings.length?`${warnings.length} ${translateDashboardValue('active')}`:translateDashboardValue('none'),warnings[0]?.entity_id):''}</div></div>`;
}

function historyStorageKey(entityId){return `uc-wall-history:${entityId}`;}
function loadEntityHistory(entityId){
 if(state.entityHistory.has(entityId))return state.entityHistory.get(entityId);
 let values=[];try{values=JSON.parse(localStorage.getItem(historyStorageKey(entityId))||'[]');}catch{}
 if(!Array.isArray(values))values=[]; state.entityHistory.set(entityId,values); return values;
}
function recordEntityHistory(entity,force=false){
 if(!entity?.entity_id)return; const list=loadEntityHistory(entity.entity_id); const now=Date.now(); const last=list[list.length-1];
 const values={}; for(const [key,value] of Object.entries(entity.attributes||{})){const numeric=Number(value);if(Number.isFinite(numeric))values[key]=numeric;} const raw=Number(entityRawValue(entity));if(Number.isFinite(raw))values.__state=raw;
 if(!Object.keys(values).length)return; if(!force&&last&&now-last.t<30000&&JSON.stringify(last.v)===JSON.stringify(values))return;
 list.push({t:now,v:values}); const cutoff=now-8*24*3600000; while(list.length>600||list[0]?.t<cutoff)list.shift();
 try{localStorage.setItem(historyStorageKey(entity.entity_id),JSON.stringify(list));}catch{}
}
function historyTrackedEntityIds(){const ids=new Set();for(const item of allDashboardItems())if(item.kind==='system'&&item.widgetType==='history_graph')for(const id of csvEntityIds(item.settings?.entityIds))ids.add(id);return ids;}
function sampleEntityHistory(force=false){const now=Date.now();if(!force&&now-state.historyLastSampleAt<60000)return;state.historyLastSampleAt=now;for(const id of historyTrackedEntityIds()){const entity=state.entities.get(id);if(entity)recordEntityHistory(entity,force);}}
function historyPointsWindow(entityId,attribute,start,end,maxPoints=600){const points=loadEntityHistory(entityId).filter((entry)=>entry.t>=start&&entry.t<=end).map((entry)=>({t:entry.t,value:Number(entry.v?.[attribute||'__state'])})).filter((entry)=>Number.isFinite(entry.value));const limit=Math.max(10,Math.min(600,Number(maxPoints)||600));if(points.length<=limit)return points;const stride=points.length/limit;return Array.from({length:limit},(_,index)=>points[Math.min(points.length-1,Math.floor(index*stride))]);}
function historyPoints(entityId,attribute,rangeHours,maxPoints){const end=Date.now(),start=end-Math.max(1,Number(rangeHours)||24)*3600000;return historyPointsWindow(entityId,attribute,start,end,maxPoints);}
function graphPath(points,min,max,width=600,height=180,stepped=false){if(!points.length)return '';const start=points[0].t,end=points[points.length-1].t||start+1;const coords=points.map((point)=>({x:((point.t-start)/Math.max(1,end-start)*width).toFixed(1),y:(height-(point.value-min)/Math.max(.0001,max-min)*height).toFixed(1)}));if(!stepped)return coords.map((point,index)=>`${index?'L':'M'} ${point.x} ${point.y}`).join(' ');return coords.map((point,index)=>index?`H ${point.x} V ${point.y}`:`M ${point.x} ${point.y}`).join(' ');}
function renderHistoryGraph(item,settings){
 const ids=csvEntityIds(settings.entityIds).slice(0,4); const series=ids.map((id)=>({entity:state.entities.get(id),points:historyPoints(id,settings.attribute,settings.rangeHours,settings.maxPoints)})).filter((entry)=>entry.entity);
 const all=series.flatMap((entry)=>entry.points.map((point)=>point.value)); const min=all.length?Math.min(...all):0,max=all.length?Math.max(...all):1; const colors=['#d0d0d0','#ff3e54','#79b8ff','#f3c969'];
 const previousDuration=Math.max(1,Number(settings.rangeHours)||24)*3600000,previousEnd=Date.now()-previousDuration,previousStart=previousEnd-previousDuration; const paths=series.map((entry,index)=>{const path=graphPath(entry.points,min,max,600,180,settings.chartType==='state');if(!path)return '';const previous=settings.comparePrevious?historyPointsWindow(entry.entity.entity_id,settings.attribute,previousStart,previousEnd,settings.maxPoints):[];const previousPath=previous.length?graphPath(previous.map((point)=>({t:point.t+previousDuration,value:point.value})),min,max,600,180,settings.chartType==='state'):'';if(settings.chartType==='bar'){const points=entry.points.slice(-50);const step=600/Math.max(1,points.length);return points.map((point,i)=>{const h=(point.value-min)/Math.max(.0001,max-min)*180;return `<rect x="${(i*step).toFixed(1)}" y="${(180-h).toFixed(1)}" width="${Math.max(2,step-2).toFixed(1)}" height="${h.toFixed(1)}" fill="${colors[index]}" opacity=".72"></rect>`}).join('');}return `${previousPath?`<path d="${previousPath}" fill="none" stroke="${colors[index]}" stroke-width="2" stroke-dasharray="8 7" opacity=".45" vector-effect="non-scaling-stroke"></path>`:''}<path d="${path}" fill="none" stroke="${colors[index]}" stroke-width="3" vector-effect="non-scaling-stroke"></path>${settings.chartType==='area'?`<path d="${path} L 600 180 L 0 180 Z" fill="${colors[index]}" opacity=".12"></path>`:''}`;}).join('');
 const stats=all.length?{min,max,avg:all.reduce((a,b)=>a+b,0)/all.length}:null; const threshold=Number(settings.threshold);
 return `<div class="history-graph-widget"><div class="system-widget-heading"><h3>${marquee(settings.title||'History')}</h3><span>${escapeHtml(settings.rangeHours||24)}h</span></div><div class="history-graph-stage">${paths?`<svg viewBox="0 0 600 180" preserveAspectRatio="none" aria-label="History graph">${Number.isFinite(threshold)&&threshold>=min&&threshold<=max?`<line x1="0" x2="600" y1="${180-(threshold-min)/Math.max(.0001,max-min)*180}" y2="${180-(threshold-min)/Math.max(.0001,max-min)*180}" class="history-threshold"></line>`:''}${paths}</svg>`:'<div class="empty-inline">History is collected locally while this dashboard is running.</div>'}</div>${settings.showLegend!==false?`<div class="history-legend">${series.map((entry,index)=>`<span><i style="background:${colors[index]}"></i>${marquee(localName(entry.entity.name,entry.entity.entity_id))}</span>`).join('')}</div>`:''}${settings.showStats!==false&&stats?`<div class="history-stats"><span>${escapeHtml(translateDashboardValue('min'))} <b>${stats.min.toFixed(Number(settings.decimals)||1)}</b></span><span>${escapeHtml(translateDashboardValue('average'))} <b>${stats.avg.toFixed(Number(settings.decimals)||1)}</b></span><span>${escapeHtml(translateDashboardValue('max'))} <b>${stats.max.toFixed(Number(settings.decimals)||1)}</b></span></div>`:''}</div>`;
}

function weatherForecast(settings){const entity=state.entities.get(settings.forecastEntityId)||state.entities.get(settings.conditionEntityId)||state.entities.get(settings.temperatureEntityId);const raw=entity?.attributes?.[settings.forecastAttribute||'forecast']||entity?.attributes?.forecast||[];return Array.isArray(raw)?raw.slice(0,Math.max(1,Math.min(12,Number(settings.forecastLimit)||6))):[];}
function forecastLabel(entry,index){const raw=entry.datetime||entry.time||entry.date||entry.start||'';const date=new Date(raw);if(Number.isFinite(date.getTime()))return new Intl.DateTimeFormat(dashboardLocale(),{weekday:'short',hour:entry.is_daytime===undefined?'2-digit':undefined}).format(date);return `+${index+1}`;}
function renderWeatherWidget(item,settings){
 const temperature=entityReading(settings.temperatureEntityId),condition=entityReading(settings.conditionEntityId),humidity=entityReading(settings.humidityEntityId),wind=entityReading(settings.windEntityId),precip=entityReading(settings.precipitationEntityId),uv=entityReading(settings.uvEntityId),sunrise=entityReading(settings.sunriseEntityId),sunset=entityReading(settings.sunsetEntityId);const rawConditionText=condition.value==='—'?'':String(condition.value);const conditionText=rawConditionText?translateDashboardValue(rawConditionText):'';const severe=/storm|thunder|hail|tornado|hurricane|warning|severe/i.test(rawConditionText);const forecast=weatherForecast(settings);const showForecast=settings.showForecast!==false&&['hourly','daily','combined'].includes(settings.layout||'combined');
 return `<div class="system-weather weather-layout-${escapeHtml(settings.layout||'combined')}"><div class="weather-current ${severe?'severe-weather':''}"><div class="weather-copy"><small>${marquee(settings.title||'Weather')}</small><strong>${marquee(temperature.text)}</strong>${settings.showCondition!==false&&conditionText?`<span>${marquee(conditionText)}</span>`:''}${severe?`<em>${materialSymbol('warning',15)} ${escapeHtml(translateDashboardValue('severe_conditions'))}</em>`:''}</div><span class="weather-icon">${renderWidgetIcon(item,weatherIcon(rawConditionText),68)}</span></div><div class="weather-meta">${settings.showHumidity!==false&&humidity.value!=='—'?`<span>${escapeHtml(translateDashboardValue('humidity'))} <b>${escapeHtml(humidity.text)}</b></span>`:''}${settings.showWind!==false&&wind.value!=='—'?`<span>${escapeHtml(translateDashboardValue('wind'))} <b>${escapeHtml(wind.text)}</b></span>`:''}${settings.showPrecipitation!==false&&precip.value!=='—'?`<span>${escapeHtml(translateDashboardValue('rain'))} <b>${escapeHtml(precip.text)}</b></span>`:''}${settings.showUv&&uv.value!=='—'?`<span>${escapeHtml(translateDashboardValue('uv'))} <b>${escapeHtml(uv.text)}</b></span>`:''}${settings.showSun!==false&&sunrise.value!=='—'?`<span>${escapeHtml(translateDashboardValue('sunrise'))} <b>${escapeHtml(sunrise.text)}</b></span>`:''}${settings.showSun!==false&&sunset.value!=='—'?`<span>${escapeHtml(translateDashboardValue('sunset'))} <b>${escapeHtml(sunset.text)}</b></span>`:''}</div>${showForecast?`<div class="weather-forecast">${forecast.length?forecast.map((entry,index)=>`<article><small>${escapeHtml(forecastLabel(entry,index))}</small>${materialSymbol(weatherIcon(entry.condition||entry.state||''),24)}<strong>${escapeHtml(localizedValue(entry.temperature??entry.temp??'—'))}${entry.temperature_unit||entityUnit(state.entities.get(settings.forecastEntityId))||''}</strong>${entry.precipitation_probability!=null?`<span>${escapeHtml(entry.precipitation_probability)}%</span>`:''}</article>`).join(''):'<div class="empty-inline">No forecast data exposed by the selected entity.</div>'}</div>`:''}</div>`;
}

function notificationSettings() {
  const raw = state.config?.ui?.notifications || {};
  return {
    autoLowBattery: raw.autoLowBattery !== false,
    batteryThreshold: Math.max(1, Math.min(100, Number(raw.batteryThreshold) || 20)),
    autoUnavailable: raw.autoUnavailable !== false,
    autoUpdates: raw.autoUpdates !== false,
    acknowledgeMinutes: Math.max(1, Math.min(10080, Number(raw.acknowledgeMinutes) || 60)),
    dismissHours: Math.max(1, Math.min(8760, Number(raw.dismissHours) || 24)),
    maxStatusAlerts: Math.max(1, Math.min(500, Number(raw.maxStatusAlerts) || 100))
  };
}

function normalizeAlertRule(rule={}){return {id:String(rule.id||uid('alert')),entityId:String(rule.entityId||''),attribute:String(rule.attribute||''),operator:CONDITION_OPERATORS.has(rule.operator)?rule.operator:'truthy',value:String(rule.value??''),severity:['info','warning','critical'].includes(rule.severity)?rule.severity:'warning',message:String(rule.message||''),dismissible:rule.dismissible!==false};}
function alertDismissals(){
 if(state.dismissedAlerts.size)return state.dismissedAlerts;
 try{
  const parsed=JSON.parse(localStorage.getItem('uc-wall-dismissed-alerts')||'{}');
  for(const [id,record] of Object.entries(parsed)){
   if(record&&typeof record==='object'&&record.signature)state.dismissedAlerts.set(id,{signature:String(record.signature)});
   else if(Number(record)>Date.now())state.dismissedAlerts.set(id,{until:Number(record)});
  }
 }catch{}
 return state.dismissedAlerts;
}
function persistAlertDismissals(){try{localStorage.setItem('uc-wall-dismissed-alerts',JSON.stringify(Object.fromEntries(alertDismissals())));}catch{}}
function alertStateSignature(entity,value=''){
 const changed=entity?.last_changed||entity?.lastChanged||entity?.state_changed_at||entity?.updated_at||entity?.last_updated||'';
 return JSON.stringify([String(entity?.entity_id||''),String(value??''),String(changed)]);
}
function isAlertDismissed(id,signature){
 const record=alertDismissals().get(id);
 if(!record)return false;
 if(record.until){
  if(record.until>Date.now())return true;
  alertDismissals().delete(id);persistAlertDismissals();return false;
 }
 return record.signature===signature;
}
function dismissAlert(id,signature){alertDismissals().set(id,{signature:String(signature||'')});persistAlertDismissals();scheduleRuntimePatch({runtime:true});}
function acknowledgeAlert(id,minutes=60){alertDismissals().set(id,{until:Date.now()+minutes*60000});persistAlertDismissals();scheduleRuntimePatch({runtime:true});}
function widgetAlerts(settings){
 const automatic=notificationSettings();const alerts=[];
 const add=(id,entity,severity,message,dismissible=true,conditionValue=entityRawValue(entity))=>{
  const signature=alertStateSignature(entity,conditionValue);
  if(isAlertDismissed(id,signature))return;
  alerts.push({id,entity,severity,message,dismissible,signature});
 };
 for(const entity of accessibleEntities()){
  const dc=entityDeviceClass(entity),value=entityRawValue(entity),numeric=Number(value),name=localName(entity.name,entity.entity_id);
  if(automatic.autoLowBattery&&dc==='battery'&&Number.isFinite(numeric)&&numeric<automatic.batteryThreshold)add(`battery:${entity.entity_id}`,entity,numeric<10?'critical':'warning',`${name} battery is ${numeric}${entityUnit(entity)||'%'}`,true,`low-battery:${value}`);
  if(automatic.autoUnavailable&&isUnavailable(entity))add(`unavailable:${entity.entity_id}`,entity,'warning',`${name} is unavailable`,true,`unavailable:${value}`);
  if(automatic.autoUpdates&&(dc==='update'||entity.entity_type==='update')&&activeEntity(entity))add(`update:${entity.entity_id}`,entity,'info',`${name} has an update available`,true,`update:${value}`);
 }
 for(const raw of settings.alertRules||[]){
  const rule=normalizeAlertRule(raw),entity=state.entities.get(rule.entityId),conditionValue=rule.attribute?entity?.attributes?.[rule.attribute]:entityRawValue(entity);
  if(entity&&compareRule(conditionValue,rule.operator,rule.value))add(`custom:${rule.id}`,entity,rule.severity,rule.message||`${localName(entity.name)} requires attention`,rule.dismissible,`custom:${conditionValue}`);
 }
 const order={critical:0,warning:1,info:2};return alerts.sort((a,b)=>order[a.severity]-order[b.severity]).slice(0,Math.max(1,Number(settings.maxAlerts)||20));
}
function statusBarAlerts(){
 const automatic=notificationSettings();
 return widgetAlerts({alertRules:[],maxAlerts:automatic.maxStatusAlerts});
}
function alertSeverityLabel(severity){return severity==='critical'?'Critical':severity==='warning'?'Warning':'Information';}
function alertSeverityIcon(severity){return severity==='critical'?'error':severity==='warning'?'warning':'info';}
function renderAlertCard(alert,{modal=false}={}){
 const entityName=localName(alert.entity.name,alert.entity.entity_id);
 const automatic=notificationSettings();
 return `<article class="alert-card severity-${escapeHtml(alert.severity)} ${modal?'alert-card-modal':''}"><span class="alert-card-icon">${materialSymbol(alertSeverityIcon(alert.severity),22)}</span><button class="alert-card-content" data-action="show-entity-info" data-entity-id="${escapeHtml(alert.entity.entity_id)}"><span class="alert-card-label">${escapeHtml(alertSeverityLabel(alert.severity))}</span><strong>${marquee(alert.message)}</strong><small>${marquee(entityName)}</small></button>${alert.dismissible?`<span class="alert-card-actions"><button data-action="acknowledge-alert" data-alert-id="${escapeHtml(alert.id)}" title="Acknowledge for ${automatic.acknowledgeMinutes} minutes">${materialSymbol('done',18)}</button><button data-action="dismiss-alert" data-alert-id="${escapeHtml(alert.id)}" data-alert-signature="${escapeHtml(alert.signature)}" title="Dismiss until the next state change">${materialSymbol('close',18)}</button></span>`:''}</article>`;
}
function renderStatusAlertsModal(){
 const alerts=statusBarAlerts();
 const critical=alerts.filter((entry)=>entry.severity==='critical').length;
 const warning=alerts.filter((entry)=>entry.severity==='warning').length;
 return `<div class="modal-backdrop" data-action="close-modal"></div><section class="modal status-alerts-modal alert-surface-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="eyebrow">NOTIFICATIONS</div><h2>Notification & alert center</h2></div><button class="icon-button" data-action="close-modal">${icon('close')}</button></div><div class="modal-body alert-modal-body"><div class="alert-overview-card"><span class="alert-overview-icon">${materialSymbol(alerts.length?'notifications_active':'verified_user',28)}</span><div><small>CURRENT STATUS</small><strong>${alerts.length?`${alerts.length} active alert${alerts.length===1?'':'s'}`:'All clear'}</strong><span>${critical?`${critical} critical · `:''}${warning?`${warning} warning${warning===1?'':'s'}`:alerts.length?'No warnings':'No active notifications'}</span></div></div><div class="alert-center-list status-alert-list">${alerts.length?alerts.map((alert)=>renderAlertCard(alert,{modal:true})).join(''):`<div class="alert-empty alert-empty-card">${materialSymbol('verified_user',38)}<strong>No active alerts</strong><span>Everything currently looks normal.</span></div>`}</div></div></section>`;
}
function renderAlertCenter(item,settings){
 const alerts=widgetAlerts(settings);
 const critical=alerts.filter((entry)=>entry.severity==='critical').length;
 return `<div class="alert-center-widget"><div class="system-widget-heading alert-center-heading"><div><small>NOTIFICATIONS</small><h3>${marquee(settings.title||'Alerts')}</h3></div><span class="alert-count-badge ${critical?'critical':''}">${alerts.length}</span></div><div class="alert-center-list">${alerts.length?alerts.map((alert)=>renderAlertCard(alert)).join(''):settings.showEmptyState!==false?`<div class="alert-empty alert-empty-card">${materialSymbol('verified_user',36)}<strong>No active alerts</strong><span>Everything currently looks normal.</span></div>`:''}</div></div>`;
}

function renderEntityTemplateElement(item, element) {
  const entity = templateElementEntity(item, element);
  const value = templateElementRenderedValue(item, element);
  const style = `--template-span:${Math.max(1,Math.min(6,Number(element.span)||1))}`;
  const classes = `entity-template-element template-type-${escapeHtml(element.type)} align-${escapeHtml(element.align || 'stretch')}`;
  const wrapper = (content) => `<div class="${classes}" style="${style}" data-template-element-id="${escapeHtml(element.id)}">${content}</div>`;
  if (element.type === 'icon') return wrapper(renderChosenIcon(element.icon || entity?.entity_type || 'data_object', Math.max(24, Math.min(120, Number(element.max) || 56)), 'data_object'));
  if (element.type === 'heading') return wrapper(`<h3>${marquee(value || element.label || '')}</h3>`);
  if (element.type === 'value') return wrapper(`<strong class="entity-template-value">${marquee(localizedValue(value,''))}</strong>`);
  if (element.type === 'text') return wrapper(`<span class="entity-template-text">${marquee(value || element.label || '')}</span>`);
  if (element.type === 'button') {
    const label = renderTextTemplate(element.template || element.label || 'Run', { item, entity });
    return wrapper(`<button type="button" class="entity-template-button" data-action="template-command" data-item-id="${escapeHtml(item.id)}" data-template-element-id="${escapeHtml(element.id)}">${element.showIcon !== false ? renderChosenIcon(element.icon || 'play_arrow',22,'play_arrow') : ''}<span>${marquee(label)}</span></button>`);
  }
  if (element.type === 'list') {
    const options = templateElementOptions(item, element);
    const items = options.length ? options : String(value || '').split(/[\n,]+/).map((entry)=>entry.trim()).filter(Boolean).map((entry)=>({label:entry,value:entry}));
    return wrapper(`<div class="entity-template-list">${element.label ? `<small>${escapeHtml(element.label)}</small>` : ''}<ul>${items.length ? items.map((entry)=>`<li>${marquee(entry.label)}</li>`).join('') : '<li class="muted">No values</li>'}</ul></div>`);
  }
  if (element.type === 'select') {
    const options = templateElementOptions(item, element);
    const selected = String(value || '');
    return wrapper(`<label class="entity-template-control"><span>${escapeHtml(element.label || 'Select')}</span><select data-template-select-control data-item-id="${escapeHtml(item.id)}" data-template-element-id="${escapeHtml(element.id)}" ${options.length ? '' : 'disabled'}>${options.length ? options.map((entry)=>`<option value="${escapeHtml(entry.value)}" ${entry.value===selected?'selected':''}>${escapeHtml(entry.label)}</option>`).join('') : '<option>No options</option>'}</select></label>`);
  }
  if (element.type === 'input') {
    const inputType = element.inputType === 'number' ? 'number' : 'text';
    return wrapper(`<label class="entity-template-control"><span>${escapeHtml(element.label || 'Value')}</span><span class="entity-template-input-row"><input data-template-input-control type="${inputType}" value="${escapeHtml(value)}" placeholder="${escapeHtml(element.placeholder || '')}" ${inputType==='number'?`min="${escapeHtml(element.min)}" max="${escapeHtml(element.max)}" step="${escapeHtml(element.step)}"`:''}><button type="button" data-action="template-submit-control" data-item-id="${escapeHtml(item.id)}" data-template-element-id="${escapeHtml(element.id)}">${materialSymbol('send',18)}</button></span></label>`);
  }
  if (element.type === 'slider') {
    const numeric = Number(value);
    const min = Number(element.min) || 0;
    const max = Number(element.max) || 100;
    const current = Number.isFinite(numeric) ? Math.max(min,Math.min(max,numeric)) : min;
    return wrapper(`<label class="entity-template-control entity-template-slider"><span>${escapeHtml(element.label || 'Value')} <b>${escapeHtml(String(current))}</b></span><input data-template-slider-control data-item-id="${escapeHtml(item.id)}" data-template-element-id="${escapeHtml(element.id)}" type="range" min="${escapeHtml(element.min)}" max="${escapeHtml(element.max)}" step="${escapeHtml(element.step)}" value="${escapeHtml(String(current))}"></label>`);
  }
  if (element.type === 'toggle') {
    const normalized = translationKey(value);
    const active = [translationKey(element.onValue),'on','true','1','yes','open','connected','active'].includes(normalized);
    return wrapper(`<button type="button" class="entity-template-toggle ${active?'active':''}" data-action="template-toggle-control" data-item-id="${escapeHtml(item.id)}" data-template-element-id="${escapeHtml(element.id)}" data-template-active="${active?'true':'false'}"><span>${escapeHtml(element.label || 'Toggle')}</span>${materialSymbol(active?'toggle_on':'toggle_off',34)}</button>`);
  }
  if (element.type === 'divider') return wrapper('<span class="entity-template-divider"></span>');
  return wrapper('<span class="entity-template-spacer" aria-hidden="true"></span>');
}

function renderEntityTemplateWidget(item, settings) {
  const elements = normalizeTemplateElements(settings.templateElements, settings);
  const columns = Math.max(1, Math.min(6, Number(settings.templateColumns) || 2));
  const gap = Math.max(0, Math.min(32, Number(settings.templateGap) || 10));
  return `<div class="entity-template-widget" style="--template-columns:${columns};--template-gap:${gap}px"><div class="entity-template-elements">${elements.map((element)=>renderEntityTemplateElement(item,element)).join('')}</div></div>`;
}

function renderSystemWidget(item, context = {}) {
  const sourceSettings = { ...(SYSTEM_WIDGETS[item.widgetType]?.settings || {}), ...(item.settings || {}) };
  const settings = templatedWidgetSettings(item, sourceSettings, primaryTemplateEntity(item));
  switch (item.widgetType) {
    case 'activity_launcher': return renderActivityLauncher(item, settings);
    case 'camera': return renderCameraWidget(item, settings);
    case 'icon_button': return renderCommandButton(item, settings, 'icon');
    case 'text_button': return renderCommandButton(item, settings, 'text');
    case 'icon_text_button': return renderCommandButton(item, settings, 'both');
    case 'media_browser': return renderMediaBrowser(item, settings);
    case 'tab_container': return renderTabContainer(item, settings, context);
    case 'carousel': return renderCarouselContainer(item, settings, context);
    case 'entity_group': return renderEntityGroup(item, settings, context);
    case 'gauge': return renderGauge(item, settings);
    case 'scene_routine': return renderSceneRoutine(item, settings);
    case 'entity_table': return renderEntityTable(item, settings);
    case 'counter_statistics': return renderCounterStatistics(item, settings);
    case 'timer_countdown': return renderTimerCountdown(item, settings);
    case 'room_summary': return renderRoomSummary(item, settings);
    case 'history_graph': return renderHistoryGraph(item, settings);
    case 'alert_center': return renderAlertCenter(item, settings);
    case 'entity_template': return renderEntityTemplateWidget(item, settings);
    case 'conditional': return renderConditionalContainer(item, settings, context);
    case 'custom_code': return renderCustomCodeWidget(item, settings);
    case 'divider_horizontal':
      return `<div class="divider-widget horizontal"><span style="border-top:${Math.max(1, Number(settings.thickness) || 1)}px ${escapeHtml(settings.style || 'solid')} ${escapeHtml(settings.color || '#3a3a3a')};opacity:${Math.max(0, Math.min(100, Number(settings.opacity) || 100)) / 100}"></span></div>`;
    case 'divider_vertical':
      return `<div class="divider-widget vertical"><span style="border-left:${Math.max(1, Number(settings.thickness) || 1)}px ${escapeHtml(settings.style || 'solid')} ${escapeHtml(settings.color || '#3a3a3a')};opacity:${Math.max(0, Math.min(100, Number(settings.opacity) || 100)) / 100}"></span></div>`;
    case 'clock':
      return `<div class="system-clock" data-live-clock data-clock-settings="${escapeHtml(JSON.stringify(settings))}">
        ${settings.title ? `<small class="clock-title">${marquee(settings.title)}</small>` : ''}
        <strong class="clock-time" data-clock-time>${escapeHtml(currentTime(settings))}</strong>
        ${settings.showDate ? `<span class="clock-date" data-clock-date>${marquee(currentDate(settings))}</span>` : ''}
      </div>`;
    case 'weather': return renderWeatherWidget(item, settings);
    case 'text': {
      const heading = settings.showHeading !== false && settings.title ? `<h3>${marquee(settings.title)}</h3>${settings.dividerBelowHeading ? '<hr class="text-widget-divider">' : ''}` : '';
      const body = settings.showBody !== false && settings.body ? `<p>${marquee(settings.body)}</p>${settings.dividerBelowBody ? '<hr class="text-widget-divider">' : ''}` : '';
      return `<div class="system-text ${heading ? 'has-heading' : ''} ${body ? 'has-body' : ''}">${heading}${body}</div>`;
    }
    case 'connection':
      return `<div class="system-status"><span class="system-status-icon ${state.connected ? 'ready' : ''}">${icon('wifi', 56)}</span><div><small>${marquee(settings.title || 'Remote')}</small><strong>${escapeHtml(translateDashboardValue(state.connected ? 'connected' : 'disconnected'))}</strong>${settings.showMessage ? `<span>${marquee(translateDashboardValue(state.connectionMessage))}</span>` : ''}${settings.showEntityCount ? `<b>${escapeHtml(translateDashboardValue('connected_entities',{value:state.entities.size}))}</b>` : ''}</div></div>`;
    case 'power': {
      const level = runtimeBatteryLevel();
      const charging = runtimeBatteryCharging();
      const chargingKnown = typeof charging === 'boolean';
      return `<div class="system-status"><span class="system-status-icon ${charging === true ? 'ready' : ''}">${icon(charging === true ? 'bolt' : 'battery', 56)}</span><div><small>${marquee(settings.title || 'Remote power')}</small>${settings.showBattery && Number.isFinite(level) ? `<strong>${escapeHtml(Math.round(level))}%</strong>` : `<strong>${translateDashboardValue(charging === true ? 'charging' : charging === false ? 'on_battery' : 'power_status_unknown')}</strong>`}${settings.showCharging ? `<span>${translateDashboardValue(chargingKnown ? (charging ? 'external_power_connected' : 'external_power_disconnected') : 'external_power_status_unavailable')}</span>` : ''}</div></div>`;
    }
    case 'spacer':
      return '<div class="system-spacer" aria-hidden="true"></div>';
    default:
      return `<div class="system-status"><span>${icon('grid', 48)}</span><strong>Unknown widget</strong></div>`;
  }
}

function renderDrawerShell() {
  return `<div class="drawer-backdrop" data-action="close-drawer"></div><aside class="drawer" aria-label="Add widget">
    <div class="drawer-head"><div><h2>Add widget</h2><div class="muted" data-drawer-count></div></div><button class="icon-button" data-action="close-drawer" aria-label="Close">${icon('close')}</button></div>
    <div class="drawer-tabs"><button data-action="set-drawer-tab" data-tab="entities" class="${state.drawerTab === 'entities' ? 'active' : ''}">Entities</button><button data-action="set-drawer-tab" data-tab="widgets" class="${state.drawerTab === 'widgets' ? 'active' : ''}">Widgets</button><button data-action="set-drawer-tab" data-tab="clipboard" class="${state.drawerTab === 'clipboard' ? 'active' : ''}">Clipboard${dashboardClipboardCount() ? ` <span>${dashboardClipboardCount()}</span>` : ''}</button></div>
    <div class="drawer-content"></div>
  </aside>`;
}

function syncDrawer() {
  if (!state.drawerOpen || state.kioskMode) {
    drawerRoot.innerHTML = '';
    return;
  }
  if (!drawerRoot.querySelector('.drawer')) {
    setLocalizedDashboardHtml(drawerRoot, renderDrawerShell());
    renderDrawerTabContent();
    return;
  }
  drawerRoot.querySelectorAll('[data-action="set-drawer-tab"]').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === state.drawerTab);
    if (button.dataset.tab === 'clipboard') button.innerHTML = localizedDashboardMarkup(`Clipboard${dashboardClipboardCount() ? ` <span>${dashboardClipboardCount()}</span>` : ''}`);
  });
  const content = drawerRoot.querySelector('.drawer-content');
  if (content?.dataset.tab !== state.drawerTab) renderDrawerTabContent();
  else if (state.drawerTab === 'entities') updateEntityDrawerList();
}


function renderDrawerTabContent() {
  const content = drawerRoot.querySelector('.drawer-content');
  if (!content) return;
  content.dataset.tab = state.drawerTab;
  if (state.drawerTab === 'entities') {
    setLocalizedDashboardHtml(content, `<div class="drawer-controls"><div class="drawer-search-row"><input class="settings-input" type="search" placeholder="Search entities" value="${escapeHtml(state.entitySearch)}" data-entity-search autocomplete="off"><button class="icon-button" data-action="refresh-entities" title="Force refresh entities">${icon('refresh')}</button></div><div class="filter-row"><button class="mode-chip ${state.entityFilter === 'all' ? 'active' : ''}" data-action="filter-entity" data-type="all">All</button>${ENTITY_TYPES.map((type) => `<button class="mode-chip ${state.entityFilter === type ? 'active' : ''}" data-action="filter-entity" data-type="${type}">${escapeHtml(TYPE_LABELS[type])}</button>`).join('')}</div></div><div class="entity-list" data-entity-list></div>`);
    updateEntityDrawerList();
  } else if (state.drawerTab === 'widgets') {
    setLocalizedDashboardHtml(content, `<div class="system-widget-list">${Object.entries(SYSTEM_WIDGETS).map(([type, definition]) => `<button class="system-widget-option" data-action="add-system-widget" data-widget-type="${type}"><span>${icon(definition.icon, 48)}</span><div><strong>${escapeHtml(definition.label)}</strong><small>${escapeHtml(definition.description)}</small></div><i>${icon('plus', 20)}</i></button>`).join('')}</div>`);
    const count = drawerRoot.querySelector('[data-drawer-count]');
    if (count) count.textContent = translateDashboardText(`${Object.keys(SYSTEM_WIDGETS).length} available`);
  } else {
    const entityEntries = state.dashboardClipboard.entities || [];
    const widgetEntries = state.dashboardClipboard.widgets || [];
    const entityRows = entityEntries.map((entry) => {
      const entity = state.entities.get(entry.entityId);
      return `<article class="clipboard-list-item"><span class="type-icon ${entity && entityState(entity) !== 'OFF' ? 'active' : ''}">${icon(entity?.entity_type || 'sensor')}</span><div><strong>${marquee(entity ? localName(entity.name) : entry.label)}</strong><small>${marquee(entry.entityId)}</small></div><button class="pill-button" data-action="paste-dashboard-clipboard" data-clipboard-kind="entity" data-clipboard-id="${escapeHtml(entry.id)}" ${entity ? '' : 'disabled'}>Paste</button><button class="icon-button" data-action="remove-dashboard-clipboard" data-clipboard-kind="entity" data-clipboard-id="${escapeHtml(entry.id)}" title="Remove from clipboard">${materialSymbol('close',18)}</button></article>`;
    }).join('');
    const widgetRows = widgetEntries.map((entry) => `<article class="clipboard-list-item"><span class="type-icon active">${materialSymbol('widgets',22)}</span><div><strong>${marquee(entry.label)}</strong><small>Dashboard widget</small></div><button class="pill-button" data-action="paste-dashboard-clipboard" data-clipboard-kind="widget" data-clipboard-id="${escapeHtml(entry.id)}">Paste</button><button class="icon-button" data-action="remove-dashboard-clipboard" data-clipboard-kind="widget" data-clipboard-id="${escapeHtml(entry.id)}" title="Remove from clipboard">${materialSymbol('close',18)}</button></article>`).join('');
    setLocalizedDashboardHtml(content, dashboardClipboardCount() ? `<div class="clipboard-toolbar"><span>${dashboardClipboardCount()} copied items</span><button type="button" class="pill-button" data-action="clear-dashboard-clipboard">Clear clipboard</button></div>${widgetRows ? `<section class="clipboard-section"><h3>Widgets</h3>${widgetRows}</section>` : ''}${entityRows ? `<section class="clipboard-section"><h3>Entities</h3>${entityRows}</section>` : ''}` : `<div class="dashboard-empty-inner"><p>The clipboard is empty. Copy a widget from its edit controls or an entity from the Entities tab.</p></div>`);
    const count = drawerRoot.querySelector('[data-drawer-count]');
    if (count) count.textContent = translateDashboardText(`${dashboardClipboardCount()} copied items`);
  }
}

function filteredEntities() {
  return [...state.entities.values()]
    .filter((entity) => ENTITY_TYPES.includes(entity.entity_type))
    .filter((entity) => state.entityFilter === 'all' || entity.entity_type === state.entityFilter)
    .filter((entity) => {
      const query = state.entitySearch.trim().toLowerCase();
      if (!query) return true;
      return `${localName(entity.name)} ${entity.entity_id} ${entity.integration_id || ''}`.toLowerCase().includes(query);
    })
    .sort((a, b) => localName(a.name).localeCompare(localName(b.name)));
}

function updateEntityDrawerList() {
  const list = drawerRoot.querySelector('[data-entity-list]');
  if (!list) return;
  const scrollTop = list.scrollTop;
  const entities = filteredEntities();
  const currentIds = new Set((currentDashboard()?.items || []).filter((item) => item.kind !== 'system').map((item) => item.entityId));
  setLocalizedDashboardHtml(list, entities.length ? entities.map((entity) => `<div class="entity-list-item"><span class="type-icon ${entityState(entity) !== 'OFF' ? 'active' : ''}">${icon(entity.entity_type)}</span><div class="entity-list-copy"><strong>${marquee(localName(entity.name))}</strong><span>${marquee(`${TYPE_LABELS[entity.entity_type]} · ${entity.entity_id}`)}</span></div><div class="entity-list-actions"><button class="icon-button" data-action="copy-entity-to-clipboard" data-entity-id="${escapeHtml(entity.entity_id)}" title="Copy entity">${materialSymbol('content_copy',18)}</button><button class="pill-button ${currentIds.has(entity.entity_id) ? 'added' : ''}" data-action="add-entity" data-entity-id="${escapeHtml(entity.entity_id)}">${currentIds.has(entity.entity_id) ? 'Add another' : 'Add'}</button></div></div>`).join('') : '<div class="dashboard-empty-inner"><p>No matching entities. Try another search or check the integration connection.</p></div>');
  list.scrollTop = scrollTop;
  const count = drawerRoot.querySelector('[data-drawer-count]');
  if (count) count.textContent = translateDashboardText(`${entities.length} available`);
  requestAnimationFrame(() => updateMarquees(drawerRoot));
}

function backgroundFormValues(form) {
  const data = new FormData(form);
  const preset = String(data.get('preset') || 'custom');
  if (Object.prototype.hasOwnProperty.call(DASHBOARD_BACKGROUND_PRESETS, preset)) return { preset, ...DASHBOARD_BACKGROUND_PRESETS[preset] };
  const definition = normalizeBackgroundDefinition({
    color: data.get('color'), image: String(data.get('image') || '').trim(), overlay: data.get('overlay'), fit: data.get('fit'), position: data.get('position'), fixed: data.get('fixed') === 'on'
  });
  if (preset.startsWith('saved:')) {
    const saved = savedBackgroundPresetByKey(preset);
    if (saved) return { preset, ...definition, savedPresetId: saved.id, savedPresetName: saved.name };
  }
  return { preset: 'custom', ...definition };
}

function setBackgroundCustomFields(form, definition = {}, presetId = '', presetName = '') {
  const background = normalizeBackgroundDefinition(definition);
  const assign = (name, value) => { const input = form.querySelector(`[name="${CSS.escape(name)}"]`); if (input) input.value = String(value ?? ''); };
  assign('color', background.color); assign('image', background.image); assign('overlay', background.overlay); assign('fit', background.fit); assign('position', background.position); assign('presetName', presetName);
  const fixed = form.querySelector('[name="fixed"]'); if (fixed) fixed.checked = background.fixed !== false;
  assign('savePresetId', presetId);
  form.dataset.selectedSavedPreset = presetId || '';
  const colorPicker = form.querySelector('[data-custom-color-picker] [name="color"]')?.closest('[data-custom-color-picker]');
  if (colorPicker) setCustomColorPickerValue(colorPicker, background.color, { emit: false });
}

function makeBackgroundPresetEditable(form, changedElement) {
  if (!form || !changedElement?.closest?.('[data-background-edit-field]')) return;
  const selected = form.querySelector('[name="preset"]:checked');
  if (!selected || selected.value === 'custom' || String(selected.value).startsWith('saved:')) return;
  const custom = form.querySelector('[name="preset"][value="custom"]');
  if (custom) custom.checked = true;
}

function updateBackgroundEditor(form, { syncSelectedDefinition = false } = {}) {
  if (!form) return;
  const selected = form.querySelector('[name="preset"]:checked');
  const preset = String(selected?.value || 'custom');
  if (syncSelectedDefinition && selected) {
    const definitionNode = selected.nextElementSibling;
    if (definitionNode?.dataset.backgroundDefinition) {
      try {
        const definition = JSON.parse(definitionNode.dataset.backgroundDefinition);
        const presetId = definitionNode.dataset.backgroundPresetId || '';
        const saved = savedBackgroundPresetById(presetId);
        setBackgroundCustomFields(form, definition, presetId, saved?.name || '');
      } catch {}
    }
  }
  const background = backgroundFormValues(form);
  const preview = form.querySelector('[data-background-preview]');
  if (preview) {
    preview.style.setProperty('--preview-color', background.color);
    preview.style.setProperty('--preview-image', background.image ? `url("${String(background.image).replaceAll('\"', '%22')}")` : 'none');
    preview.style.setProperty('--preview-overlay', String(background.overlay / 100));
    preview.style.backgroundSize = background.fit;
    preview.style.backgroundPosition = background.position;
  }
  const output = form.querySelector('[data-background-overlay-output]');
  if (output) output.textContent = String(background.overlay);
}


async function backgroundDefinitionWithUpload(form) {
  const data = new FormData(form);
  const background = backgroundFormValues(form);
  const imageFile = data.get('imageFile');
  if (imageFile instanceof File && imageFile.size > 0) {
    if (imageFile.size > 5 * 1024 * 1024) throw new Error('Background image must be 5 MB or smaller');
    background.image = await fileToDataUrl(imageFile);
    const imageInput = form.querySelector('[name="image"]');
    if (imageInput) imageInput.value = background.image;
    const fileInput = form.querySelector('[name="imageFile"]');
    if (fileInput) fileInput.value = '';
    updateBackgroundEditor(form);
  }
  return normalizeBackgroundDefinition(background);
}

async function saveBackgroundPresetFromForm(form) {
  if (!form) return;
  const nameInput = form.querySelector('[name="presetName"]');
  const name = String(nameInput?.value || '').trim();
  if (!name) { toast('Enter a name for the background preset', 'error'); nameInput?.focus(); return; }
  let definition;
  try { definition = await backgroundDefinitionWithUpload(form); }
  catch (error) { toast(error.message || String(error), 'error'); return; }
  const idInput = form.querySelector('[name="savePresetId"]');
  let saved = savedBackgroundPresetById(idInput?.value || '');
  if (saved) {
    saved.name = name.slice(0, 80);
    saved.background = definition;
    saved.updatedAt = Date.now();
  } else {
    saved = normalizeSavedBackgroundPreset({ id: uid('background'), name, background: definition, createdAt: Date.now(), updatedAt: Date.now() });
    state.config.backgroundPresets.push(saved);
  }
  if (idInput) idInput.value = saved.id;
  form.dataset.selectedSavedPreset = saved.id;
  const grid = form.querySelector('.background-preset-grid');
  const current = grid?.querySelector(`[data-background-preset-id="${CSS.escape(saved.id)}"]`)?.closest('.saved-background-preset');
  const markup = renderSavedBackgroundPresetCard(saved, form.querySelector('[name="preset"]:checked')?.value || '');
  if (current) current.outerHTML = markup;
  else {
    const custom = grid?.querySelector('input[name="preset"][value="custom"]')?.closest('.background-preset-card');
    if (custom) custom.insertAdjacentHTML('beforebegin', markup); else grid?.insertAdjacentHTML('beforeend', markup);
  }
  const button = form.querySelector('[data-action="save-background-preset"]');
  if (button) button.innerHTML = `${materialSymbol('bookmark_added',18)} Update preset`;
  const heading = form.querySelector('.background-preset-save-box h4');
  if (heading) heading.textContent = 'Update saved preset';
  const status = form.querySelector('[data-background-preset-save-status]');
  if (status) status.textContent = `Saved “${saved.name}”. The dashboard background was not changed.`;
  persistConfig();
  toast(`Saved background preset ${saved.name}`);
}

function renderModalRoot() {
  if (!state.modal || (state.kioskMode && !['page-selector','page-pin','media-browser','confirm','message'].includes(state.modal.type))) {
    modalRoot.innerHTML = '';
    return;
  }
  setLocalizedDashboardHtml(modalRoot, renderModal());
  requestAnimationFrame(() => {
    updateMarquees(modalRoot);
    initializeMediaSwipers(modalRoot);
    updateMediaPresentationEditor(modalRoot);
    updateCarouselPresentationEditor(modalRoot);
    updateBackgroundEditor(modalRoot.querySelector('[data-background-form]'));
    const widgetForm = modalRoot.querySelector('[data-widget-settings-form]');
    if (widgetForm) { setWidgetEditorStep(widgetForm, widgetForm.dataset.editorStep || 'content'); updateWidgetEditorPreview(widgetForm); }
    const flowForm = modalRoot.querySelector('[data-flow-editor-form]');
    if (flowForm) { setFlowEditorStep(flowForm, flowForm.dataset.editorStep || flowEditorSteps(flowForm)[0]); updateFlowEditorPreview(flowForm); refreshStatusbarConditionalSettings(flowForm); }
    if (state.modal?.type === 'media-browser') {
      const browser = mediaBrowserEntry(state.modal.browserKey);
      if (!browser.loading && !browser.loaded) loadMediaBrowser(state.modal.browserKey);
    }
  });
}


function flowEditorShell({ eyebrow = 'DASHBOARD', title, formAttribute, steps, panels, preview, submitLabel = 'Save', className = '' }) {
  const first = steps[0]?.id || 'content';
  return `<div class="modal-backdrop" data-action="close-modal"></div><section class="modal widget-settings-modal widget-editor-modal settings-flow-modal ${escapeHtml(className)}" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="eyebrow">${escapeHtml(eyebrow)}</div><h2>${escapeHtml(title)}</h2></div><button class="icon-button" data-action="close-modal">${icon('close')}</button></div><form ${formAttribute} data-flow-editor-form data-editor-step="${escapeHtml(first)}"><div class="modal-body widget-editor-modal-body"><div class="widget-editor-layout"><div class="widget-editor-column"><nav class="widget-editor-flow" aria-label="Editor steps">${steps.map((step,index) => `<button type="button" class="${index === 0 ? 'active' : ''}" data-action="flow-editor-step" data-flow-editor-step="${escapeHtml(step.id)}"><i>${index + 1}</i><span>${escapeHtml(step.label)}</span></button>`).join('')}</nav><div class="widget-editor-panels">${steps.map((step,index) => `<section class="widget-editor-panel" data-flow-editor-panel="${escapeHtml(step.id)}" ${index ? 'hidden' : ''}>${panels[step.id] || ''}</section>`).join('')}</div><div class="widget-editor-step-controls"><button type="button" class="pill-button" data-action="flow-editor-previous" hidden>${materialSymbol('arrow_back',18)} Back</button><button type="button" class="pill-button" data-action="flow-editor-next">Next ${materialSymbol('arrow_forward',18)}</button></div></div><aside class="widget-editor-preview-pane"><div class="widget-editor-preview-sticky"><div class="widget-editor-preview-head"><div><span>LIVE PREVIEW</span><strong>Changes update immediately</strong></div></div><div class="settings-flow-preview" data-flow-editor-preview>${preview}</div><small>This preview is local until the editor is saved.</small></div></aside></div></div><div class="modal-actions"><button type="button" class="pill-button" data-action="close-modal">Cancel</button><button type="submit" class="pill-button primary">${escapeHtml(submitLabel)}</button></div></form></section>`;
}

function flowEditorSteps(form) {
  return [...form.querySelectorAll('[data-flow-editor-step]')].map((button) => button.dataset.flowEditorStep);
}

function setFlowEditorStep(form, requested) {
  if (!form) return;
  const steps = flowEditorSteps(form);
  const step = steps.includes(requested) ? requested : steps[0];
  form.dataset.editorStep = step;
  form.querySelectorAll('[data-flow-editor-step]').forEach((button) => button.classList.toggle('active', button.dataset.flowEditorStep === step));
  form.querySelectorAll('[data-flow-editor-panel]').forEach((panel) => { panel.hidden = panel.dataset.flowEditorPanel !== step; });
  const index = steps.indexOf(step);
  const previous = form.querySelector('[data-action="flow-editor-previous"]');
  const next = form.querySelector('[data-action="flow-editor-next"]');
  if (previous) { previous.hidden = index <= 0; previous.disabled = index <= 0; }
  if (next) { next.hidden = index >= steps.length - 1; next.disabled = index >= steps.length - 1; }
}

function formChecked(data, name) { return data.get(name) === 'on'; }

function navigationEditorPreview(data = null) {
  const settings = navigationSettings();
  const mode = data ? String(data.get('mode') || settings.mode) : settings.mode;
  const showIcons = data ? formChecked(data,'showIcons') : settings.showIcons;
  const showLabels = data ? formChecked(data,'showLabels') : settings.showLabels;
  const transition = data ? String(data.get('transition') || settings.transition) : settings.transition;
  const sourceDashboards = state.config?.dashboards || [];
  const previewDashboards = sourceDashboards.length > 1 ? sourceDashboards.slice(0, 2) : [sourceDashboards[0] || { name:'Dashboard', navIcon:'dashboard', navColor:'#d0d0d0' }, { name:'Second dashboard', navIcon:'dashboard', navColor:'#8fc7ff' }];
  const slide = (dashboard, index) => `<section class="navigation-preview-slide preview-slide-${index ? 'b' : 'a'}" style="--preview-dashboard-accent:${escapeHtml(dashboard.navColor || '#d0d0d0')}"><strong>${escapeHtml(dashboard.name || `Dashboard ${index + 1}`)}</strong><div class="navigation-preview-widgets"><span></span><span></span><span></span></div></section>`;
  const navigationItems = sourceDashboards.slice(0,4).map((dashboard) => {
    const iconName = data ? String(data.get(`dashboardIcon:${dashboard.id}`) || dashboard.navIcon || 'dashboard') : dashboard.navIcon || 'dashboard';
    const color = data ? String(data.get(`dashboardColor:${dashboard.id}`) || dashboard.navColor || '#d0d0d0') : dashboard.navColor || '#d0d0d0';
    return `<span style="--dashboard-nav-accent:${escapeHtml(color)}">${showIcons ? renderChosenIcon(iconName,20,'dashboard') : ''}${showLabels ? `<b>${escapeHtml(dashboard.name)}</b>` : ''}</span>`;
  }).join('');
  const swipeTitle = `<div class="navigation-preview-swipe-title"><b>${escapeHtml(currentDashboard()?.name || 'Dashboard')}</b><div><i class="active"></i><i></i><i></i></div><small>Swipe title</small></div>`;
  const nav = `<nav>${navigationItems}</nav>`;
  const beforeStage = mode === 'default' ? swipeTitle : mode === 'top_tabs' ? nav : '';
  const afterStage = ['right_cards','bottom_dock'].includes(mode) ? nav : '';
  return `<div class="navigation-live-preview mode-${escapeHtml(mode)} transition-${escapeHtml(transition)}"><div class="navigation-preview-device"><i class="navigation-preview-status"></i>${beforeStage}<div class="navigation-preview-stage">${previewDashboards.map(slide).join('')}</div>${afterStage}</div><small>${escapeHtml(mode.replaceAll('_',' '))} · ${escapeHtml(transition)} transition</small></div>`;
}

function statusbarLayoutItemsFromForm(form) {
  if (!form) return normalizeStatusBarLayout(state.config?.ui?.statusBar || {}).layoutItems;
  return [...form.querySelectorAll('[data-statusbar-layout-item]')].map((row, index) => normalizeStatusBarItem({
    id: row.dataset.statusItemId || `status-cell-${index + 1}`,
    type: row.querySelector('[data-status-item-type]')?.value || 'empty',
    customText: row.querySelector('[data-status-item-custom]')?.value || '',
    entityId: row.querySelector('[data-status-item-entity]')?.value || '',
    entityDisplay: row.querySelector('[data-status-item-display]')?.value || 'name_state'
  }, index));
}

function statusbarPreviewItem(item, settings = {}) {
  if (item.type === 'empty') return '';
  if (item.type === 'divider') return '<i class="preview-column-divider"></i>';
  if (item.type === 'time') return '<span>12:34</span>';
  if (item.type === 'date') return '<span>15 Jul 2026</span>';
  if (item.type === 'page') return `<span>${escapeHtml(currentDashboard()?.name || 'Dashboard')}</span>`;
  if (item.type === 'custom') return `<span>${escapeHtml(item.customText || 'Custom')}</span>`;
  if (item.type === 'entity') return '<span>Living Room · 22.5 °C</span>';
  if (item.type === 'battery') return `${materialSymbol('battery_full',16)}<span>74%</span>`;
  if (item.type === 'connection') return `${materialSymbol('wifi',16)}<span>Connected</span>`;
  if (item.type === 'entity_count') return `${materialSymbol('dataset',16)}<span>${state.entities.size}</span>`;
  if (item.type === 'charging') return `${materialSymbol('bolt',17)}<span>Charging</span>`;
  if (item.type === 'alerts') return '<i class="preview-alert">!<small>3</small></i>';
  if (item.type === 'profile') return `<b>${escapeHtml(String(settings.profileText || 'W').slice(0,2))}</b>`;
  return '';
}

function statusbarEditorPreview(data = null, form = null) {
  const saved = state.config?.ui?.statusBar || {};
  const get = (name, fallback='') => data ? String(data.get(name) ?? fallback) : String(saved[name] ?? fallback);
  const height = Math.max(28,Math.min(96,Number(get('height',40))||40));
  const radius = Math.max(0,Math.min(40,Number(get('radius',0))||0));
  const bg = get('background','#000000');
  const fg = get('foreground','#d0d0d0');
  const items = form ? statusbarLayoutItemsFromForm(form) : normalizeStatusBarLayout(saved).layoutItems;
  const columns = Math.max(1, Math.min(24, Number(data?.get('layoutColumns')) || items.length || 1));
  while (items.length < columns) items.push(normalizeStatusBarItem({ type:'empty' }, items.length));
  const alignment = normalizeStatusBarAlignment(get('alignment','distributed'));
  return `<div class="statusbar-live-preview"><header class="statusbar-preview-grid status-align-${alignment}" style="--preview-status-columns:${columns};height:${height}px;border-radius:${radius}px;background:${escapeHtml(bg)};color:${escapeHtml(fg)};font-size:${Math.max(9,Math.min(28,Number(get('fontSize',13))||13))}px">${items.slice(0,columns).map((item)=>`<span class="preview-status-cell type-${escapeHtml(item.type)} ${item.type === 'empty' ? 'status-type-empty' : ''}">${statusbarPreviewItem(item, { profileText:get('profileText','W') })}</span>`).join('')}</header><div class="statusbar-preview-content"><span></span><span></span></div></div>`;
}

function settingsEditorPreview(data = null) {
  const kiosk = state.config?.ui?.kiosk || {};
  const saver = state.config?.ui?.screensaver || {};
  const scale = data ? formChecked(data,'kioskScaleToFit') : kiosk.scaleToFit;
  const saverEnabled = data ? formChecked(data,'screensaverEnabled') : saver.enabled;
  const widthMode = data ? String(data.get('kioskWidthMode') || kiosk.widthMode || 'fill') : kiosk.widthMode || 'fill';
  const mode = data ? String(data.get('screensaverMode') || saver.mode || 'clock') : saver.mode || 'clock';
  return `<div class="dashboard-settings-live-preview"><div class="device-preview ${scale ? 'scale-enabled' : ''}"><div class="device-preview-bar"></div><div class="device-preview-dashboard"><strong>${escapeHtml(currentDashboard()?.name || 'Dashboard')}</strong><span></span><span></span><span></span></div>${saverEnabled ? `<div class="device-preview-screensaver mode-${escapeHtml(mode)}">${materialSymbol(mode === 'image' ? 'image' : 'schedule',34)}<b>12:34</b><small>Screensaver</small></div>` : ''}</div><div class="settings-preview-facts"><span>${scale ? `Scale to fit · ${escapeHtml(widthMode)}` : 'Responsive layout'}</span><span>${saverEnabled ? `${mode.replaceAll('_',' ')} screensaver` : 'Screensaver disabled'}</span></div></div>`;
}

function updateFlowEditorPreview(form) {
  const target = form?.querySelector('[data-flow-editor-preview]');
  if (!target) return;
  const data = new FormData(form);
  if (form.matches('[data-navigation-form]')) target.innerHTML = localizedDashboardMarkup(navigationEditorPreview(data));
  else if (form.matches('[data-statusbar-form]')) target.innerHTML = localizedDashboardMarkup(statusbarEditorPreview(data, form));
  else if (form.matches('[data-settings-form]')) target.innerHTML = localizedDashboardMarkup(settingsEditorPreview(data));
  else if (form.matches('[data-background-form]')) updateBackgroundEditor(form);
}


function navigationDashboardEditorCard(dashboard) {
  const iconValue = dashboard.navIcon || 'dashboard';
  return `<article class="dashboard-access-card" data-dashboard-access-id="${escapeHtml(dashboard.id)}"><div class="dashboard-access-card-head"><div class="dashboard-navigation-editor-preview" style="--dashboard-nav-accent:${escapeHtml(dashboard.navColor || '#d0d0d0')}">${renderChosenIcon(iconValue,26,'dashboard')}</div>${iconChoiceField(`dashboardIcon:${dashboard.id}`, iconValue, dashboard.name, { fallback:'dashboard', compact:true })}${renderColorPicker(`dashboardColor:${dashboard.id}`, dashboard.navColor || '#d0d0d0', { className: 'dashboard-color-picker', title: 'Accent color' })}</div><div class="dashboard-access-fields"><div class="field dashboard-pin-field"><label>${dashboard.pinHash ? 'Replace page PIN' : 'Optional page PIN'}</label><div class="dashboard-pin-input-row"><input class="settings-input" type="password" inputmode="numeric" autocomplete="new-password" name="dashboardPin:${escapeHtml(dashboard.id)}" placeholder="${dashboard.pinHash ? '••••' : 'No PIN'}">${dashboard.pinHash ? `<button type="button" class="dashboard-pin-trash" data-action="request-remove-dashboard-pin" data-dashboard-id="${escapeHtml(dashboard.id)}" title="Remove PIN lock">${materialSymbol('delete',19)}</button>` : ''}</div><small>${dashboard.pinHash ? 'A PIN is set. Enter a new value to replace it.' : 'Leave empty to keep this dashboard unlocked.'}</small></div><div class="field"><label>PIN hint</label><input class="settings-input" name="dashboardPinHint:${escapeHtml(dashboard.id)}" value="${escapeHtml(dashboard.pinHint || '')}" placeholder="Optional hint"></div></div><section class="dashboard-relock-settings"><label class="checkbox-row"><input type="checkbox" name="dashboardRelockEnabled:${escapeHtml(dashboard.id)}" ${dashboard.relockEnabled?'checked':''}> Relock after inactivity</label><div class="field"><label>Relock timer (minutes)</label><input class="settings-input" type="number" min="1" max="1440" name="dashboardRelockMinutes:${escapeHtml(dashboard.id)}" value="${escapeHtml(dashboard.relockMinutes||5)}"><small>The timer restarts after the last interaction with this dashboard. Starting the screensaver locks it immediately.</small></div></section></article>`;
}

function renderDashboardPinRemovalOverlay(dashboard) {
  return `<div class="pin-removal-overlay"><div class="modal-backdrop pin-removal-backdrop" data-action="cancel-remove-dashboard-pin"></div><section class="modal page-pin-modal remove-dashboard-pin-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="eyebrow">REMOVE LOCK</div><h2>${escapeHtml(dashboard.name)}</h2></div><button type="button" class="icon-button" data-action="cancel-remove-dashboard-pin">${icon('close')}</button></div><form data-remove-dashboard-pin-form data-dashboard-id="${escapeHtml(dashboard.id)}"><div class="modal-body"><div class="page-pin-icon danger">${materialSymbol('lock_open',48)}</div><p class="muted">Enter the current dashboard PIN to remove the lock. This does not change any other navigation settings.</p><input class="settings-input page-pin-input" name="pin" type="password" inputmode="numeric" autocomplete="one-time-code" autofocus required></div><div class="modal-actions"><button type="button" class="pill-button" data-action="cancel-remove-dashboard-pin">Cancel</button><button type="submit" class="pill-button danger">Remove PIN</button></div></form></section></div>`;
}

function openDashboardPinRemoval(dashboardId) {
  const dashboard = state.config?.dashboards?.find((entry) => entry.id === dashboardId);
  if (!dashboard?.pinHash || modalRoot.querySelector('.pin-removal-overlay')) return;
  modalRoot.insertAdjacentHTML('beforeend', renderDashboardPinRemovalOverlay(dashboard));
  requestAnimationFrame(() => modalRoot.querySelector('[data-remove-dashboard-pin-form] [name="pin"]')?.focus());
}


function renderNavigationSettingsEditor() {
  const settings = navigationSettings();
  const modes = [['default','Swipe title','Current title, dots, and swipe navigation','swipe'],['right_cards','Right cards','Vertical dashboard cards along the right edge','view_sidebar'],['top_tabs','Top tabs','Compact tabs directly below the status bar','tab'],['bottom_dock','Bottom dock','Floating dashboard dock at the bottom','dock_to_bottom']];
  const transitions = [['none','None','block'],['fade','Fade','blur_on'],['slide','Slide','swipe'],['scale','Scale','zoom_out_map'],['coverflow','Coverflow','gallery_thumbnail'],['flip','Flip','flip'],['push','Push','move'],['reveal','Reveal','layers'],['vertical','Vertical','swap_vert']];
  const panels = {
    layout: `<section class="settings-section"><h3>Navigation mode</h3><div class="navigation-mode-grid">${modes.map(([value,title,description,symbol]) => navigationModeCard(value,title,description,symbol,settings.mode)).join('')}</div></section><section class="settings-section"><h3>Dashboard transition</h3><div class="transition-choice-grid">${transitions.map(([value,label,symbol]) => `<label><input type="radio" name="transition" value="${value}" ${settings.transition===value?'checked':''}><span>${materialSymbol(symbol,24)}<b>${label}</b></span></label>`).join('')}</div></section>`,
    content: `<section class="settings-section"><h3>Navigation content</h3><label class="checkbox-row"><input type="checkbox" name="showIcons" ${settings.showIcons?'checked':''}> Show dashboard icons</label><label class="checkbox-row"><input type="checkbox" name="showLabels" ${settings.showLabels?'checked':''}> Show dashboard names</label><div class="field"><label>Right-card width</label><input type="range" min="112" max="240" step="4" name="cardWidth" value="${settings.cardWidth}"></div></section>`,
    dashboards: `<section class="settings-section"><h3>Dashboard cards and access</h3><div class="dashboard-navigation-editor">${state.config.dashboards.map(navigationDashboardEditorCard).join('')}</div></section>`
  };
  return flowEditorShell({ title:'Navigation', formAttribute:'data-navigation-form', steps:[{id:'layout',label:'Layout'},{id:'content',label:'Content'},{id:'dashboards',label:'Dashboards'}], panels, preview:navigationEditorPreview(), submitLabel:'Save navigation', className:'navigation-settings-modal' });
}

function statusBarLayoutTypeOptions(selected = 'empty') {
  const options = [
    ['empty','Empty column'],['divider','Vertical divider'],['time','Time'],['date','Date'],['page','Dashboard name'],['custom','Custom text'],['entity','Entity data'],
    ['battery','Battery'],['connection','Connection'],['entity_count','Entity count'],['charging','Charging state'],['alerts','Alerts'],['profile','Profile badge']
  ];
  return options.map(([value,label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function statusBarLayoutEditorItem(item, index, activeColumns = Number.POSITIVE_INFINITY) {
  const entities = accessibleEntities().sort((a,b) => localName(a.name).localeCompare(localName(b.name)));
  const normalized = normalizeStatusBarItem(item,index);
  const inactive = index >= activeColumns;
  return `<article class="statusbar-layout-item ${inactive ? 'statusbar-column-inactive' : ''}" data-statusbar-layout-item data-status-item-id="${escapeHtml(normalized.id)}" data-status-type="${escapeHtml(normalized.type)}" data-status-column-active="${inactive ? 'false' : 'true'}">
    <div class="statusbar-layout-item-head"><span class="statusbar-drag-handle" draggable="true" title="Drag to reorder">${materialSymbol('drag_indicator',20)}</span><strong>Column ${index + 1}</strong><span class="statusbar-column-state">Not used</span><div><button type="button" data-action="statusbar-item-left" title="Move left">${materialSymbol('chevron_left',18)}</button><button type="button" data-action="statusbar-item-right" title="Move right">${materialSymbol('chevron_right',18)}</button><button type="button" class="danger" data-action="statusbar-item-delete" title="Delete column">${materialSymbol('delete',18)}</button></div></div>
    <div class="field"><label>Content</label><select class="settings-input" data-status-item-type>${statusBarLayoutTypeOptions(normalized.type)}</select></div>
    <div class="field statusbar-item-custom-field"><label>Custom text</label><input class="settings-input" data-status-item-custom value="${escapeHtml(normalized.customText)}" placeholder="Custom status text"></div>
    <div class="field statusbar-item-entity-field"><label>Entity</label><select class="settings-input" data-status-item-entity><option value="">Not selected</option>${entities.map((entity)=>`<option value="${escapeHtml(entity.entity_id)}" ${entity.entity_id===normalized.entityId?'selected':''}>${escapeHtml(localName(entity.name))} · ${escapeHtml(TYPE_LABELS[entity.entity_type] || entity.entity_type)}</option>`).join('')}</select></div>
    <div class="field statusbar-item-entity-field"><label>Entity display</label><select class="settings-input" data-status-item-display>${[['name_state','Name and value'],['name','Name only'],['state','State only'],['value','Value and unit']].map(([v,l])=>`<option value="${v}" ${normalized.entityDisplay===v?'selected':''}>${l}</option>`).join('')}</select></div>
  </article>`;
}

function statusBarLayoutEditor(settings) {
  const layout = normalizeStatusBarLayout(settings);
  const alignment = normalizeStatusBarAlignment(settings.alignment);
  return `<div class="field-row statusbar-grid-controls"><div class="field"><label>Visible grid columns</label><input class="settings-input" type="number" min="1" max="24" name="layoutColumns" value="${layout.layoutColumns}" data-statusbar-column-count><small>Reducing this value hides later configured columns without deleting them. Hidden columns are outlined in red below.</small></div><div class="field"><label>Column alignment</label><select class="settings-input" name="alignment"><option value="distributed" ${alignment==='distributed'?'selected':''}>Distributed evenly</option><option value="left" ${alignment==='left'?'selected':''}>Left aligned</option><option value="center" ${alignment==='center'?'selected':''}>Centered group</option><option value="right" ${alignment==='right'?'selected':''}>Right aligned</option></select><small>Distributed mode fills the full bar. Other modes pack occupied columns together.</small></div></div><div class="field statusbar-layout-help"><label>Placement</label><p class="muted">Drag columns to reorder them. Add a <strong>Vertical divider</strong> as column content wherever a separator is needed. The arrow buttons provide a touch-friendly fallback.</p></div><div class="statusbar-layout-editor" data-statusbar-layout-editor style="--editor-status-columns:${layout.layoutColumns}">${layout.layoutItems.map((item,index)=>statusBarLayoutEditorItem(item,index,layout.layoutColumns)).join('')}</div>`;
}

function refreshStatusbarConditionalSettings(form) {
  if (!form) return;
  const types = new Set(statusbarLayoutItemsFromForm(form).map((item) => item.type));
  form.querySelectorAll('[data-statusbar-time-settings]').forEach((section) => { section.hidden = !(types.has('time') || types.has('date')); });
  form.querySelectorAll('[data-statusbar-profile-settings]').forEach((section) => { section.hidden = !types.has('profile'); });
}

function renderStatusbarSettingsEditor() {
  const s = state.config?.ui?.statusBar || {};
  const panels = {
    layout: `<section class="settings-section"><h3>Visibility</h3><label class="checkbox-row"><input type="checkbox" name="visible" ${s.visible!==false?'checked':''}> Show status bar outside edit mode</label></section><section class="settings-section"><div class="settings-section-heading"><div><h3>One-row status grid</h3><p class="muted">Place data points and indicators in any order across a single configurable row.</p></div></div>${statusBarLayoutEditor(s)}</section>`,
    content: `<section class="settings-section" data-statusbar-time-settings><h3>Time and date formatting</h3><div class="field-row"><div class="field"><label>Time zone</label><input class="settings-input" name="timezone" value="${escapeHtml(s.timezone||'')}" placeholder="Device time zone, or Europe/Berlin"></div><div class="field"><label>Date style</label><select class="settings-input" name="dateStyle">${[['short','Short'],['medium','Medium'],['long','Long'],['full','Full']].map(([v,l])=>`<option value="${v}" ${(s.dateStyle||'long')===v?'selected':''}>${l}</option>`).join('')}</select></div></div><label class="checkbox-row"><input type="checkbox" name="showSeconds" ${s.showSeconds?'checked':''}> Show seconds</label><label class="checkbox-row"><input type="checkbox" name="hour12" ${s.hour12?'checked':''}> Use 12-hour time</label></section><section class="settings-section" data-statusbar-profile-settings><h3>Profile badge</h3><div class="field"><label>Profile text</label><input class="settings-input" name="profileText" maxlength="2" value="${escapeHtml(s.profileText||'W')}"></div></section><section class="settings-section"><div class="settings-info-card">${materialSymbol('notifications',20)}<span>Alert sources and thresholds are configured only in <strong>Settings → Notifications</strong>.</span></div></section>`,
    appearance: `<section class="settings-section"><h3>Indicators</h3><div class="field-row"><div class="field"><label>Indicator style</label><select class="settings-input" name="indicatorStyle"><option value="plain" ${(s.indicatorStyle||'plain')==='plain'?'selected':''}>Plain</option><option value="chips" ${s.indicatorStyle==='chips'?'selected':''}>Background chips</option></select></div><div class="field"><label>Icon size</label><input class="settings-input" type="number" min="12" max="36" name="iconSize" value="${escapeHtml(s.iconSize||19)}"></div></div><div class="field"><label>Indicator color</label>${renderColorPicker('indicatorColor', s.indicatorColor || s.foreground || '#d0d0d0')}</div><div data-statusbar-profile-settings><div class="field-row"><div class="field"><label>Profile background</label>${renderColorPicker('profileBackground', s.profileBackground || s.foreground || '#d0d0d0')}</div><div class="field"><label>Profile foreground</label>${renderColorPicker('profileForeground', s.profileForeground || '#000000')}</div></div></div></section><section class="settings-section"><h3>Typography and spacing</h3><div class="field-row"><div class="field"><label>Font size</label><input class="settings-input" type="number" min="9" max="28" name="fontSize" value="${escapeHtml(s.fontSize||13)}"></div><div class="field"><label>Font weight</label><select class="settings-input" name="fontWeight">${[100,200,300,400,500,550,600,700,800,900].map((v)=>`<option value="${v}" ${Number(s.fontWeight||550)===v?'selected':''}>${v}</option>`).join('')}</select></div></div><div class="field-row"><div class="field"><label>Horizontal padding</label><input class="settings-input" type="number" min="0" max="40" name="horizontalPadding" value="${escapeHtml(s.horizontalPadding??10)}"></div><div class="field"><label>Item spacing</label><input class="settings-input" type="number" min="0" max="24" name="itemGap" value="${escapeHtml(s.itemGap??6)}"></div></div><label class="checkbox-row"><input type="checkbox" name="uppercase" ${s.uppercase?'checked':''}> Uppercase status text</label></section><section class="settings-section"><h3>Surface</h3><div class="field-row"><div class="field"><label>Height</label><input class="settings-input" type="number" min="28" max="96" name="height" value="${escapeHtml(s.height||40)}"></div><div class="field"><label>Corner radius</label><input class="settings-input" type="number" min="0" max="40" name="radius" value="${escapeHtml(s.radius||0)}"></div></div><div class="field-row"><div class="field"><label>Background</label>${renderColorPicker('background', s.background || '#000000')}</div><div class="field"><label>Foreground</label>${renderColorPicker('foreground', s.foreground || '#d0d0d0')}</div></div><div class="field"><label>Background opacity</label><input type="range" min="0" max="100" name="backgroundOpacity" value="${escapeHtml(s.backgroundOpacity??98)}"></div><div class="field-row"><div class="field"><label>Blur</label><input class="settings-input" type="number" min="0" max="40" name="blur" value="${escapeHtml(s.blur||0)}"></div><div class="field"><label>Bottom border</label><input class="settings-input" type="number" min="0" max="8" name="borderWidth" value="${escapeHtml(s.borderWidth||0)}"></div></div><div class="field"><label>Border color</label>${renderColorPicker('borderColor', s.borderColor || '#252525')}</div><label class="checkbox-row"><input type="checkbox" name="sticky" ${s.sticky!==false?'checked':''}> Keep bar fixed at top</label><label class="checkbox-row"><input type="checkbox" name="shadow" ${s.shadow?'checked':''}> Show shadow</label></section>`
  };
  return flowEditorShell({ title:'Status Bar', formAttribute:'data-statusbar-form', steps:[{id:'layout',label:'Layout'},{id:'content',label:'Content'},{id:'appearance',label:'Appearance'}], panels, preview:statusbarEditorPreview(), submitLabel:'Save status bar' });
}


function screensaverWidgetLabel(item) {
  if (!item) return 'Unknown widget';
  if (item.kind === 'system') return item.settings?.title || SYSTEM_WIDGETS[item.widgetType]?.label || item.widgetType || 'System widget';
  const entity = entityForItem(item);
  return item.settings?.customTitle || localName(entity?.name || item.snapshot?.name || item.entityId);
}

function screensaverWidgetOptions(selected = '') {
  const widgets = allDashboardItems();
  return `<option value="">Choose a widget…</option>${widgets.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selected ? 'selected' : ''}>${escapeHtml(screensaverWidgetLabel(item))} · ${escapeHtml(item.kind === 'system' ? SYSTEM_WIDGETS[item.widgetType]?.label || item.widgetType : TYPE_LABELS[item.entityType] || item.entityType || 'Entity')}</option>`).join('')}`;
}

function screensaverTriggerRow(trigger = {}, key = trigger.id || uid('trigger')) {
  const entities = accessibleEntities().sort((a,b) => localName(a.name).localeCompare(localName(b.name)));
  return `<article data-screensaver-trigger-row data-trigger-key="${escapeHtml(key)}"><div class="screensaver-trigger-row-head"><strong>${materialSymbol('bolt',19)} Trigger</strong><button type="button" class="inline-icon-button danger" data-action="remove-screensaver-trigger" title="Remove trigger">${materialSymbol('delete',20)}</button></div><input type="hidden" name="triggerId:${escapeHtml(key)}" value="${escapeHtml(trigger.id || uid('trigger'))}"><div class="field"><label>Trigger entity</label><select class="settings-input" name="triggerEntity:${escapeHtml(key)}"><option value="">Disabled</option>${entities.map((entity) => `<option value="${escapeHtml(entity.entity_id)}" ${entity.entity_id === trigger.entityId ? 'selected' : ''}>${escapeHtml(localName(entity.name))}</option>`).join('')}</select></div><div class="field-row"><div class="field"><label>Condition</label><select class="settings-input" name="triggerOperator:${escapeHtml(key)}">${[['truthy','Turns active / on'],['equals','Equals'],['not_equals','Does not equal'],['greater','Above'],['less','Below']].map(([value,label]) => `<option value="${value}" ${trigger.operator === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="field"><label>Compare value</label><input class="settings-input" name="triggerValue:${escapeHtml(key)}" value="${escapeHtml(trigger.value || '')}"></div></div><div class="field"><label>Widget to show</label><select class="settings-input" name="triggerWidget:${escapeHtml(key)}">${screensaverWidgetOptions(trigger.widgetId || trigger.cameraWidgetId || '')}</select><small>Any dashboard widget can be displayed, including cameras, media controls, sensors, clocks, weather, groups, and custom widgets.</small></div><div class="field-row"><div class="field"><label>Display title</label><input class="settings-input" name="triggerTitle:${escapeHtml(key)}" value="${escapeHtml(trigger.title || '')}"></div><div class="field"><label>Duration (seconds)</label><input class="settings-input" type="number" min="5" max="600" name="triggerDuration:${escapeHtml(key)}" value="${escapeHtml(trigger.durationSeconds || 30)}"></div></div><div class="field"><label>Column span</label><select class="settings-input" name="triggerColumnSpan:${escapeHtml(key)}">${[1,2,3,4].map((value)=>`<option value="${value}" ${Math.max(1,Number(trigger.columnSpan)||1)===value?'selected':''}>${value} column${value===1?'':'s'}</option>`).join('')}</select><small>The span is capped by the screensaver widget-grid column count.</small></div></article>`;
}

function screensaverTriggerEditor() {
  const triggers = [...(screensaverSettings().triggers || [])];
  return `<section class="settings-section"><div class="settings-section-heading"><div><h3>Triggered screensaver widgets</h3><p class="muted">When an entity condition matches, the selected widget is shown immediately. Triggers also get evaluated when the idle screensaver starts.</p></div><button type="button" class="pill-button" data-action="add-screensaver-trigger">${icon('plus',18)} Add trigger</button></div><div class="screensaver-trigger-editor" data-screensaver-trigger-editor>${triggers.length ? triggers.map((trigger) => screensaverTriggerRow(trigger, trigger.id)).join('') : screensaverTriggerRow({}, uid('trigger-row'))}</div><small>Up to eight triggers can be configured. Rows without both an entity and widget are ignored.</small></section>`;
}

function screensaverTriggersFromForm(data, form) {
  const triggers = [];
  for (const row of form.querySelectorAll('[data-screensaver-trigger-row]')) {
    const key = row.dataset.triggerKey;
    const entityId = String(data.get(`triggerEntity:${key}`) || '');
    const widgetId = String(data.get(`triggerWidget:${key}`) || '');
    if (!entityId || !widgetId) continue;
    triggers.push({ id: String(data.get(`triggerId:${key}`) || uid('trigger')), entityId, operator: String(data.get(`triggerOperator:${key}`) || 'truthy'), value: String(data.get(`triggerValue:${key}`) || ''), widgetId, title: String(data.get(`triggerTitle:${key}`) || ''), durationSeconds: Math.max(5, Math.min(600, Number(data.get(`triggerDuration:${key}`)) || 30)), columnSpan: Math.max(1, Math.min(4, Number(data.get(`triggerColumnSpan:${key}`)) || 1)) });
    if (triggers.length >= 8) break;
  }
  return triggers;
}


function localizationEditorPanel() {
  const settings = localizationSettings();
  const languages = Object.keys(state.defaultDictionaries || {}).length ? Object.keys(state.defaultDictionaries) : ['en','de','fr','es','it','nl'];
  const labels = { en:'English',de:'Deutsch',fr:'Français',es:'Español',it:'Italiano',nl:'Nederlands' };
  const dictionary = dashboardDictionary(settings.language);
  return `<section class="settings-section"><h3>Dashboard language</h3><p class="muted">When enabled, the complete frontend is translated, including kiosk mode, editors, dialogs, widget content, asynchronous updates, and accessibility text. The integration driver setup remains English.</p><label class="checkbox-row"><input type="checkbox" name="localizationEnabled" ${settings.enabled?'checked':''}> Automatically translate dashboard content</label><div class="field"><label>Language</label><select class="settings-input" name="localizationLanguage" data-localization-language>${languages.map((code)=>`<option value="${escapeHtml(code)}" ${settings.language===code?'selected':''}>${escapeHtml(labels[code]||code.toUpperCase())}</option>`).join('')}</select></div></section><section class="settings-section translation-dictionary-editor"><div class="settings-section-heading"><div><h3>Local JSON dictionary</h3><p class="muted">Edit any dashboard translation or add new keys. Exact displayed phrases are matched case-insensitively after spaces and dashes are converted to underscores.</p></div><button type="button" class="pill-button" data-action="reset-translation-dictionary">${materialSymbol('restart_alt',18)} Reset defaults</button></div><textarea class="settings-input settings-code translation-dictionary-textarea" name="translationDictionary" data-translation-dictionary spellcheck="false">${escapeHtml(JSON.stringify(dictionary,null,2))}</textarea><small data-translation-dictionary-status>Stored locally in the dashboard configuration. Example: <code>"eco_mode": "Eco-Modus"</code>.</small></section>`;
}

function entityAccessEditorPanel() {
  const access = entityAccessSettings();
  const catalog = [...(state.entityCatalog || [])].sort((a,b)=>localName(a.name,a.entity_id).localeCompare(localName(b.name,b.entity_id)));
  const supported = catalog.filter((entity)=>entity.dashboard_supported !== false);
  const unsupported = catalog.filter((entity)=>entity.dashboard_supported === false);
  const enabled = new Set(access.includedIds);
  return `<section class="settings-section"><h3>Dashboard entity access</h3><p class="muted">Choose which entities can be selected and displayed by UC Dashboard. The Entity template widget can use any enabled entity type, including types without a dedicated dashboard widget. Existing widgets using filtered entities remain in the configuration but show an access-disabled placeholder.</p><div class="entity-access-mode"><label><input type="radio" name="entityAccessMode" value="all" ${access.mode==='all'?'checked':''}><span><strong>All available entities</strong><small>Automatically include every available entity. Types without a dedicated widget remain available to Entity templates.</small></span></label><label><input type="radio" name="entityAccessMode" value="selected" ${access.mode==='selected'?'checked':''}><span><strong>Selected entities only</strong><small>Only checked entities are available to the dashboard.</small></span></label></div><div class="field"><label>Filter entities</label><input class="settings-input" type="search" data-settings-entity-search placeholder="Search by name, ID or type"></div><div class="entity-access-summary"><span>${supported.length} supported</span><span>${unsupported.length} available but unsupported</span></div></section><section class="settings-section entity-access-list" data-settings-entity-list><h3>Supported entities</h3>${supported.length?supported.map((entity)=>`<label class="entity-access-row" data-settings-entity-card data-search-text="${escapeHtml(`${localName(entity.name,entity.entity_id)} ${entity.entity_id} ${entity.entity_type}`.toLowerCase())}"><input type="checkbox" name="entityAccessId" value="${escapeHtml(entity.entity_id)}" ${access.mode==='all'||enabled.has(entity.entity_id)?'checked':''}><span>${renderWidgetIcon({settings:{}},entity.entity_type,24)}<b>${escapeHtml(localName(entity.name,entity.entity_id))}</b><small>${escapeHtml(entity.entity_id)}</small></span><em>${escapeHtml(TYPE_LABELS[entity.entity_type]||entity.entity_type)}</em></label>`).join(''):'<p class="muted">No supported entities are currently available.</p>'}<h3>Available but not supported</h3>${unsupported.length?unsupported.map((entity)=>`<label class="entity-access-row unsupported" data-settings-entity-card data-search-text="${escapeHtml(`${localName(entity.name,entity.entity_id)} ${entity.entity_id} ${entity.entity_type}`.toLowerCase())}"><input type="checkbox" name="entityAccessId" value="${escapeHtml(entity.entity_id)}" ${access.mode==='all'||enabled.has(entity.entity_id)?'checked':''}><span>${materialSymbol('data_object',24)}<b>${escapeHtml(localName(entity.name,entity.entity_id))}</b><small>${escapeHtml(entity.entity_id)}</small></span><em>${escapeHtml(entity.entity_type||'unknown')}</em><p>${escapeHtml(entity.unsupported_reason||'Use an Entity template widget to configure this type.')}</p></label>`).join(''):'<p class="muted">Every available entity type is supported.</p>'}</section>`;
}

function countDashboardConfigWidgets(config = state.config) {
  let count = 0;
  const visit = (items) => {
    for (const item of items || []) {
      count += 1;
      if (item?.kind === 'system' && item.widgetType === 'tab_container') {
        for (const tab of item.settings?.tabs || []) visit(tab.items);
      } else if (item?.kind === 'system' && CONTAINER_WIDGET_TYPES.has(item.widgetType)) visit(item.settings?.items);
    }
  };
  for (const dashboard of config?.dashboards || []) visit(dashboard.items);
  return count;
}

function dashboardConfigFromBackup(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Backup must contain a JSON object');
  if (value.format === 'uc-dashboard-backup') {
    if (Number(value.formatVersion) !== 1) throw new Error(`Unsupported backup format version: ${value.formatVersion}`);
    if (!value.dashboardConfig || typeof value.dashboardConfig !== 'object') throw new Error('Backup does not contain dashboard data');
    return value.dashboardConfig;
  }
  return value;
}

function validateDashboardBackupConfig(config) {
  return Boolean(config && typeof config === 'object' && Array.isArray(config.dashboards) && config.dashboards.length && config.dashboards.every((dashboard) =>
    dashboard && typeof dashboard.id === 'string' && typeof dashboard.name === 'string' && Array.isArray(dashboard.items)));
}

function fileToText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Backup file could not be read'));
    reader.readAsText(file);
  });
}

function updateBackupImportControls(form) {
  if (!form) return;
  const candidate = state.backupImportCandidate;
  const preview = form.querySelector('[data-backup-import-preview]');
  const confirmation = form.querySelector('[data-backup-import-confirm]');
  const importButton = form.querySelector('[data-action="import-dashboard-backup"]');
  if (confirmation) confirmation.disabled = !candidate || state.backupImportBusy;
  if (importButton) importButton.disabled = !candidate || !confirmation?.checked || state.backupImportBusy;
  if (!preview) return;
  if (!candidate) {
    preview.className = 'backup-import-preview empty';
    preview.innerHTML = `${materialSymbol('upload_file',28)}<div><strong>Select a UC Dashboard backup</strong><small>The file is checked before the current configuration can be replaced.</small></div>`;
    return;
  }
  preview.className = 'backup-import-preview ready';
  preview.innerHTML = `${materialSymbol('verified',28)}<div><strong>${escapeHtml(candidate.fileName)}</strong><small>${escapeHtml(translateDashboardText('dashboard_count',{count:candidate.dashboards}))} · ${escapeHtml(translateDashboardText('widget_count',{count:candidate.widgets}))} · ${escapeHtml(translateDashboardText('schema_version',{version:candidate.schemaVersion || translateDashboardText('unknown')}))}${candidate.iconAssets ? ` · ${escapeHtml(translateDashboardText('cached_icon_count',{count:candidate.iconAssets}))}` : ''}</small><small>${escapeHtml(translateDashboardText('created_at',{date:candidate.exportedAt}))}${candidate.applicationVersion ? ` · UC Dashboard ${escapeHtml(candidate.applicationVersion)}` : ''}</small><small>${escapeHtml(translateDashboardText(candidate.hasSettings ? 'Includes portable integration settings. Core API credentials are never included.' : 'Dashboard configuration only.'))}</small></div>`;
}

async function inspectDashboardBackupFile(input) {
  const form = input?.closest('[data-settings-form]');
  const file = input?.files?.[0];
  state.backupImportCandidate = null;
  const confirmation = form?.querySelector('[data-backup-import-confirm]');
  if (confirmation) confirmation.checked = false;
  if (!file) { updateBackupImportControls(form); return; }
  if (file.size > 64 * 1024 * 1024) {
    toast('Backup file must be 64 MB or smaller', 'error');
    input.value = '';
    updateBackupImportControls(form);
    return;
  }
  try {
    const backup = JSON.parse(await fileToText(file));
    const config = dashboardConfigFromBackup(backup);
    if (!validateDashboardBackupConfig(config)) throw new Error('Backup contains an invalid dashboard configuration');
    state.backupImportCandidate = {
      backup,
      fileName: file.name || 'uc-dashboard-backup.json',
      dashboards: config.dashboards.length,
      widgets: countDashboardConfigWidgets(config),
      schemaVersion: Number(config.version) || 0,
      exportedAt: backup.exportedAt ? new Date(backup.exportedAt).toLocaleString() : translateDashboardText('Unknown date'),
      applicationVersion: String(backup.application?.version || ''),
      hasSettings: Boolean(backup.settings && typeof backup.settings === 'object'),
      iconAssets: Array.isArray(backup.iconAssets) ? backup.iconAssets.length : 0
    };
  } catch (error) {
    input.value = '';
    toast(`Backup is invalid: ${error.message}`, 'error');
  }
  updateBackupImportControls(form);
}

function backupDownloadFilename(response) {
  const disposition = String(response.headers.get('content-disposition') || '');
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || `uc-dashboard-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
}

async function exportDashboardBackup(button) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    const response = await fetch('/api/backup', { cache: 'no-store' });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || `Backup export failed (${response.status})`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = backupDownloadFilename(response);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Dashboard backup exported');
  } catch (error) {
    toast(error.message || String(error), 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function importDashboardBackup(form, button) {
  const candidate = state.backupImportCandidate;
  const confirmation = form?.querySelector('[data-backup-import-confirm]');
  if (!candidate) return toast('Select a valid backup file first', 'error');
  if (!confirmation?.checked) return toast('Confirm that the current dashboard data may be replaced', 'error');
  if (state.backupImportBusy) return;
  state.backupImportBusy = true;
  updateBackupImportControls(form);
  if (button) button.innerHTML = `${materialSymbol('progress_activity',18)} Importing…`;
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  state.editorDirty = false;
  try {
    const restoreSettings = form.querySelector('[name="restoreBackupSettings"]')?.checked !== false;
    const response = await fetch('/api/backup/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ backup: candidate.backup, restoreSettings })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Backup import failed (${response.status})`);
    toast(`Backup restored: ${result.summary?.dashboards || candidate.dashboards} dashboards`);
    const restoredPort = Number(result.settings?.dashboardPort) || Number(state.settings.dashboardPort) || 11080;
    setTimeout(() => {
      const nextUrl = new URL(window.location.href);
      if (restoredPort !== Number(window.location.port || (window.location.protocol === 'https:' ? 443 : 80))) nextUrl.port = String(restoredPort);
      window.location.assign(nextUrl.toString());
    }, 650);
  } catch (error) {
    state.backupImportBusy = false;
    if (button) button.innerHTML = `${materialSymbol('settings_backup_restore',18)} Import backup`;
    updateBackupImportControls(form);
    toast(error.message || String(error), 'error');
  }
}

function backupEditorPanel() {
  const dashboards = state.config?.dashboards?.length || 0;
  const widgets = countDashboardConfigWidgets();
  return `<section class="settings-section"><div class="settings-section-heading"><div><h3>Export backup</h3><p class="muted">Download all dashboards, widgets, presets, backgrounds, localization dictionaries, screensaver rules, navigation, status-bar configuration, portable integration settings, and locally cached unfolded.tools icons when enabled.</p></div><button type="button" class="pill-button primary" data-action="export-dashboard-backup">${materialSymbol('download',18)} Export backup</button></div><div class="backup-current-summary"><span><b>${dashboards}</b><small>Dashboards</small></span><span><b>${widgets}</b><small>Widgets</small></span><span><b>${escapeHtml(state.runtime?.applicationVersion || '—')}</b><small>Application</small></span></div><div class="settings-info-card">${materialSymbol('security',20)}<span>Core API keys, authentication data, session unlocks, and browser-local clipboard contents are never exported.</span></div></section><section class="settings-section backup-import-section"><h3>Import backup</h3><p class="muted">Restoring replaces the complete dashboard configuration. A safety backup of the current configuration is created on the integration before anything is overwritten.</p><div class="field"><label>Backup file</label><input class="settings-input" type="file" accept="application/json,.json" data-dashboard-backup-file></div><div class="backup-import-preview empty" data-backup-import-preview>${materialSymbol('upload_file',28)}<div><strong>Select a UC Dashboard backup</strong><small>The file is checked before the current configuration can be replaced.</small></div></div><label class="checkbox-row"><input type="checkbox" name="restoreBackupSettings" checked> Restore portable integration settings</label><small class="backup-setting-note">Includes dashboard port, charging-gated hosting, reconnect behavior, log level, and unfolded.tools cache preferences. Remote Core and unfolded.tools API keys remain unchanged.</small><label class="checkbox-row backup-import-confirm"><input type="checkbox" data-backup-import-confirm disabled> Replace the current dashboard configuration with this backup</label><button type="button" class="pill-button danger backup-import-button" data-action="import-dashboard-backup" disabled>${materialSymbol('settings_backup_restore',18)} Import backup</button></section>`;
}

function iconLibrarySettingsPanel() {
  const overrides = state.settings.environmentOverrides || {};
  const configured = Boolean(state.settings.unfoldedToolsApiKeyConfigured);
  return `<section class="settings-section"><h3>unfolded.tools Icon Library</h3><p class="muted">Connect the public unfolded.tools API to browse app icons, TV app icons, community icons, and country-specific TV channel logos directly inside every dashboard icon picker.</p><div class="connection-summary ${configured ? 'ready' : 'missing'}"><span class="connection-dot"></span><div><strong>${configured ? 'API key configured' : 'API key not configured'}</strong><small>${configured ? 'The key is stored only in the integration settings and is never sent to the browser.' : 'Create an API key at unfolded.tools/settings and enter it below.'}</small></div></div><div class="field"><label>${configured ? 'Replace API key' : 'API key'}</label><input class="settings-input" type="password" name="unfoldedToolsApiKey" autocomplete="new-password" placeholder="uk_…" ${overrides.unfoldedToolsApiKey ? 'disabled' : ''}><small>Leave empty to keep the currently stored key.</small></div>${configured && !overrides.unfoldedToolsApiKey ? '<label class="checkbox-row"><input type="checkbox" name="clearUnfoldedToolsApiKey"> Remove the stored API key</label>' : ''}<div class="settings-action-row"><button type="button" class="pill-button" data-action="test-unfolded-tools-connection">${materialSymbol('network_check',18)} Test connection</button><a class="pill-button" href="https://unfolded.tools/settings" target="_blank" rel="noopener noreferrer">${materialSymbol('key',18)} Get an API key</a></div><div class="settings-info-card" data-unfolded-tools-status>${materialSymbol('info',20)}<span>Save the settings before opening the icon library.</span></div></section><section class="settings-section"><h3>Local icon cache</h3><label class="checkbox-row"><input type="checkbox" name="unfoldedToolsCacheSelected" ${state.settings.unfoldedToolsCacheSelected !== false ? 'checked' : ''} ${overrides.unfoldedToolsCacheSelected ? 'disabled' : ''}> Cache selected icons locally for offline use</label><label class="checkbox-row"><input type="checkbox" name="unfoldedToolsIncludeInBackup" ${state.settings.unfoldedToolsIncludeInBackup !== false ? 'checked' : ''} ${overrides.unfoldedToolsIncludeInBackup ? 'disabled' : ''}> Include cached unfolded.tools icons in dashboard backups</label><p class="muted">Only selected icons are cached. Library thumbnails remain remote and load only when visible.</p><div class="settings-action-row"><button type="button" class="pill-button" data-action="refresh-unfolded-tools-cache">${materialSymbol('refresh',18)} Refresh cache details</button><button type="button" class="pill-button danger" data-action="clear-unfolded-tools-cache">${materialSymbol('delete_sweep',18)} Clear icon cache</button></div><div class="read-only-row"><span>Cached icons</span><code data-unfolded-tools-cache-summary>Loading…</code></div></section>`;
}

async function refreshUnfoldedToolsSettingsStatus(form = modalRoot.querySelector('[data-settings-form]')) {
  if (!form) return;
  const cacheSummary = form.querySelector('[data-unfolded-tools-cache-summary]');
  try {
    const response = await fetch('/api/unfolded-tools/status', { cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Status request failed (${response.status})`);
    if (cacheSummary) cacheSummary.textContent = `${result.cache?.icons || 0} · ${formatByteSize(result.cache?.bytes || 0)}`;
  } catch (error) {
    if (cacheSummary) cacheSummary.textContent = error.message;
  }
}

async function testUnfoldedToolsConnection(form, button) {
  const status = form?.querySelector('[data-unfolded-tools-status]');
  const apiKey = String(form?.querySelector('[name="unfoldedToolsApiKey"]')?.value || '').trim();
  if (button) button.disabled = true;
  if (status) status.innerHTML = `${materialSymbol('progress_activity',20)}<span>Testing api.unfolded.tools…</span>`;
  try {
    const response = await fetch('/api/unfolded-tools/test', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ apiKey }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Connection test failed (${response.status})`);
    if (status) status.innerHTML = `${materialSymbol('check_circle',20)}<span>Connected. ${result.total || 0} app icons are currently available.</span>`;
  } catch (error) {
    if (status) status.innerHTML = `${materialSymbol('error',20)}<span>${escapeHtml(error.message)}</span>`;
  } finally {
    if (button) button.disabled = false;
  }
}

async function clearUnfoldedToolsCache(form) {
  if (!window.confirm(translateDashboardText('Clear every locally cached unfolded.tools icon? Existing widgets using cached files may show a missing icon until a replacement is selected.'))) return;
  const response = await fetch('/api/unfolded-tools/cache', { method:'DELETE' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) return toast(result.error || `Cache clear failed (${response.status})`, 'error');
  state.config.iconAssets = {};
  persistConfig();
  await refreshUnfoldedToolsSettingsStatus(form);
  toast(translateDashboardText('unfolded.tools icon cache cleared'));
}

function renderSettingsEditor() {
  const overrides = state.settings.environmentOverrides || {};
  const kioskUrl = new URL(window.location.href); kioskUrl.searchParams.set('kiosk','');
  const provisioned = state.settings.apiKeyConfigured;
  const provisionedAt = state.settings.provisionedAt ? new Date(state.settings.provisionedAt).toLocaleString() : 'Not provisioned';
  const saver = state.config?.ui?.screensaver || {};
  const kiosk = state.config?.ui?.kiosk || {};
  const notifications = notificationSettings();
  const panels = {
    connection: `<section class="settings-section"><h3>Remote connection</h3><div class="connection-summary ${provisioned?'ready':'missing'}"><span class="connection-dot"></span><div><strong>${provisioned?'Core API key provisioned':'Core API key not provisioned'}</strong><small>${provisioned?`Created as ${escapeHtml(state.settings.apiKeyName||'UC Dashboard')} · ${escapeHtml(provisionedAt)}`:'Reconfigure the integration on the Remote and provide the web-configurator PIN.'}</small></div></div><div class="read-only-row"><span>Core WebSocket</span><code>${escapeHtml(state.settings.remoteWsUrl||'Not configured')}</code></div><div class="read-only-row"><span>Core REST</span><code>${escapeHtml(state.settings.remoteHttpUrl||'Not configured')}</code></div><button type="button" class="pill-button settings-refresh-button" data-action="refresh-entities">${icon('refresh',18)} Force refresh entities</button><label class="checkbox-row"><input type="checkbox" name="reconnect" ${state.settings.reconnect?'checked':''}> Reconnect automatically</label></section>`,
    display: `<section class="settings-section"><h3>Dashboard and kiosk</h3><div class="field"><label>Dashboard port</label><input name="dashboardPort" type="number" min="1024" max="65535" class="settings-input" value="${escapeHtml(state.settings.dashboardPort)}" ${overrides.dashboardPort?'disabled':''}></div><div class="read-only-row"><span>Kiosk URL</span><code>${escapeHtml(kioskUrl.toString())}</code></div><label class="checkbox-row"><input type="checkbox" name="kioskScaleToFit" ${kiosk.scaleToFit?'checked':''}> Scale the complete dashboard to fit the screen in kiosk mode</label><label class="checkbox-row"><input type="checkbox" name="kioskAllowUpscale" ${kiosk.allowUpscale?'checked':''}> Allow kiosk scaling above 100%</label><div class="field"><label>Scaled dashboard width</label><select class="settings-input" name="kioskWidthMode"><option value="fill" ${(kiosk.widthMode||'fill')==='fill'?'selected':''}>Reflow at native size and scroll vertically</option><option value="center" ${kiosk.widthMode==='center'?'selected':''}>Keep fixed width and center it</option><option value="left" ${kiosk.widthMode==='left'?'selected':''}>Keep fixed width and left-align it</option></select><small>Reflow keeps widgets readable at the responsive viewport width and scrolls when needed. Center and left fit the complete fixed-width dashboard.</small></div><div class="field"><label>Kiosk fit padding</label><input class="settings-input" type="number" min="0" max="80" name="kioskPadding" value="${escapeHtml(kiosk.padding||0)}"></div><label class="checkbox-row"><input type="checkbox" name="chargingGated" ${state.settings.chargingGated?'checked':''} ${overrides.chargingGated?'disabled':''}> Only host the dashboard while charging</label><div class="field"><label>Integration log level</label><select class="settings-input" name="logLevel" ${overrides.logLevel?'disabled':''}>${[['error','Errors only'],['warn','Warnings'],['info','Information'],['debug','Debug'],['trace','Trace (very verbose)']].map(([value,label])=>`<option value="${value}" ${(state.settings.logLevel||'info')===value?'selected':''}>${label}</option>`).join('')}</select><small>Debug logs Core requests, reconnects, entity refreshes, media requests, camera handling and dashboard clients. Credentials and camera URLs are redacted.</small></div></section>`,
    icons: iconLibrarySettingsPanel(),
    language: localizationEditorPanel(),
    entities: entityAccessEditorPanel(),
    screensaver: `<section class="settings-section"><h3>Screensaver appearance</h3><label class="checkbox-row"><input type="checkbox" name="screensaverEnabled" ${saver.enabled?'checked':''}> Enable idle screensaver</label><div class="field-row"><div class="field"><label>Start after seconds</label><input class="settings-input" type="number" min="15" max="86400" name="screensaverTimeout" value="${escapeHtml(saver.timeoutSeconds||300)}"></div><div class="field"><label>Layout</label><select class="settings-input" name="screensaverMode">${[['clock','Clock'],['image','Image only'],['clock_image','Clock over image']].map(([v,l])=>`<option value="${v}" ${saver.mode===v?'selected':''}>${l}</option>`).join('')}</select></div></div><div class="field"><label>Title</label><input class="settings-input" name="screensaverTitle" value="${escapeHtml(saver.title||'')}"></div><div class="field"><label>Image URL</label><input class="settings-input" name="screensaverImage" value="${escapeHtml(saver.image||'')}"></div><div class="field-row"><div class="field"><label>Upload image</label><input class="settings-input" type="file" name="screensaverImageFile" accept="image/*"></div><div class="field"><label>Image fit</label><select class="settings-input" name="screensaverImageFit">${['cover','contain','fill'].map((value)=>`<option value="${value}" ${(saver.imageFit||'cover')===value?'selected':''}>${value}</option>`).join('')}</select></div></div><div class="field-row"><div class="field"><label>Background</label>${renderColorPicker('screensaverBackground', saver.background || '#000000')}</div><div class="field"><label>Foreground</label>${renderColorPicker('screensaverForeground', saver.foreground || '#ffffff')}</div></div><div class="field"><label>Image darkening</label><input type="range" min="0" max="90" name="screensaverOverlay" value="${escapeHtml(saver.overlay??25)}"></div><div class="field-row"><div class="field"><label>Content scale</label><input type="range" min="50" max="180" name="screensaverContentScale" value="${escapeHtml(saver.contentScale||100)}"></div><div class="field"><label>Clock scale</label><input type="range" min="50" max="180" name="screensaverClockSize" value="${escapeHtml(saver.clockSize||100)}"></div></div><div class="field"><label>Movement loop duration (seconds)</label><input class="settings-input" type="number" min="30" max="1800" name="screensaverMovementDuration" value="${escapeHtml(saver.movementDuration||180)}"></div><div class="field"><label>Triggered widget grid columns</label><select class="settings-input" name="screensaverWidgetColumns">${[1,2,3,4].map((value)=>`<option value="${value}" ${Math.max(1,Number(saver.widgetColumns)||2)===value?'selected':''}>${value} column${value===1?'':'s'}</option>`).join('')}</select><small>Triggered widgets reserve this grid below the clock. Each trigger can choose its own column span.</small></div><label class="checkbox-row"><input type="checkbox" name="screensaverShowDate" ${saver.showDate!==false?'checked':''}> Show date</label><label class="checkbox-row"><input type="checkbox" name="screensaverShowBattery" ${saver.showBattery!==false?'checked':''}> Show battery</label><label class="checkbox-row"><input type="checkbox" name="screensaverShowConnection" ${saver.showConnection?'checked':''}> Show connection status</label><label class="checkbox-row"><input type="checkbox" name="screensaverShowWakeHint" ${saver.showWakeHint!==false?'checked':''}> Show wake hint</label><label class="checkbox-row"><input type="checkbox" name="screensaverMovement" ${saver.movement!==false?'checked':''}> Use endless burn-in movement loop</label><section class="screensaver-lock-settings"><h3>Lock mode</h3><label class="checkbox-row"><input type="checkbox" name="screensaverLockEnabled" ${saver.lockEnabled?'checked':''}> Require a PIN to leave the screensaver</label><div class="field-row"><div class="field"><label>${saver.lockPinHash?'Replace screensaver PIN':'Screensaver PIN'}</label><input class="settings-input" type="password" inputmode="numeric" autocomplete="new-password" name="screensaverLockPin" placeholder="${saver.lockPinHash?'Leave empty to keep current PIN':'Required when lock mode is enabled'}"></div><div class="field"><label>PIN hint</label><input class="settings-input" name="screensaverLockPinHint" value="${escapeHtml(saver.lockPinHint||'')}" placeholder="Optional hint"></div></div>${saver.lockPinHash?'<label class="checkbox-row"><input type="checkbox" name="screensaverLockPinClear"> Remove stored screensaver PIN</label>':''}</section><button type="button" class="pill-button" data-action="preview-screensaver">${icon('visibility',18)} Preview saved screensaver</button></section>`,
    triggers: screensaverTriggerEditor(),
    notifications: `<section class="settings-section"><h3>Automatic notifications</h3><p class="muted">These sources feed the Alert Center widget, the Active Alerts modal and the Status Bar indicator.</p><label class="checkbox-row"><input type="checkbox" name="notificationAutoLowBattery" ${notifications.autoLowBattery?'checked':''}> Low battery alerts</label><div class="field"><label>Low battery threshold</label><input class="settings-input" type="number" min="1" max="100" name="notificationBatteryThreshold" value="${escapeHtml(notifications.batteryThreshold)}"><small>Batteries below 10% are treated as critical.</small></div><label class="checkbox-row"><input type="checkbox" name="notificationAutoUnavailable" ${notifications.autoUnavailable?'checked':''}> Unavailable entity alerts</label><label class="checkbox-row"><input type="checkbox" name="notificationAutoUpdates" ${notifications.autoUpdates?'checked':''}> Available update alerts</label></section><section class="settings-section"><h3>Acknowledgement and dismissal</h3><div class="field"><label>Acknowledge for minutes</label><input class="settings-input" type="number" min="1" max="10080" name="notificationAcknowledgeMinutes" value="${escapeHtml(notifications.acknowledgeMinutes)}"></div><div class="settings-info-card">${materialSymbol('notifications_off',20)}<span>Dismissed alerts stay hidden until the affected entity changes state. If the same alert condition occurs again after recovery, it is shown again.</span></div><div class="field"><label>Maximum Status Bar alerts</label><input class="settings-input" type="number" min="1" max="500" name="notificationMaxStatusAlerts" value="${escapeHtml(notifications.maxStatusAlerts)}"><small>This limits the count used by the Status Bar indicator and Active Alerts modal.</small></div></section>`
  };
  panels.backup = backupEditorPanel();
  return flowEditorShell({ eyebrow:'UNFOLDED CIRCLE', title:'Settings', formAttribute:'data-settings-form', className:'main-settings-flow', steps:[{id:'connection',label:'Connection'},{id:'display',label:'Display'},{id:'icons',label:'Icons'},{id:'language',label:'Language'},{id:'entities',label:'Entities'},{id:'screensaver',label:'Screensaver'},{id:'triggers',label:'Triggers'},{id:'notifications',label:'Notifications'},{id:'backup',label:'Backup'}], panels, preview:settingsEditorPreview(), submitLabel:'Save settings' });
}


function renderBackgroundSettingsEditor() {
  const storedBackground = currentDashboard()?.background || {};
  const preset = dashboardBackgroundPreset(storedBackground);
  const background = resolvedDashboardBackground(storedBackground);
  const selectedSaved = preset.startsWith('saved:') ? savedBackgroundPresetByKey(preset) : null;
  const builtInCards = Object.entries(DASHBOARD_BACKGROUND_PRESETS).map(([key, value]) => `<label class="background-preset-card"><input type="radio" name="preset" value="${escapeHtml(key)}" ${preset === key ? 'checked' : ''}><span data-background-definition="${escapeHtml(JSON.stringify(value))}" style="--background-preset-color:${escapeHtml(value.color)};--background-preset-image:${value.image ? `url(&quot;${escapeHtml(value.image)}&quot;)` : 'none'}"><i></i><b>${escapeHtml(value.label)}</b><small>Built-in</small></span></label>`).join('');
  const savedCards = savedBackgroundPresets().map((entry) => renderSavedBackgroundPresetCard(entry, preset)).join('');
  const customCard = `<label class="background-preset-card"><input type="radio" name="preset" value="custom" ${preset === 'custom' ? 'checked' : ''}><span data-background-definition="${escapeHtml(JSON.stringify(normalizeBackgroundDefinition(background)))}" style="--background-preset-color:${escapeHtml(background.color)};--background-preset-image:${background.image ? `url(&quot;${escapeHtml(background.image)}&quot;)` : 'none'}"><i></i><b>Custom</b><small>Editable background</small></span></label>`;
  const panels = {
    preset: `<section class="settings-section"><div class="settings-section-heading"><div><h3>Choose a starting point</h3><p class="muted">Select a built-in, saved, or custom background. Editing a built-in background automatically creates a custom variation.</p></div></div><div class="background-preset-grid">${builtInCards}${savedCards}${customCard}</div></section>`,
    image: `<section class="settings-section"><h3>Color and image</h3><div class="field" data-background-edit-field><label>Background color</label>${renderColorPicker('color', background.color)}</div><div class="field" data-background-edit-field><label>Image URL</label><input class="settings-input" name="image" value="${escapeHtml(background.image)}" placeholder="https://… or data:image/…"></div><div class="field" data-background-edit-field><label>Upload image</label><input class="settings-input" type="file" name="imageFile" accept="image/*"><small>Images up to 5 MB are stored directly in the dashboard configuration.</small></div><div class="field-row"><div class="field" data-background-edit-field><label>Image fit</label><select class="settings-input" name="fit">${[['cover','Cover'],['contain','Contain'],['fill','Stretch'],['none','Original size']].map(([value,label]) => `<option value="${value}" ${background.fit === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="field" data-background-edit-field><label>Image position</label><select class="settings-input" name="position">${[['center center','Center'],['center top','Top'],['center bottom','Bottom'],['left center','Left'],['right center','Right']].map(([value,label]) => `<option value="${value}" ${background.position === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div></div><label class="checkbox-row" data-background-edit-field><input type="checkbox" name="fixed" ${background.fixed !== false ? 'checked' : ''}> Keep image fixed while scrolling</label></section>`,
    finish: `<section class="settings-section"><h3>Overlay</h3><div class="field" data-background-edit-field><label>Dark overlay: <output data-background-overlay-output>${escapeHtml(background.overlay)}</output>%</label><input type="range" min="0" max="90" name="overlay" value="${escapeHtml(background.overlay)}"></div></section><section class="settings-section background-preset-save-box"><div class="settings-section-heading"><div><h3>${selectedSaved ? 'Update saved preset' : 'Save as preset'}</h3><p class="muted">Store the current editor values for reuse without applying them yet.</p></div><button type="button" class="pill-button" data-action="save-background-preset">${materialSymbol('bookmark_add',18)} ${selectedSaved ? 'Update preset' : 'Save preset'}</button></div><div class="field"><label>Preset name</label><input class="settings-input" name="presetName" value="${escapeHtml(selectedSaved?.name || '')}" placeholder="Example: Living room evening"></div><input type="hidden" name="savePresetId" value="${escapeHtml(selectedSaved?.id || '')}"><small data-background-preset-save-status></small></section>`
  };
  const preview = `<div class="background-editor-live-preview"><div class="background-preview" data-background-preview style="--preview-color:${escapeHtml(background.color)};--preview-image:${background.image ? `url(&quot;${escapeHtml(background.image)}&quot;)` : 'none'};--preview-overlay:${background.overlay / 100};background-size:${escapeHtml(background.fit)};background-position:${escapeHtml(background.position)}"></div><small>Dashboard background preview</small></div>`;
  return flowEditorShell({ title:'Background', formAttribute:`data-background-form data-selected-saved-preset="${escapeHtml(selectedSaved?.id || '')}"`, steps:[{id:'preset',label:'Preset'},{id:'image',label:'Color & image'},{id:'finish',label:'Overlay & save'}], panels, preview, submitLabel:'Apply background', className:'background-settings-modal' });
}

function renderModal() {
  if (state.modal.type === 'page-selector') {
    const active = currentDashboard();
    return `<div class="remote-overlay" data-action="close-modal"></div><section class="remote-sheet page-selector-sheet" role="dialog" aria-modal="true">
      <div class="sheet-handle"></div><div class="sheet-title"><h2>Pages</h2><button class="sheet-close" data-action="close-modal">${icon('close', 22)}</button></div>
      <div class="page-selector-list">${state.config.dashboards.map((entry) => `<button class="page-selector-item ${entry.id === active?.id ? 'active' : ''}" data-action="select-dashboard" data-id="${escapeHtml(entry.id)}"><span>${marquee(entry.name)}</span>${entry.pinHash && !dashboardIsUnlocked(entry) ? materialSymbol('lock',18) : entry.id === active?.id ? '<i></i>' : ''}</button>`).join('')}</div>
    </section>`;
  }

  if (state.modal.type === 'page-menu') {
    return `<div class="remote-overlay" data-action="close-modal"></div><section class="remote-sheet menu-sheet" role="dialog" aria-modal="true">
      <div class="sheet-handle"></div><div class="sheet-title"><h2>${escapeHtml(currentDashboard()?.name || 'Dashboard')}</h2><button class="sheet-close" data-action="close-modal">${icon('close', 22)}</button></div>
      <div class="remote-menu-groups"><section><h3>Dashboard</h3><div class="remote-menu-list"><button data-action="toggle-edit"><span>${icon('edit',26)}</span><strong>${state.editMode ? 'Exit editor' : 'Edit dashboard'}</strong></button><button data-action="add-dashboard"><span>${icon('plus',26)}</span><strong>Add dashboard</strong></button><button data-action="rename-dashboard"><span>${icon('edit',26)}</span><strong>Rename dashboard</strong></button><button class="danger" data-action="delete-dashboard"><span>${icon('trash',26)}</span><strong>Delete dashboard</strong></button></div></section><section><h3>Interface</h3><div class="remote-menu-list"><button data-action="open-navigation-editor"><span>${materialSymbol('navigation',26)}</span><strong>Navigation</strong></button><button data-action="open-statusbar-editor"><span>${icon('tune',26)}</span><strong>Status Bar</strong></button><button data-action="open-settings"><span>${icon('settings',26)}</span><strong>Settings</strong></button></div></section></div>
    </section>`;
  }

  if (state.modal.type === 'page-pin') {
    const dashboard = state.config.dashboards.find((entry) => entry.id === state.modal.dashboardId);
    const alternatives = state.config.dashboards.filter((entry) => entry.id !== dashboard?.id);
    return `<div class="modal-backdrop" data-action="close-modal"></div><section class="modal page-pin-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="eyebrow">LOCKED PAGE</div><h2>${escapeHtml(dashboard?.name || 'Dashboard')}</h2></div><button class="icon-button" data-action="close-modal">${icon('close')}</button></div><form data-page-pin-form data-dashboard-id="${escapeHtml(dashboard?.id || '')}"><div class="modal-body"><div class="page-pin-icon">${materialSymbol('lock',48)}</div><p class="muted">Enter the PIN to open this dashboard.${dashboard?.pinHint ? ` Hint: ${escapeHtml(dashboard.pinHint)}` : ''}</p><input class="settings-input page-pin-input" name="pin" type="password" inputmode="numeric" autocomplete="one-time-code" autofocus required>${alternatives.length ? `<div class="page-pin-navigation"><span>Or go to another dashboard</span><div>${alternatives.map((entry) => `<button type="button" data-action="select-dashboard" data-id="${escapeHtml(entry.id)}">${entry.pinHash && !dashboardIsUnlocked(entry) ? materialSymbol('lock',18) : renderChosenIcon(entry.navIcon || 'dashboard',18,'dashboard')}<span>${marquee(entry.name)}</span></button>`).join('')}</div></div>` : ''}</div><div class="modal-actions"><button type="button" class="pill-button" data-action="close-modal">Cancel</button><button type="submit" class="pill-button primary">Unlock</button></div></form></section>`;
  }

  if (state.modal.type === 'background') return renderBackgroundSettingsEditor();

  if (state.modal.type === 'media-browser') {
    const settings = state.modal.settings;
    const pseudo = { id: state.modal.browserKey, kind: 'system', widgetType: 'media_browser', settings };
    const width = ['compact','standard','wide','full'].includes(settings.modalWidth) ? settings.modalWidth : 'wide';
    const height = ['auto','tall','full'].includes(settings.modalHeight) ? settings.modalHeight : 'tall';
    const radius = Math.max(0, Math.min(48, Number(settings.modalRadius) || 0));
    const backdrop = Math.max(0, Math.min(95, Number(settings.modalBackdrop) || 72)) / 100;
    const title = settings.modalTitle || state.modal.title || settings.title || 'Media';
    return `<div class="modal-backdrop media-browser-custom-backdrop" style="--modal-backdrop-opacity:${backdrop}" data-action="close-modal"></div><section class="modal media-browser-modal modal-width-${width} modal-height-${height}" style="--modal-bg:${escapeHtml(settings.modalBackground || '#111111')};--modal-fg:${escapeHtml(settings.modalForeground || '#f4f4f4')};--modal-radius:${radius}px" role="dialog" aria-modal="true">${settings.modalShowHeader !== false ? `<div class="modal-head"><div class="modal-title-with-icon">${renderChosenIcon(settings.modalIcon || 'library_music',28,'library_music')}<div><div class="eyebrow">MEDIA BROWSER</div><h2>${escapeHtml(title)}</h2></div></div><button class="icon-button" data-action="close-modal">${icon('close')}</button></div>` : `<button class="icon-button floating-modal-close" data-action="close-modal">${icon('close')}</button>`}<div class="modal-body">${renderMediaBrowser(pseudo, settings, { modal: true })}</div></section>`;
  }

  if (state.modal.type === 'status-alerts') return renderStatusAlertsModal();

  if (state.modal.type === 'widget-settings') return renderWidgetSettingsModal();

  if (state.modal.type === 'navigation-settings') return renderNavigationSettingsEditor();

  if (state.modal.type === 'statusbar-settings') return renderStatusbarSettingsEditor();

  if (state.modal.type === 'settings') return renderSettingsEditor();

  if (state.modal.type === 'prompt') {
    return `<div class="modal-backdrop" data-action="close-modal"></div><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>${escapeHtml(state.modal.title)}</h2><button class="icon-button" data-action="close-modal">${icon('close')}</button></div><form data-prompt-form><div class="modal-body"><div class="field"><label>${escapeHtml(state.modal.label)}</label><input class="settings-input" name="value" value="${escapeHtml(state.modal.value || '')}" required autofocus></div></div><div class="modal-actions"><button type="button" class="pill-button" data-action="close-modal">Cancel</button><button type="submit" class="pill-button primary">Save</button></div></form></section>`;
  }

  if (state.modal.type === 'confirm') {
    return `<div class="modal-backdrop" data-action="close-modal"></div><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>${escapeHtml(state.modal.title || 'Confirm')}</h2><button class="icon-button" data-action="close-modal">${icon('close')}</button></div><div class="modal-body"><p class="muted">${escapeHtml(state.modal.message || '')}</p></div><div class="modal-actions"><button class="pill-button" data-action="close-modal">${escapeHtml(state.modal.cancelLabel || 'Cancel')}</button><button class="pill-button primary ${state.modal.danger ? 'danger' : ''}" data-action="confirm-modal">${escapeHtml(state.modal.confirmLabel || 'Confirm')}</button></div></section>`;
  }
  if (state.modal.type === 'entity-info') { const entity=state.entities.get(state.modal.entityId); if(!entity)return ''; return `<div class="modal-backdrop" data-action="close-modal"></div><section class="modal entity-info-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="eyebrow">ENTITY</div><h2>${escapeHtml(localName(entity.name,entity.entity_id))}</h2></div><button class="icon-button" data-action="close-modal">${icon('close')}</button></div><div class="modal-body"><div class="entity-info-state"><span>${renderWidgetIcon({settings:{}},entity.entity_type,42)}</span><strong>${escapeHtml(translatedEntityState(entity))}</strong></div><div class="entity-attribute-table">${Object.entries(entity.attributes||{}).slice(0,60).map(([key,value])=>`<div><span>${escapeHtml(key.replaceAll('_',' '))}</span><code>${escapeHtml(localizedValue(value,'—'))}</code></div>`).join('')}</div></div></section>`; }
  if (state.modal.type === 'widget-view') { const {item}=findDashboardItem(state.modal.itemId); if(!item)return ''; return `<div class="modal-backdrop" data-action="close-modal"></div><section class="modal widget-view-modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>${escapeHtml(widgetEditorLabel(item))}</h2><button class="icon-button" data-action="close-modal">${icon('close')}</button></div><div class="modal-body"><div class="widget-modal-stage">${renderNestedWidget(item,{depth:1,suppressTools:true})}</div></div></section>`; }
  if (state.modal.type === 'message') {
    return `<div class="modal-backdrop" data-action="close-modal"></div><section class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>${escapeHtml(state.modal.title || 'Information')}</h2><button class="icon-button" data-action="close-modal">${icon('close')}</button></div><div class="modal-body"><p class="muted">${escapeHtml(state.modal.message || '')}</p></div><div class="modal-actions"><button class="pill-button primary" data-action="close-modal">OK</button></div></section>`;
  }
  return '';
}


function findDashboardItemPath(itemId) {
  const search=(items,path=[])=>{ for(const item of items||[]){ const next=[...path,item]; if(item.id===itemId)return next; if(item.kind==='system'&&CONTAINER_WIDGET_TYPES.has(item.widgetType)){ const groups=item.widgetType==='tab_container'?(item.settings?.tabs||[]).map((tab)=>tab.items):[item.settings?.items]; for(const children of groups){const found=search(children,next);if(found)return found;} } } return null; };
  for(const dashboard of state.config?.dashboards||[]){const path=search(dashboard.items);if(path)return {dashboard,path};} return {dashboard:null,path:[]};
}
function renderEditBreadcrumbs() {
  if(!state.editMode||!state.editContainerId)return '';
  const {path}=findDashboardItemPath(state.editContainerId); if(!path.length)return '';
  return `<nav class="container-edit-breadcrumb"><button data-action="exit-container-contents">${materialSymbol('dashboard',17)} Dashboard</button>${path.map((item,index)=>`<span>${materialSymbol('chevron_right',15)}</span><button data-action="edit-container-contents" data-item-id="${escapeHtml(item.id)}" class="${index===path.length-1?'active':''}">${escapeHtml(widgetEditorLabel(item))}</button>`).join('')}<button class="exit" data-action="exit-container-contents">${materialSymbol('close',17)} Exit contents</button></nav>`;
}
function moveNestedWidget(itemId,direction) { const {item,parentItems}=findDashboardItem(itemId); if(!item||!parentItems)return; const containerPath=findDashboardItemPath(itemId).path; const parent=containerPath.at(-2); if(parent?.settings?.layoutLocked){toast('Container layout is locked','error');return;} const index=parentItems.findIndex((entry)=>entry.id===itemId); const target=index+Number(direction); if(index<0||target<0||target>=parentItems.length)return; [parentItems[index],parentItems[target]]=[parentItems[target],parentItems[index]]; persistConfig(); render(); }
function childLayoutEditor(containerItem, child, index) { const layout=normalizeChildLayout(child.settings?.containerLayout); return `<article class="container-child-layout-row"><span>${index+1}</span><strong>${escapeHtml(widgetEditorLabel(child))}</strong><label>Width<select class="settings-input" name="childWidth:${child.id}">${[1,2,3,4,6,8,12].map((v)=>`<option value="${v}" ${layout.width===v?'selected':''}>${v}/12</option>`).join('')}</select></label><label>Height<input class="settings-input" type="number" min="1" max="12" name="childHeight:${child.id}" value="${layout.height}"></label><label>Align<select class="settings-input" name="childAlign:${child.id}">${['stretch','start','center','end'].map((v)=>`<option value="${v}" ${layout.align===v?'selected':''}>${v}</option>`).join('')}</select></label></article>`; }
function applyChildLayoutsFromForm(containerItem,data) { for(const child of directContainerItems(containerItem)){ child.settings ||= {}; child.settings.containerLayout=normalizeChildLayout({width:data.get(`childWidth:${child.id}`),height:data.get(`childHeight:${child.id}`),align:data.get(`childAlign:${child.id}`)}); } }

function findDashboardItem(itemId) {
  const search = (items) => {
    for (const item of items || []) {
      if (item.id === itemId) return { item, parentItems: items };
      if (item.kind === 'system' && CONTAINER_WIDGET_TYPES.has(item.widgetType)) {
        const collections = item.widgetType === 'tab_container'
          ? (item.settings?.tabs || []).map((tab) => tab.items)
          : [item.settings?.items];
        for (const children of collections) {
          const found = search(children);
          if (found) return found;
        }
      }
    }
    return null;
  };
  for (const dashboard of state.config?.dashboards || []) {
    const found = search(dashboard.items);
    if (found) return { dashboard, ...found };
  }
  return { dashboard: null, item: null, parentItems: null };
}

function sensorSelect(name, value, label, includeAll = false) {
  const entities = accessibleEntities()
    .filter((entity) => includeAll || entity.entity_type === 'sensor')
    .sort((a, b) => localName(a.name).localeCompare(localName(b.name)));
  return `<div class="field"><label>${escapeHtml(label)}</label><select class="settings-input" name="${name}"><option value="">Not used</option>${entities.map((entity) => `<option value="${escapeHtml(entity.entity_id)}" ${entity.entity_id === value ? 'selected' : ''}>${escapeHtml(localName(entity.name))} · ${escapeHtml(entity.entity_id)}</option>`).join('')}</select></div>`;
}

function entitySelect(name, value, label, filter = null, multiple = false) {
  const entities = accessibleEntities().filter((entity) => !filter || filter.includes(entity.entity_type)).sort((a, b) => localName(a.name).localeCompare(localName(b.name)));
  if (multiple) {
    const selected = new Set(String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean));
    return `<fieldset class="field entity-checklist"><legend>${escapeHtml(label)}</legend>${entities.length ? entities.map((entity) => `<label class="checkbox-row"><input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(entity.entity_id)}" ${selected.has(entity.entity_id) ? 'checked' : ''}> <span>${marquee(localName(entity.name))}<small>${escapeHtml(TYPE_LABELS[entity.entity_type] || entity.entity_type)}</small></span></label>`).join('') : '<p class="muted">No matching entities available.</p>'}</fieldset>`;
  }
  return `<div class="field"><label>${escapeHtml(label)}</label><select class="settings-input" name="${escapeHtml(name)}"><option value="">Not selected</option>${entities.map((entity) => `<option value="${escapeHtml(entity.entity_id)}" ${entity.entity_id === value ? 'selected' : ''}>${escapeHtml(localName(entity.name))} · ${escapeHtml(TYPE_LABELS[entity.entity_type] || entity.entity_type)}</option>`).join('')}</select></div>`;
}

function catalogEntitySelect(name, value, label) {
  const entities = [...(state.entityCatalog || [])].filter((entity) => entityAccessAllowed(entity.entity_id)).sort((a,b) => localName(a.name,a.entity_id).localeCompare(localName(b.name,b.entity_id)));
  return `<div class="field"><label>${escapeHtml(label)}</label><select class="settings-input" name="${escapeHtml(name)}"><option value="">Not selected</option>${entities.map((entity)=>`<option value="${escapeHtml(entity.entity_id)}" ${entity.entity_id===value?'selected':''}>${escapeHtml(localName(entity.name,entity.entity_id))} · ${escapeHtml(entity.entity_type||'unknown')}${entity.dashboard_supported===false?' · template only':''}</option>`).join('')}</select></div>`;
}


function templateElementEditor(element, index = 0) {
  const entry = normalizeTemplateElement(element, index);
  const key = entry.id;
  const types = Object.entries(TEMPLATE_ELEMENT_TYPES).map(([value,definition])=>`<option value="${value}" ${entry.type===value?'selected':''}>${escapeHtml(definition.label)}</option>`).join('');
  return `<article class="template-element-editor" data-template-element-editor data-template-element-id="${escapeHtml(key)}" data-template-element-type="${escapeHtml(entry.type)}"><header><span class="template-element-drag">${materialSymbol('drag_indicator',18)}</span><div><strong data-template-element-name>${escapeHtml(TEMPLATE_ELEMENT_TYPES[entry.type].label)}</strong><small>Element ${index+1}</small></div><div><button type="button" data-action="template-element-move" data-direction="-1" title="Move up">${materialSymbol('arrow_upward',17)}</button><button type="button" data-action="template-element-move" data-direction="1" title="Move down">${materialSymbol('arrow_downward',17)}</button><button type="button" class="danger" data-action="template-element-remove" title="Delete">${materialSymbol('delete',17)}</button></div></header><input type="hidden" name="templateElementId:${escapeHtml(key)}" value="${escapeHtml(key)}"><div class="field-row"><div class="field"><label>Element type</label><select class="settings-input" name="templateType:${escapeHtml(key)}" data-template-element-type-select>${types}</select></div>${catalogEntitySelect(`templateEntity:${key}`,entry.entityId,'Element entity (optional)')}</div><div class="field-row template-element-placement"><div class="field"><label>Column span</label><input class="settings-input" type="number" min="1" max="6" name="templateSpan:${escapeHtml(key)}" value="${entry.span}"></div><div class="field"><label>Alignment</label><select class="settings-input" name="templateAlign:${escapeHtml(key)}">${[['stretch','Stretch'],['start','Start'],['center','Center'],['end','End']].map(([value,label])=>`<option value="${value}" ${entry.align===value?'selected':''}>${label}</option>`).join('')}</select></div></div><div data-template-types="heading text value button list select input slider toggle"><div class="field"><label>Label</label><input class="settings-input" name="templateLabel:${escapeHtml(key)}" value="${escapeHtml(entry.label)}"></div></div><div data-template-types="heading text value button list select input slider toggle"><div class="field"><label>Text or value template</label><input class="settings-input" name="templateValue:${escapeHtml(key)}" value="${escapeHtml(entry.template)}" placeholder="{entity.value}"></div></div><div data-template-types="icon button toggle">${iconChoiceField(`templateIcon:${key}`,entry.icon,'Icon',{fallback:'data_object',compact:true})}<label class="checkbox-row" data-template-types="button"><input type="checkbox" name="templateShowIcon:${escapeHtml(key)}" ${entry.showIcon!==false?'checked':''}> Show icon</label></div><div data-template-types="list select"><div class="field"><label>Fixed options</label><textarea class="settings-input settings-textarea" name="templateOptions:${escapeHtml(key)}" placeholder="One per line or Label=value">${escapeHtml(entry.options)}</textarea></div><div class="field"><label>Options entity path</label><input class="settings-input" name="templateOptionsPath:${escapeHtml(key)}" value="${escapeHtml(entry.optionsPath)}" placeholder="attributes.options"></div></div><div data-template-types="input"><div class="field-row"><div class="field"><label>Input type</label><select class="settings-input" name="templateInputType:${escapeHtml(key)}"><option value="text" ${entry.inputType==='text'?'selected':''}>Text</option><option value="number" ${entry.inputType==='number'?'selected':''}>Number</option></select></div><div class="field"><label>Placeholder</label><input class="settings-input" name="templatePlaceholder:${escapeHtml(key)}" value="${escapeHtml(entry.placeholder)}"></div></div></div><div data-template-types="input slider"><div class="field-row"><div class="field"><label>Minimum</label><input class="settings-input" type="number" name="templateMin:${escapeHtml(key)}" value="${escapeHtml(entry.min)}"></div><div class="field"><label>Maximum</label><input class="settings-input" type="number" name="templateMax:${escapeHtml(key)}" value="${escapeHtml(entry.max)}"></div><div class="field"><label>Step</label><input class="settings-input" type="number" name="templateStep:${escapeHtml(key)}" value="${escapeHtml(entry.step)}"></div></div></div><div data-template-types="button select input slider"><div class="field-row"><div class="field"><label>Command</label><input class="settings-input" name="templateCommand:${escapeHtml(key)}" value="${escapeHtml(entry.command)}" placeholder="entity.command"></div><div class="field"><label>Value parameter</label><input class="settings-input" name="templateParamKey:${escapeHtml(key)}" value="${escapeHtml(entry.paramKey)}" placeholder="value"></div></div><div class="field"><label>Additional parameters (JSON)</label><textarea class="settings-input settings-code compact" name="templateParams:${escapeHtml(key)}" placeholder='{"option":true}'>${escapeHtml(entry.params)}</textarea></div></div><div data-template-types="toggle"><div class="field-row"><div class="field"><label>On command</label><input class="settings-input" name="templateOnCommand:${escapeHtml(key)}" value="${escapeHtml(entry.onCommand)}"></div><div class="field"><label>Off command</label><input class="settings-input" name="templateOffCommand:${escapeHtml(key)}" value="${escapeHtml(entry.offCommand)}"></div></div><div class="field-row"><div class="field"><label>On value</label><input class="settings-input" name="templateOnValue:${escapeHtml(key)}" value="${escapeHtml(entry.onValue)}"></div><div class="field"><label>Off value</label><input class="settings-input" name="templateOffValue:${escapeHtml(key)}" value="${escapeHtml(entry.offValue)}"></div></div><div class="field"><label>Additional parameters (JSON)</label><textarea class="settings-input settings-code compact" name="templateParams:${escapeHtml(key)}">${escapeHtml(entry.params)}</textarea></div></div></article>`;
}

function templateElementsEditor(settings = {}) {
  const elements = normalizeTemplateElements(settings.templateElements, settings);
  return `<section class="settings-section entity-template-builder"><div class="settings-section-heading"><div><h3>Template elements</h3><p class="muted">Build the widget from independent display and control elements. Every element can use the default entity or its own entity.</p></div></div><div class="field-row"><div class="field"><label>Grid columns</label><input class="settings-input" type="number" min="1" max="6" name="templateColumns" value="${escapeHtml(settings.templateColumns||'2')}"></div><div class="field"><label>Element gap</label><input class="settings-input" type="number" min="0" max="32" name="templateGap" value="${escapeHtml(settings.templateGap||'10')}"></div></div><div class="template-element-list" data-template-element-list>${elements.map(templateElementEditor).join('')}</div><div class="template-element-add"><select class="settings-input" data-template-new-element-type>${Object.entries(TEMPLATE_ELEMENT_TYPES).map(([value,definition])=>`<option value="${value}">${escapeHtml(definition.label)}</option>`).join('')}</select><button type="button" class="pill-button" data-action="template-element-add">${materialSymbol('add',18)} Add element</button></div></section>`;
}

function templateElementsFromForm(data, form, legacySettings = {}) {
  if (!form) return normalizeTemplateElements([], legacySettings);
  return [...form.querySelectorAll('[data-template-element-editor]')].slice(0,40).map((row,index)=>{
    const key = row.dataset.templateElementId;
    return normalizeTemplateElement({
      id:String(data.get(`templateElementId:${key}`)||key),
      type:String(data.get(`templateType:${key}`)||'text'),
      entityId:String(data.get(`templateEntity:${key}`)||''),
      span:Number(data.get(`templateSpan:${key}`))||1,
      align:String(data.get(`templateAlign:${key}`)||'stretch'),
      label:String(data.get(`templateLabel:${key}`)||''),
      template:String(data.get(`templateValue:${key}`)||''),
      icon:String(data.get(`templateIcon:${key}`)||'data_object'),
      showIcon:data.get(`templateShowIcon:${key}`)==='on',
      options:String(data.get(`templateOptions:${key}`)||''),
      optionsPath:String(data.get(`templateOptionsPath:${key}`)||''),
      inputType:String(data.get(`templateInputType:${key}`)||'text'),
      placeholder:String(data.get(`templatePlaceholder:${key}`)||''),
      min:String(data.get(`templateMin:${key}`)||'0'),
      max:String(data.get(`templateMax:${key}`)||'100'),
      step:String(data.get(`templateStep:${key}`)||'1'),
      command:String(data.get(`templateCommand:${key}`)||''),
      paramKey:String(data.get(`templateParamKey:${key}`)||'value'),
      params:String(data.get(`templateParams:${key}`)||''),
      onCommand:String(data.get(`templateOnCommand:${key}`)||''),
      offCommand:String(data.get(`templateOffCommand:${key}`)||''),
      onValue:String(data.get(`templateOnValue:${key}`)||'on'),
      offValue:String(data.get(`templateOffValue:${key}`)||'off'),
      order:index
    },index);
  });
}

function refreshTemplateElementEditor(row) {
  if (!row) return;
  const type = row.querySelector('[data-template-element-type-select]')?.value || 'text';
  row.dataset.templateElementType = type;
  const label = row.querySelector('[data-template-element-name]');
  if (label) label.textContent = TEMPLATE_ELEMENT_TYPES[type]?.label || 'Element';
}

function directContainerItems(containerItem) {
  if (containerItem.widgetType === 'tab_container') return (containerItem.settings?.tabs || []).flatMap((tab) => tab.items || []);
  return Array.isArray(containerItem.settings?.items) ? containerItem.settings.items : [];
}

function dashboardItemContains(candidate, targetId) {
  if (!candidate || !targetId) return false;
  if (candidate.id === targetId) return true;
  if (candidate.kind !== 'system' || !CONTAINER_WIDGET_TYPES.has(candidate.widgetType)) return false;
  const collections = candidate.widgetType === 'tab_container'
    ? (candidate.settings?.tabs || []).map((tab) => tab.items || [])
    : [candidate.settings?.items || []];
  return collections.some((items) => items.some((child) => dashboardItemContains(child, targetId)));
}

function containerCandidates(containerItem) {
  const dashboard = currentDashboard();
  const nested = directContainerItems(containerItem);
  const topLevel = (dashboard?.items || []).filter((candidate) => candidate.id !== containerItem.id && !dashboardItemContains(candidate, containerItem.id));
  const seen = new Set();
  return [...nested, ...topLevel].filter((candidate) => candidate && candidate.id !== containerItem.id && !dashboardItemContains(candidate, containerItem.id) && !seen.has(candidate.id) && seen.add(candidate.id));
}


function carouselOrderEditor(containerItem, selectedItems = directContainerItems(containerItem)) {
  if (containerItem?.widgetType !== 'carousel' || !selectedItems?.length) return '';
  return `<section class="settings-section carousel-card-order"><div class="settings-section-heading"><div><h3>Card order</h3><p class="muted">Drag cards or use the arrow buttons to set the carousel sequence.</p></div></div><div class="carousel-card-order-list" data-carousel-order-list>${selectedItems.map((child,index)=>`<article draggable="true" data-carousel-order-row data-item-id="${escapeHtml(child.id)}"><span class="carousel-order-handle">${materialSymbol('drag_indicator',18)}</span><strong>${escapeHtml(widgetEditorLabel(child))}</strong><small>${index+1}</small><input type="hidden" name="carouselOrder" value="${escapeHtml(child.id)}"><div><button type="button" data-action="carousel-order-move" data-direction="-1" title="Move earlier">${materialSymbol('arrow_upward',17)}</button><button type="button" data-action="carousel-order-move" data-direction="1" title="Move later">${materialSymbol('arrow_downward',17)}</button></div></article>`).join('')}</div></section>`;
}

function containerItemOptions(containerItem, selectedItems = directContainerItems(containerItem), legend = 'Contained widgets') {
  const candidates = containerCandidates(containerItem);
  const selectedIds = new Set((selectedItems || []).map((candidate) => candidate.id));
  return `<fieldset class="field entity-checklist"><legend>${escapeHtml(legend)}</legend><small>Select existing dashboard widgets to move into this container. Unchecking a contained widget moves it back to the dashboard.</small>${candidates.length ? candidates.map((candidate) => { const entity = candidate.kind === 'system' ? null : entityForItem(candidate); const label = candidate.kind === 'system' ? SYSTEM_WIDGETS[candidate.widgetType]?.label || candidate.widgetType : localName(entity?.name || candidate.snapshot?.name || candidate.entityId); return `<label class="checkbox-row"><input type="checkbox" name="containerItem" value="${escapeHtml(candidate.id)}" ${selectedIds.has(candidate.id) ? 'checked' : ''}> <span>${marquee(label)}<small>${candidate.kind === 'system' ? 'Widget' : TYPE_LABELS[entity?.entity_type || candidate.entityType] || candidate.entityType}</small></span></label>`; }).join('') : '<p class="muted">No existing widgets are available.</p>'}</fieldset>${carouselOrderEditor(containerItem, selectedItems)}${selectedItems?.length ? `<section class="settings-section"><h3>Child layout</h3><div class="container-child-layout-list">${selectedItems.map((child,index)=>childLayoutEditor(containerItem,child,index)).join('')}</div></section>` : ''}${nestedWidgetAddControls(containerItem)}`;
}

function conditionalItemOptions(containerItem) {
  return containerItemOptions(containerItem);
}

function returnUnselectedContainerItems(dashboard, containerItem, previousItems, nextItems) {
  const nextIds = new Set((nextItems || []).map((candidate) => candidate.id));
  const returned = (previousItems || []).filter((candidate) => !nextIds.has(candidate.id));
  const selectedIds = new Set((nextItems || []).map((candidate) => candidate.id));
  dashboard.items = dashboard.items.filter((candidate) => candidate.id === containerItem.id || !selectedIds.has(candidate.id));
  for (const candidate of returned) {
    if (dashboard.items.some((entry) => entry.id === candidate.id)) continue;
    const slot = findSlot(dashboard.items, candidate.w || 4, candidate.h || 2, 12);
    Object.assign(candidate, { x: slot.x, y: slot.y });
    dashboard.items.push(candidate);
  }
}



function tabEditorRow(tab, index, total) {
  const id = tab.id || uid('tab');
  return `<article class="tab-editor-row" data-tab-editor-row data-tab-id="${escapeHtml(id)}">
    <input type="hidden" name="tabId" value="${escapeHtml(id)}">
    <div class="tab-editor-summary"><span class="tab-editor-preview" style="--tab-accent:${escapeHtml(tab.color || '#d0d0d0')}">${renderChosenIcon(tab.icon || 'tab',24,'tab')}</span><div><strong>Tab ${index + 1}</strong><small>${escapeHtml(tab.name || `Tab ${index + 1}`)}</small></div><div class="tab-editor-actions"><button type="button" data-action="tab-editor-move" data-direction="-1" ${index <= 0 ? 'disabled' : ''} title="Move up">${materialSymbol('arrow_upward',18)}</button><button type="button" data-action="tab-editor-move" data-direction="1" ${index >= total - 1 ? 'disabled' : ''} title="Move down">${materialSymbol('arrow_downward',18)}</button><button type="button" class="danger" data-action="tab-editor-remove" ${total <= 1 ? 'disabled' : ''} title="Delete tab">${materialSymbol('delete',18)}</button></div></div>
    <div class="field-row"><div class="field"><label>Name</label><input class="settings-input" name="tabName:${escapeHtml(id)}" value="${escapeHtml(tab.name || `Tab ${index + 1}`)}"></div>${iconChoiceField(`tabIcon:${id}`, tab.icon || 'tab', 'Tab icon', { fallback:'tab', compact:true })}</div>
    <div class="field-row"><div class="field"><label>Accent color</label>${renderColorPicker(`tabColor:${id}`, tab.color || '#d0d0d0')}</div><div class="field"><label>Content columns</label><select class="settings-input" name="tabColumns:${escapeHtml(id)}">${[1,2,3,4].map((value) => `<option value="${value}" ${Number(tab.columns || 1) === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div></div>
    <div class="tab-editor-toggles"><label class="checkbox-row"><input type="checkbox" name="tabShowIcon:${escapeHtml(id)}" ${tab.showIcon !== false ? 'checked' : ''}> Show icon</label><label class="checkbox-row"><input type="checkbox" name="tabShowLabel:${escapeHtml(id)}" ${tab.showLabel !== false ? 'checked' : ''}> Show label</label></div>
  </article>`;
}

function syncTabEditor(root) {
  const rows = [...root.querySelectorAll('[data-tab-editor-row]')];
  const tabOptions = rows.map((row, index) => ({ id: row.dataset.tabId, name: row.querySelector(`[name="tabName:${CSS.escape(row.dataset.tabId)}"]`)?.value.trim() || `Tab ${index + 1}` }));
  rows.forEach((row, index) => {
    row.querySelector('.tab-editor-summary strong').textContent = `Tab ${index + 1}`;
    row.querySelector('.tab-editor-summary small').textContent = tabOptions[index].name;
    const iconValue = row.querySelector(`[name="tabIcon:${CSS.escape(row.dataset.tabId)}"]`)?.value || 'tab';
    const iconPreview = row.querySelector('.tab-editor-preview');
    if (iconPreview) iconPreview.innerHTML = renderChosenIcon(iconValue,24,'tab');
    const up = row.querySelector('[data-direction="-1"]');
    const down = row.querySelector('[data-direction="1"]');
    const del = row.querySelector('[data-action="tab-editor-remove"]');
    if (up) up.disabled = index === 0;
    if (down) down.disabled = index === rows.length - 1;
    if (del) del.disabled = rows.length <= 1;
  });
  root.querySelectorAll('[data-tab-assignment], [data-nested-target-tab]').forEach((select) => {
    const current = select.value;
    const outside = select.hasAttribute('data-tab-assignment') ? '<option value="">Outside container</option>' : '';
    select.innerHTML = outside + tabOptions.map((tab) => `<option value="${escapeHtml(tab.id)}">${escapeHtml(tab.name)}</option>`).join('');
    if ([...select.options].some((option) => option.value === current)) select.value = current;
  });
}
function tabContainerSettingsFields(item) {
  const tabs = Array.isArray(item.settings?.tabs) && item.settings.tabs.length ? item.settings.tabs : structuredClone(SYSTEM_WIDGETS.tab_container.settings.tabs);
  const candidates = containerCandidates(item);
  const tabForItem = new Map();
  for (const tab of tabs) for (const child of tab.items || []) tabForItem.set(child.id, tab.id);
  return `<section class="settings-section tab-definition-editor"><div class="settings-section-heading"><div><h3>Tabs</h3><p class="muted">Define the order, icon, accent color, label visibility, and child layout for every tab.</p></div><button type="button" class="pill-button" data-action="tab-editor-add">${icon('plus',18)} Add tab</button></div><div class="tab-editor-list" data-tab-editor-list>${tabs.map((tab,index) => tabEditorRow(tab,index,tabs.length)).join('')}</div></section>
  <fieldset class="field tab-assignment-list"><legend>Widget assignments</legend>${candidates.length ? candidates.map((candidate) => { const entity = candidate.kind === 'system' ? null : entityForItem(candidate); const label = candidate.kind === 'system' ? SYSTEM_WIDGETS[candidate.widgetType]?.label || candidate.widgetType : localName(entity?.name || candidate.snapshot?.name || candidate.entityId); const assigned = tabForItem.get(candidate.id) || ''; return `<label><span>${marquee(label)}</span><select class="settings-input" data-tab-assignment name="tabItem:${escapeHtml(candidate.id)}"><option value="">Outside container</option>${tabs.map((tab) => `<option value="${escapeHtml(tab.id)}" ${assigned === tab.id ? 'selected' : ''}>${escapeHtml(tab.name)}</option>`).join('')}</select></label>`; }).join('') : '<p class="muted">No existing widgets are available.</p>'}</fieldset><label class="checkbox-row"><input type="checkbox" name="layoutLocked" ${item.settings?.layoutLocked ? 'checked' : ''}> Lock child order and layout</label>${directContainerItems(item).length ? `<section class="settings-section"><h3>Child layout</h3><div class="container-child-layout-list">${directContainerItems(item).map((child,index)=>childLayoutEditor(item,child,index)).join('')}</div></section>` : ''}${nestedWidgetAddControls(item, { includeTabTarget: true })}`;
}

function updateGenericContainerFromForm(dashboard, item, data) {
  const selectedIds = new Set(data.getAll('containerItem').map(String));
  const previous = directContainerItems(item);
  const pool = new Map(containerCandidates(item).map((candidate) => [candidate.id, candidate]));
  let nextItems = [...selectedIds].map((id) => pool.get(id)).filter(Boolean);
  if (item.widgetType === 'carousel') {
    const order = data.getAll('carouselOrder').map(String);
    const orderIndex = new Map(order.map((id,index)=>[id,index]));
    nextItems.sort((a,b)=>(orderIndex.get(a.id) ?? 9999) - (orderIndex.get(b.id) ?? 9999));
  }
  returnUnselectedContainerItems(dashboard, item, previous, nextItems);
  for (const child of nextItems) { child.settings ||= {}; child.settings.containerLayout = normalizeChildLayout({ width:data.get(`childWidth:${child.id}`), height:data.get(`childHeight:${child.id}`), align:data.get(`childAlign:${child.id}`) }); }
  return nextItems;
}

function updateTabContainerFromForm(dashboard, item, data) {
  const previousTabs = Array.isArray(item.settings?.tabs) ? item.settings.tabs : [];
  const ids = data.getAll('tabId').map(String).filter(Boolean).slice(0, 16);
  if (!ids.length) ids.push(uid('tab'));
  const previousById = new Map(previousTabs.map((tab) => [tab.id, tab]));
  const tabs = ids.map((id, index) => ({
    id,
    name: String(data.get(`tabName:${id}`) || `Tab ${index + 1}`).trim() || `Tab ${index + 1}`,
    icon: String(data.get(`tabIcon:${id}`) || 'tab').trim() || 'tab',
    color: /^#[0-9a-f]{6}$/i.test(String(data.get(`tabColor:${id}`) || '')) ? String(data.get(`tabColor:${id}`)) : '#d0d0d0',
    columns: Math.max(1, Math.min(4, Number(data.get(`tabColumns:${id}`)) || 1)),
    showIcon: data.get(`tabShowIcon:${id}`) === 'on',
    showLabel: data.get(`tabShowLabel:${id}`) === 'on',
    items: []
  }));
  const previousItems = previousTabs.flatMap((tab) => tab.items || []);
  const candidates = containerCandidates(item);
  const pool = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  for (const candidate of candidates) {
    const tab = tabs.find((entry) => entry.id === String(data.get(`tabItem:${candidate.id}`) || ''));
    if (tab) tab.items.push(pool.get(candidate.id));
  }
  const nextItems = tabs.flatMap((tab) => tab.items);
  returnUnselectedContainerItems(dashboard, item, previousItems, nextItems);
  item.settings.tabs = tabs;
  applyChildLayoutsFromForm(item, data);
  item.settings.activeTabId = tabs.some((tab) => tab.id === item.settings.activeTabId) ? item.settings.activeTabId : tabs[0].id;
  return tabs;
}


function mediaPresentationEditor(settings = {}, names = {}) {
  const field = (key, fallback) => names[key] || key || fallback;
  const modeName = field('layoutMode', 'layoutMode');
  const pageName = field('pageSize', 'pageSize');
  const columnsName = field('columns', 'columns');
  const slidesName = field('swiperSlidesPerView', 'swiperSlidesPerView');
  const spacingName = field('swiperSpaceBetween', 'swiperSpaceBetween');
  const centeredName = field('swiperCentered', 'swiperCentered');
  const loopName = field('swiperLoop', 'swiperLoop');
  const navigationName = field('swiperNavigation', 'swiperNavigation');
  const paginationName = field('swiperPagination', 'swiperPagination');
  const mode = settings[modeName] || settings.layoutMode || settings.mediaBrowserLayoutMode || 'grid';
  const get = (key, fallback) => settings[field(key,key)] ?? settings[key] ?? fallback;
  const layouts = [['grid','Grid','grid_view'],['list','List','view_list'],['swiper_slide','Slides','view_carousel'],['swiper_cards','Cards','cards'],['swiper_coverflow','Coverflow','gallery_thumbnail']];
  return `<section class="settings-section media-presentation-editor" data-media-presentation-editor>
    <div class="settings-section-heading"><div><h3>Presentation editor</h3><p class="muted">Choose a layout and tune it with live visual feedback.</p></div></div>
    <div class="media-layout-choice">${layouts.map(([value,label,iconName]) => `<label class="media-layout-choice-card"><input type="radio" name="${modeName}" value="${value}" ${mode === value ? 'checked' : ''}><span>${materialSymbol(iconName,26)}<b>${label}</b></span></label>`).join('')}</div>
    <div class="media-layout-preview" data-media-layout-preview data-mode="${escapeHtml(mode)}" style="--preview-columns:${escapeHtml(get(columnsName,4))};--preview-slides:${escapeHtml(get(slidesName,3))};--preview-gap:${escapeHtml(get(spacingName,18))}px"><div class="media-preview-track">${Array.from({length:6},(_,index)=>`<span><i>${materialSymbol(index % 2 ? 'album' : 'music_note',24)}</i><b>${index+1}</b></span>`).join('')}</div></div>
    <div class="media-editor-controls"><div class="field-row"><div class="field"><label>Items per page <output data-media-output="${pageName}">${escapeHtml(get(pageName,12))}</output></label><input type="range" min="10" max="48" step="1" name="${pageName}" value="${escapeHtml(Math.max(10, Number(get(pageName,12)) || 12))}"></div><div class="field" data-grid-control><label>Grid columns <output data-media-output="${columnsName}">${escapeHtml(get(columnsName,4))}</output></label><input type="range" min="2" max="6" step="1" name="${columnsName}" value="${escapeHtml(get(columnsName,4))}"></div></div>
    <div class="media-swiper-controls" data-swiper-controls><div class="field-row"><div class="field"><label>Slides visible <output data-media-output="${slidesName}">${escapeHtml(get(slidesName,3))}</output></label><input type="range" min="1" max="6" step="0.25" name="${slidesName}" value="${escapeHtml(get(slidesName,3))}"></div><div class="field"><label>Spacing <output data-media-output="${spacingName}">${escapeHtml(get(spacingName,18))}</output> px</label><input type="range" min="0" max="80" step="1" name="${spacingName}" value="${escapeHtml(get(spacingName,18))}"></div></div>${[[centeredName,'Center active item',get(centeredName,true)],[loopName,'Loop items',get(loopName,false)],[navigationName,'Navigation buttons',get(navigationName,true)],[paginationName,'Pagination dots',get(paginationName,true)]].map(([key,label,checked]) => `<label class="checkbox-row"><input type="checkbox" name="${key}" ${checked ? 'checked' : ''}> ${label}</label>`).join('')}</div></div>
  </section>`;
}

function updateMediaPresentationEditor(root) {
  root.querySelectorAll('[data-media-presentation-editor]').forEach((editor) => {
    const scrollHost = editor.closest('.widget-editor-panels,.modal-body');
    const scrollTop = scrollHost?.scrollTop ?? 0;
    const mode = editor.querySelector('input[type="radio"]:checked')?.value || 'grid';
    const preview = editor.querySelector('[data-media-layout-preview]');
    const inputs = [...editor.querySelectorAll('input[name]')];
    const findSuffix = (suffix) => inputs.find((input) => input.name.endsWith(suffix));
    const columns = findSuffix('Columns') || findSuffix('columns');
    const slides = findSuffix('SlidesPerView') || findSuffix('swiperSlidesPerView');
    const spacing = findSuffix('SpaceBetween') || findSuffix('swiperSpaceBetween');
    if (preview) {
      preview.dataset.mode = mode;
      preview.style.setProperty('--preview-columns', columns?.value || 4);
      preview.style.setProperty('--preview-slides', slides?.value || 3);
      preview.style.setProperty('--preview-gap', `${spacing?.value || 18}px`);
    }
    editor.querySelector('[data-grid-control]')?.toggleAttribute('hidden', mode !== 'grid');
    editor.querySelector('[data-swiper-controls]')?.toggleAttribute('hidden', !mode.startsWith('swiper_'));
    editor.querySelectorAll('[data-media-output]').forEach((output) => { const input = editor.querySelector(`[name="${CSS.escape(output.dataset.mediaOutput)}"]`); if (input) output.value = input.value; });
    if (scrollHost) requestAnimationFrame(() => { scrollHost.scrollTop = scrollTop; });
  });
}


function carouselPresentationEditor(settings = {}) {
  const effect = ['slide','cards','coverflow'].includes(settings.swiperEffect) ? settings.swiperEffect : 'slide';
  return `<section class="settings-section carousel-presentation-editor" data-carousel-presentation-editor><div class="settings-section-heading"><div><h3>Carousel presentation</h3><p class="muted">Each swipe advances exactly one full-width slide. Slides are clipped to the widget boundary on desktop and kiosk WebViews.</p></div></div><div class="media-layout-choice carousel-effect-choice">${[['slide','Slides','view_carousel'],['cards','Cards','cards'],['coverflow','Coverflow','gallery_thumbnail']].map(([value,label,symbol])=>`<label class="media-layout-choice-card"><input type="radio" name="swiperEffect" value="${value}" ${effect===value?'checked':''}><span>${materialSymbol(symbol,26)}<b>${label}</b></span></label>`).join('')}</div><div class="carousel-effect-preview effect-${escapeHtml(effect)}" data-carousel-effect-preview style="--preview-slides:1;--preview-gap:0px"><div>${Array.from({length:4},(_,i)=>`<span><i>${i+1}</i></span>`).join('')}</div></div><input type="hidden" name="swiperSlidesPerView" value="1"><input type="hidden" name="swiperSpaceBetween" value="0">${[['swiperLoop','Loop slides',Boolean(settings.swiperLoop)],['showArrows','Navigation arrows',settings.showArrows!==false],['showDots','Pagination dots',settings.showDots!==false]].map(([name,label,checked])=>`<label class="checkbox-row"><input type="checkbox" name="${name}" ${checked?'checked':''}> ${label}</label>`).join('')}</section>`;
}

function updateCarouselPresentationEditor(root) {
  root.querySelectorAll('[data-carousel-presentation-editor]').forEach((editor) => {
    const effect = editor.querySelector('[name="swiperEffect"]:checked')?.value || 'slide';
    const preview = editor.querySelector('[data-carousel-effect-preview]');
    const slides = editor.querySelector('[name="swiperSlidesPerView"]');
    const spacing = editor.querySelector('[name="swiperSpaceBetween"]');
    if (preview) {
      preview.className = `carousel-effect-preview effect-${effect}`;
      preview.style.setProperty('--preview-slides', slides?.value || 1);
      preview.style.setProperty('--preview-gap', `${spacing?.value || 12}px`);
    }
    editor.querySelectorAll('[data-carousel-output]').forEach((output) => { const input = editor.querySelector(`[name="${output.dataset.carouselOutput}"]`); if (input) output.value = input.value; });
  });
}

function modalAppearanceFields(settings = {}) {
  return `<section class="settings-section modal-appearance-editor"><h3>Modal appearance</h3><div class="field"><label>Modal title override</label><input class="settings-input" name="mediaBrowserModalTitle" value="${escapeHtml(settings.mediaBrowserModalTitle || '')}" placeholder="Use widget/entity name"></div>${iconChoiceField('mediaBrowserModalIcon', settings.mediaBrowserModalIcon || 'library_music', 'Header icon', { fallback:'library_music' })}<div class="field-row"><div class="field"><label>Width</label><select class="settings-input" name="mediaBrowserModalWidth">${[['compact','Compact'],['standard','Standard'],['wide','Wide'],['full','Full screen']].map(([v,l])=>`<option value="${v}" ${(settings.mediaBrowserModalWidth || 'wide')===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="field"><label>Height</label><select class="settings-input" name="mediaBrowserModalHeight">${[['auto','Content height'],['tall','Tall'],['full','Full screen']].map(([v,l])=>`<option value="${v}" ${(settings.mediaBrowserModalHeight || 'tall')===v?'selected':''}>${l}</option>`).join('')}</select></div></div><div class="field-row"><div class="field"><label>Background</label>${renderColorPicker('mediaBrowserModalBackground', settings.mediaBrowserModalBackground || '#111111')}</div><div class="field"><label>Foreground</label>${renderColorPicker('mediaBrowserModalForeground', settings.mediaBrowserModalForeground || '#f4f4f4')}</div></div><div class="field-row"><div class="field"><label>Corner radius</label><input class="settings-input" type="number" min="0" max="48" name="mediaBrowserModalRadius" value="${escapeHtml(settings.mediaBrowserModalRadius ?? 24)}"></div><div class="field"><label>Backdrop opacity</label><input class="settings-input" type="number" min="0" max="95" name="mediaBrowserModalBackdrop" value="${escapeHtml(settings.mediaBrowserModalBackdrop ?? 72)}"></div></div><label class="checkbox-row"><input type="checkbox" name="mediaBrowserModalShowHeader" ${settings.mediaBrowserModalShowHeader !== false ? 'checked' : ''}> Show modal header</label></section>`;
}

function mediaBrowserModalSettingsFields(settings = {}, { mediaEntitySelect = '' } = {}) {
  const editorSettings = {
    mediaBrowserLayoutMode: settings.mediaBrowserLayoutMode || 'swiper_coverflow',
    mediaBrowserPageSize: settings.mediaBrowserPageSize || '12',
    mediaBrowserColumns: settings.mediaBrowserColumns || '4',
    mediaBrowserSlidesPerView: settings.mediaBrowserSlidesPerView || '3',
    mediaBrowserSpaceBetween: settings.mediaBrowserSpaceBetween || '18',
    mediaBrowserCentered: settings.mediaBrowserCentered !== false,
    mediaBrowserLoop: Boolean(settings.mediaBrowserLoop),
    mediaBrowserNavigation: settings.mediaBrowserNavigation !== false,
    mediaBrowserPagination: settings.mediaBrowserPagination !== false
  };
  return `<section class="settings-section"><h3>Media browser modal</h3>${mediaEntitySelect}${mediaPresentationEditor(editorSettings,{layoutMode:'mediaBrowserLayoutMode',pageSize:'mediaBrowserPageSize',columns:'mediaBrowserColumns',swiperSlidesPerView:'mediaBrowserSlidesPerView',swiperSpaceBetween:'mediaBrowserSpaceBetween',swiperCentered:'mediaBrowserCentered',swiperLoop:'mediaBrowserLoop',swiperNavigation:'mediaBrowserNavigation',swiperPagination:'mediaBrowserPagination'})}<div class="field"><label>Default play action</label><select class="settings-input" name="mediaBrowserPlayAction">${[['PLAY_NOW','Play now'],['PLAY_NEXT','Play next'],['ADD_TO_QUEUE','Add to queue']].map(([value,label]) => `<option value="${value}" ${(settings.mediaBrowserPlayAction || 'PLAY_NOW') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>${[['mediaBrowserShowArtwork','Show artwork'],['mediaBrowserShowSubtitle','Show subtitle / artist'],['mediaBrowserShowSearch','Show search when supported']].map(([key,label]) => `<label class="checkbox-row"><input type="checkbox" name="${key}" ${settings[key] !== false ? 'checked' : ''}> ${label}</label>`).join('')}</section>${modalAppearanceFields(settings)}`;
}

function mediaBrowserModalSettingsFromForm(data) {
  return {
    mediaBrowserLayoutMode: String(data.get('mediaBrowserLayoutMode') || 'swiper_coverflow'),
    mediaBrowserPageSize: String(data.get('mediaBrowserPageSize') || '12'),
    mediaBrowserColumns: String(data.get('mediaBrowserColumns') || '4'),
    mediaBrowserPlayAction: String(data.get('mediaBrowserPlayAction') || 'PLAY_NOW'),
    mediaBrowserSlidesPerView: String(data.get('mediaBrowserSlidesPerView') || '3'),
    mediaBrowserSpaceBetween: String(data.get('mediaBrowserSpaceBetween') || '18'),
    mediaBrowserCentered: data.get('mediaBrowserCentered') === 'on',
    mediaBrowserLoop: data.get('mediaBrowserLoop') === 'on',
    mediaBrowserNavigation: data.get('mediaBrowserNavigation') === 'on',
    mediaBrowserPagination: data.get('mediaBrowserPagination') === 'on',
    mediaBrowserShowArtwork: data.get('mediaBrowserShowArtwork') === 'on',
    mediaBrowserShowSubtitle: data.get('mediaBrowserShowSubtitle') === 'on',
    mediaBrowserShowSearch: data.get('mediaBrowserShowSearch') === 'on',
    mediaBrowserModalTitle: String(data.get('mediaBrowserModalTitle') || ''),
    mediaBrowserModalIcon: String(data.get('mediaBrowserModalIcon') || 'library_music'),
    mediaBrowserModalWidth: String(data.get('mediaBrowserModalWidth') || 'wide'),
    mediaBrowserModalHeight: String(data.get('mediaBrowserModalHeight') || 'tall'),
    mediaBrowserModalBackground: String(data.get('mediaBrowserModalBackground') || '#111111'),
    mediaBrowserModalForeground: String(data.get('mediaBrowserModalForeground') || '#f4f4f4'),
    mediaBrowserModalRadius: String(data.get('mediaBrowserModalRadius') || '24'),
    mediaBrowserModalBackdrop: String(data.get('mediaBrowserModalBackdrop') || '72'),
    mediaBrowserModalShowHeader: data.get('mediaBrowserModalShowHeader') === 'on'
  };
}


function conditionOperatorOptions(selected = 'equals') {
  return [['equals','Equals'],['not_equals','Does not equal'],['contains','Contains'],['greater','Greater than'],['greater_equal','Greater than or equal'],['less','Less than'],['less_equal','Less than or equal'],['truthy','Is active / truthy'],['falsy','Is inactive / falsy']].map(([value,label]) => `<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('');
}
function actionTypeOptions(selected = 'none') {
  return [['none','No action'],['navigate','Navigate to dashboard'],['command','Call entity service / command'],['toggle','Toggle entity'],['more_info','Open more-info'],['modal_widget','Open widget in modal']].map(([value,label])=>`<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('');
}
function widgetActionEditor(slot,label,action) {
  const a=normalizeWidgetAction(action); const commands=allCommandActions(); const widgets=allDashboardItems().filter((entry)=>entry.id!==state.modal?.itemId);
  return `<details class="action-editor" ${a.type!=='none'?'open':''}><summary>${escapeHtml(label)}<span>${escapeHtml(a.type.replaceAll('_',' '))}</span></summary><div class="field"><label>Action</label><select class="settings-input" name="actionType:${slot}">${actionTypeOptions(a.type)}</select></div><div class="field"><label>Dashboard</label><select class="settings-input" name="actionDashboard:${slot}"><option value="">Select dashboard</option>${state.config.dashboards.map((d)=>`<option value="${escapeHtml(d.id)}" ${a.dashboardId===d.id?'selected':''}>${escapeHtml(d.name)}</option>`).join('')}</select></div><div class="field"><label>Entity command</label><select class="settings-input" name="actionCommand:${slot}"><option value="">Select command</option>${commands.map((command)=>{const value=encodeCommandAction(command);return `<option value="${escapeHtml(value)}" ${a.commandAction===value?'selected':''}>${escapeHtml(command.label)}</option>`}).join('')}</select></div>${entitySelect(`actionEntity:${slot}`,a.entityId,'Entity')}<div class="field"><label>Modal widget</label><select class="settings-input" name="actionWidget:${slot}"><option value="">Select widget</option>${widgets.map((entry)=>`<option value="${escapeHtml(entry.id)}" ${a.widgetId===entry.id?'selected':''}>${escapeHtml(widgetEditorLabel(entry))}</option>`).join('')}</select></div><div class="field-row"><div class="field"><label>Confirmation</label><select class="settings-input" name="actionConfirm:${slot}"><option value="none" ${a.confirmMode==='none'?'selected':''}>None</option><option value="dialog" ${a.confirmMode==='dialog'?'selected':''}>Dialog</option><option value="hold" ${a.confirmMode==='hold'?'selected':''}>Hold to confirm</option></select></div><div class="field"><label>Hold duration</label><input class="settings-input" type="number" min="0.4" max="5" step="0.1" name="actionHold:${slot}" value="${a.holdSeconds}"></div></div><div class="field"><label>Confirmation text</label><input class="settings-input" name="actionConfirmText:${slot}" value="${escapeHtml(a.confirmText)}"></div></details>`;
}
// Preset / linked-component prompts temporarily replace the widget editor. Remember
// the editor (and its current step) so Cancel or Save returns to it instead of
// closing every dialog.
function widgetEditorReturnModal(node) {
  const form = node?.closest?.('[data-widget-settings-form]');
  if (!form || state.modal?.type !== 'widget-settings') return null;
  return { ...state.modal, step: form.dataset.editorStep || 'content' };
}
function widgetEditorLabel(item) { const entity=item.kind==='entity'?entityForItem(item):null; return item.kind==='system'?(SYSTEM_WIDGETS[item.widgetType]?.label||item.widgetType):localName(entity?.name||item.snapshot?.name||item.entityId); }
function widgetActionsFromForm(data) { const result={}; for(const slot of ['tap','double','hold']) result[slot]=normalizeWidgetAction({type:data.get(`actionType:${slot}`),dashboardId:data.get(`actionDashboard:${slot}`),commandAction:data.get(`actionCommand:${slot}`),entityId:data.get(`actionEntity:${slot}`),widgetId:data.get(`actionWidget:${slot}`),confirmMode:data.get(`actionConfirm:${slot}`),confirmText:data.get(`actionConfirmText:${slot}`),holdSeconds:data.get(`actionHold:${slot}`)}); return result; }
function conditionEditorRow(rule,index) { const r=normalizeConditionRule(rule); return `<article class="condition-editor-row" data-condition-row data-condition-id="${escapeHtml(r.id)}"><div class="condition-row-head"><strong>Condition ${index+1}</strong><button type="button" class="danger" data-action="remove-condition-row">${materialSymbol('delete',17)}</button></div><div class="field-row"><div class="field"><label>Type</label><select class="settings-input" name="conditionType:${r.id}">${[['entity_state','Entity state'],['numeric','Numeric value'],['time','Time range'],['day','Day of week'],['screen','Screen / orientation'],['dashboard','Active dashboard']].map(([v,l])=>`<option value="${v}" ${r.type===v?'selected':''}>${l}</option>`).join('')}</select></div>${entitySelect(`conditionEntity:${r.id}`,r.entityId,'Entity')}</div><div class="field-row"><div class="field"><label>Attribute</label><input class="settings-input" name="conditionAttribute:${r.id}" value="${escapeHtml(r.attribute)}"></div><div class="field"><label>Operator</label><select class="settings-input" name="conditionOperator:${r.id}">${conditionOperatorOptions(r.operator)}</select></div></div><div class="field-row"><div class="field"><label>Value / start / min width</label><input class="settings-input" name="conditionValue:${r.id}" value="${escapeHtml(r.value)}"></div><div class="field"><label>End / max width</label><input class="settings-input" name="conditionValue2:${r.id}" value="${escapeHtml(r.value2)}"></div></div><div class="field"><label>Orientation</label><select class="settings-input" name="conditionOrientation:${r.id}"><option value="landscape" ${r.orientation==='landscape'?'selected':''}>Landscape</option><option value="portrait" ${r.orientation==='portrait'?'selected':''}>Portrait</option></select></div><div class="field"><label>Dashboard</label><select class="settings-input" name="conditionDashboard:${r.id}"><option value="">Select dashboard</option>${state.config.dashboards.map((d)=>`<option value="${escapeHtml(d.id)}" ${r.dashboardId===d.id?'selected':''}>${escapeHtml(d.name)}</option>`).join('')}</select></div><div class="weekday-grid">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day,i)=>`<label><input type="checkbox" name="conditionDay:${r.id}" value="${i}" ${r.days.includes(i)?'checked':''}><span>${day}</span></label>`).join('')}</div></article>`; }
function conditionsFromForm(data,form) { return normalizeConditionGroup({mode:data.get('conditionMode'),rules:[...form.querySelectorAll('[data-condition-row]')].map((row)=>{const id=row.dataset.conditionId;return {id,type:data.get(`conditionType:${id}`),entityId:data.get(`conditionEntity:${id}`),attribute:data.get(`conditionAttribute:${id}`),operator:data.get(`conditionOperator:${id}`),value:data.get(`conditionValue:${id}`),value2:data.get(`conditionValue2:${id}`),orientation:data.get(`conditionOrientation:${id}`),dashboardId:data.get(`conditionDashboard:${id}`),days:data.getAll(`conditionDay:${id}`)}})}); }
function stateStyleEditorRow(style,index) { const s=normalizeStateStyles([style])[0]; return `<article class="state-style-row" data-state-style-row data-style-id="${escapeHtml(s.id)}"><div class="condition-row-head"><strong>Style rule ${index+1}</strong><button type="button" class="danger" data-action="remove-state-style-row">${materialSymbol('delete',17)}</button></div>${entitySelect(`styleEntity:${s.id}`,s.entityId,'Entity')}<div class="field-row"><div class="field"><label>Attribute</label><input class="settings-input" name="styleAttribute:${s.id}" value="${escapeHtml(s.attribute)}"></div><div class="field"><label>Operator</label><select class="settings-input" name="styleOperator:${s.id}">${conditionOperatorOptions(s.operator)}</select></div></div><div class="field"><label>Comparison value</label><input class="settings-input" name="styleValue:${s.id}" value="${escapeHtml(s.value)}"></div><div class="state-style-colors"><label>Background${renderColorPicker(`styleBackground:${s.id}`,s.backgroundColor||'#111111',{allowEmpty:true})}</label><label>Border${renderColorPicker(`styleBorder:${s.id}`,s.borderColor||'#333333',{allowEmpty:true})}</label><label>Text${renderColorPicker(`styleText:${s.id}`,s.textColor||'#ffffff',{allowEmpty:true})}</label><label>Accent${renderColorPicker(`styleAccent:${s.id}`,s.accentColor||'#d0d0d0',{allowEmpty:true})}</label></div><div class="field"><label>Opacity (blank = unchanged)</label><input class="settings-input" type="number" min="0" max="100" name="styleOpacity:${s.id}" value="${escapeHtml(s.opacity)}"></div></article>`; }
function stateStylesFromForm(data,form) { return normalizeStateStyles([...form.querySelectorAll('[data-state-style-row]')].map((row)=>{const id=row.dataset.styleId;return {id,entityId:data.get(`styleEntity:${id}`),attribute:data.get(`styleAttribute:${id}`),operator:data.get(`styleOperator:${id}`),value:data.get(`styleValue:${id}`),backgroundColor:data.get(`styleBackground:${id}`),borderColor:data.get(`styleBorder:${id}`),textColor:data.get(`styleText:${id}`),accentColor:data.get(`styleAccent:${id}`),opacity:data.get(`styleOpacity:${id}`)}})); }

function widgetReferenceOptions(selected='',excludeId=''){return `<option value="">Not selected</option>${allDashboardItems().filter((entry)=>entry.id!==excludeId).map((entry)=>`<option value="${escapeHtml(entry.id)}" ${entry.id===selected?'selected':''}>${escapeHtml(widgetEditorLabel(entry))}</option>`).join('')}`;}
function alertRuleEditorRow(rule={},index=0){const value=normalizeAlertRule(rule);return `<article class="alert-rule-row" data-alert-rule-row data-rule-id="${escapeHtml(value.id)}"><div class="settings-section-heading"><strong>Custom alert ${index+1}</strong><button type="button" class="icon-button danger" data-action="alert-rule-remove">${materialSymbol('delete',18)}</button></div>${entitySelect(`alertEntity:${value.id}`,value.entityId,'Entity')}<div class="field-row"><div class="field"><label>Attribute</label><input class="settings-input" name="alertAttribute:${escapeHtml(value.id)}" value="${escapeHtml(value.attribute)}"></div><div class="field"><label>Operator</label><select class="settings-input" name="alertOperator:${escapeHtml(value.id)}">${conditionOperatorOptions(value.operator)}</select></div></div><div class="field-row"><div class="field"><label>Value</label><input class="settings-input" name="alertValue:${escapeHtml(value.id)}" value="${escapeHtml(value.value)}"></div><div class="field"><label>Severity</label><select class="settings-input" name="alertSeverity:${escapeHtml(value.id)}">${[['info','Info'],['warning','Warning'],['critical','Critical']].map(([v,l])=>`<option value="${v}" ${value.severity===v?'selected':''}>${l}</option>`).join('')}</select></div></div><div class="field"><label>Message</label><input class="settings-input" name="alertMessage:${escapeHtml(value.id)}" value="${escapeHtml(value.message)}"></div><label class="checkbox-row"><input type="checkbox" name="alertDismissible:${escapeHtml(value.id)}" ${value.dismissible?'checked':''}> Can be dismissed</label></article>`;}
function alertRulesFromForm(data,form){return [...form.querySelectorAll('[data-alert-rule-row]')].map((row)=>{const id=row.dataset.ruleId;return normalizeAlertRule({id,entityId:data.get(`alertEntity:${id}`),attribute:data.get(`alertAttribute:${id}`),operator:data.get(`alertOperator:${id}`),value:data.get(`alertValue:${id}`),severity:data.get(`alertSeverity:${id}`),message:data.get(`alertMessage:${id}`),dismissible:data.get(`alertDismissible:${id}`)==='on'});}).filter((entry)=>entry.entityId);}
function responsiveEditor(item){const responsive=normalizeResponsiveSettings(item.settings?.responsive);return `<section class="settings-section responsive-widget-editor"><h3>Responsive variants</h3><p class="muted">Override size or presentation only where needed. Empty dimensions keep the dashboard layout.</p>${RESPONSIVE_KEYS.map((key)=>{const value=responsive[key];const label={phone:'Phone',tabletPortrait:'Tablet portrait',tabletLandscape:'Tablet landscape',desktop:'Desktop'}[key];return `<article><label class="checkbox-row"><input type="checkbox" name="responsiveEnabled:${key}" ${value.enabled?'checked':''}> <strong>${label}</strong></label><div class="field-row"><div class="field"><label>Width</label><input class="settings-input" type="number" min="1" max="24" name="responsiveW:${key}" value="${escapeHtml(value.w)}" placeholder="Default"></div><div class="field"><label>Height</label><input class="settings-input" type="number" min="1" max="24" name="responsiveH:${key}" value="${escapeHtml(value.h)}" placeholder="Default"></div></div><div class="field-row"><div class="field"><label>Padding</label><input class="settings-input" type="number" min="0" max="48" name="responsivePadding:${key}" value="${escapeHtml(value.padding)}" placeholder="Default"></div><div class="field"><label>Font scale %</label><input class="settings-input" type="number" min="60" max="160" name="responsiveFontScale:${key}" value="${escapeHtml(value.fontScale)}" placeholder="100"></div></div><label class="checkbox-row"><input type="checkbox" name="responsiveCompact:${key}" ${value.compact?'checked':''}> Compact mode</label><label class="checkbox-row"><input type="checkbox" name="responsiveHidden:${key}" ${value.hidden?'checked':''}> Hide at this breakpoint</label></article>`;}).join('')}</section>`;}
function responsiveFromForm(data){const result={};for(const key of RESPONSIVE_KEYS)result[key]={enabled:data.get(`responsiveEnabled:${key}`)==='on',hidden:data.get(`responsiveHidden:${key}`)==='on',compact:data.get(`responsiveCompact:${key}`)==='on',w:String(data.get(`responsiveW:${key}`)||''),h:String(data.get(`responsiveH:${key}`)||''),padding:String(data.get(`responsivePadding:${key}`)||''),fontScale:String(data.get(`responsiveFontScale:${key}`)||'')};return normalizeResponsiveSettings(result);}
function fallbackFromForm(data){return normalizeFallback({mode:data.get('fallbackMode'),text:data.get('fallbackText'),icon:data.get('fallbackIcon'),widgetId:data.get('fallbackWidgetId')});}
function componentReuseControls(item){const presets=state.config.widgetPresets||[],masters=state.config.widgetMasters||[];return `<section class="settings-section reuse-library"><h3>Presets &amp; linked components</h3><p class="muted">Reuse this widget's configuration, or link widgets so they share one master configuration.</p><div class="field-row reuse-library-row"><div class="field"><label>Preset</label><select class="settings-input" data-widget-preset-select><option value="">Choose preset</option>${presets.map((entry)=>`<option value="${escapeHtml(entry.id)}">${escapeHtml(entry.name)}</option>`).join('')}</select></div><button type="button" class="pill-button" data-action="apply-widget-preset" data-item-id="${escapeHtml(item.id)}">Apply</button><button type="button" class="pill-button" data-action="save-widget-preset" data-item-id="${escapeHtml(item.id)}">Save preset</button></div><div class="field-row reuse-library-row"><div class="field"><label>Linked component</label><select class="settings-input" data-widget-master-select><option value="">Not linked</option>${masters.map((entry)=>`<option value="${escapeHtml(entry.id)}" ${item.linkedMasterId===entry.id?'selected':''}>${escapeHtml(entry.name)}</option>`).join('')}</select></div><button type="button" class="pill-button" data-action="link-widget-master" data-item-id="${escapeHtml(item.id)}">Link</button>${item.linkedMasterId?`<button type="button" class="pill-button" data-action="update-widget-master" data-item-id="${escapeHtml(item.id)}">Update master</button><button type="button" class="pill-button" data-action="detach-widget-master" data-item-id="${escapeHtml(item.id)}">Detach</button>`:`<button type="button" class="pill-button" data-action="create-widget-master" data-item-id="${escapeHtml(item.id)}">Create linked component</button>`}</div></section>`;}

function renderWidgetBehaviorSettings(item) { const settings=item.settings||{}; const actions=normalizeWidgetActions(settings.actions); const conditions=normalizeConditionGroup(settings.conditions); const fallback=normalizeFallback(settings.fallback); return `<section class="settings-section"><h3>Interactions</h3>${widgetActionEditor('tap','Tap',actions.tap)}${widgetActionEditor('double','Double tap',actions.double)}${widgetActionEditor('hold','Hold',actions.hold)}</section><section class="settings-section"><h3>Unavailable behavior</h3><select class="settings-input" name="unavailableBehavior">${[['dim','Dim widget'],['hide','Hide and collapse'],['overlay','Unavailable overlay'],['view_only','View only, block controls']].map(([v,l])=>`<option value="${v}" ${settings.unavailableBehavior===v?'selected':''}>${l}</option>`).join('')}</select></section><section class="settings-section"><div class="settings-section-heading"><div><h3>Visibility conditions</h3><p class="muted">Conditions share one rule engine across all widgets.</p></div><button type="button" class="pill-button" data-action="add-condition-row">${materialSymbol('add',18)} Add</button></div><div class="field"><label>Match</label><select class="settings-input" name="conditionMode"><option value="all" ${conditions.mode!=='any'?'selected':''}>All conditions</option><option value="any" ${conditions.mode==='any'?'selected':''}>Any condition</option></select></div><div data-condition-list>${conditions.rules.map(conditionEditorRow).join('')}</div><div class="field"><label>Transition</label><select class="settings-input" name="visibilityTransition">${[['none','None'],['fade','Fade'],['scale','Scale'],['slide','Slide']].map(([v,l])=>`<option value="${v}" ${settings.visibilityTransition===v?'selected':''}>${l}</option>`).join('')}</select></div></section><section class="settings-section"><div class="settings-section-heading"><div><h3>State styling</h3><p class="muted">Later matching rules override earlier ones.</p></div><button type="button" class="pill-button" data-action="add-state-style-row">${materialSymbol('add',18)} Add</button></div><div data-state-style-list>${normalizeStateStyles(settings.stateStyles).map(stateStyleEditorRow).join('')}</div></section><section class="settings-section"><h3>Fallback content</h3><div class="field"><label>When hidden or unavailable</label><select class="settings-input" name="fallbackMode">${[['none','No fallback'],['hide','Hide completely'],['message','Custom icon and text'],['widget','Show another widget']].map(([v,l])=>`<option value="${v}" ${fallback.mode===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="field"><label>Message</label><input class="settings-input" name="fallbackText" value="${escapeHtml(fallback.text)}"></div>${iconChoiceField('fallbackIcon',fallback.icon,'Fallback icon',{fallback:'cloud_off'})}<div class="field"><label>Fallback widget</label><select class="settings-input" name="fallbackWidgetId">${widgetReferenceOptions(fallback.widgetId,item.id)}</select></div></section>`; }
function routineActionEditorRow(action,index) { const a=normalizeRoutineAction(action); return `<article class="routine-action-editor" data-routine-action-row data-routine-id="${escapeHtml(a.id)}"><div class="condition-row-head"><strong>Action ${index+1}</strong><button type="button" class="danger" data-action="routine-action-remove">${materialSymbol('delete',17)}</button></div><div class="field-row"><div class="field"><label>Label</label><input class="settings-input" name="routineLabel:${a.id}" value="${escapeHtml(a.label)}"></div>${iconChoiceField(`routineIcon:${a.id}`,a.icon,'Action icon',{fallback:'play_arrow',compact:true})}</div><div class="field"><label>Command</label><select class="settings-input" name="routineCommand:${a.id}"><option value="">Select command</option>${allCommandActions().map((command)=>{const value=encodeCommandAction(command);return `<option value="${escapeHtml(value)}" ${a.commandAction===value?'selected':''}>${escapeHtml(command.label)}</option>`}).join('')}</select></div><label class="checkbox-row"><input type="checkbox" name="routineConfirm:${a.id}" ${a.confirm?'checked':''}> Ask for confirmation</label></article>`; }

function renderWidgetAppearanceSettings(item) {
  const settings = item.settings || {};
  const uploadVisible = settings.iconMode === 'upload' && settings.customIconData;
  const materialVisible = settings.iconMode === 'material' && settings.materialIcon;
  const unfoldedVisible = settings.iconMode === 'unfolded_tools' && settings.unfoldedToolsIconUrl;
  const iconPreviews = `<div class="custom-icon-preview" data-uploaded-icon-preview ${uploadVisible ? '' : 'hidden'}>${uploadVisible ? `<img src="${escapeHtml(settings.customIconData)}" alt=""><span>${escapeHtml(settings.customIconName || 'Uploaded icon')}</span>` : ''}</div><div class="custom-icon-preview" data-material-icon-preview ${materialVisible ? '' : 'hidden'}>${materialVisible ? `<span>${materialSymbol(settings.materialIcon, 34)}</span><span>${escapeHtml(settings.materialIcon)}</span>` : ''}</div><div class="custom-icon-preview" data-unfolded-tools-icon-preview ${unfoldedVisible ? '' : 'hidden'}>${unfoldedVisible ? `<img src="${escapeHtml(settings.unfoldedToolsIconUrl)}" alt=""><span>${escapeHtml(settings.unfoldedToolsIconAsset?.name || 'unfolded.tools icon')}</span>` : ''}</div>`;
  return `<section class="settings-section advanced-widget-settings"><h3>Widget shell</h3><label class="checkbox-row"><input type="checkbox" name="showWidgetTitle" ${settings.showWidgetTitle !== false ? 'checked' : ''}> Show the widget title or entity name</label><label class="checkbox-row"><input type="checkbox" name="showWidgetBackground" ${settings.showWidgetBackground !== false ? 'checked' : ''}> Show widget background</label><label class="checkbox-row"><input type="checkbox" name="showWidgetBorder" ${settings.showWidgetBorder !== false ? 'checked' : ''}> Show widget border and hover outline</label></section>
  <section class="settings-section advanced-widget-settings"><h3>Text overflow</h3><div class="field"><label>When text is too long</label><select class="settings-input" name="textOverflow">${[['scroll','Auto-scroll'],['wrap','Wrap onto multiple lines'],['truncate','Truncate with ellipsis']].map(([value,label]) => `<option value="${value}" ${widgetTextMode(item) === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div></section>
  <section class="settings-section advanced-widget-settings"><h3>Widget icon</h3><div class="field"><label>Icon source</label><select class="settings-input" name="iconMode">${[['default','Widget default'],['material','Material Symbol'],['unfolded_tools','unfolded.tools'],['upload','Uploaded PNG or SVG']].map(([value,label]) => `<option value="${value}" ${settings.iconMode === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="field"><label>Material Symbol</label><input class="settings-input" name="materialIcon" value="${escapeHtml(settings.materialIcon || '')}" placeholder="Choose a symbol" readonly><button type="button" class="pill-button icon-picker-open" data-action="toggle-material-icon-picker">${icon('grid', 18)} Browse every Material Symbol</button><div class="material-icon-picker" data-material-icon-picker hidden><input class="settings-input" type="search" data-material-icon-search placeholder="Search icons"><div data-material-icon-results>${renderMaterialSymbolResults('')}</div></div><small>The complete Material Symbols Rounded catalog and variable font are bundled locally.</small></div><div class="field"><label>unfolded.tools</label><button type="button" class="pill-button unfolded-tools-picker-open" data-action="open-unfolded-tools-picker">${materialSymbol('language',18)} Browse unfolded.tools</button><input type="hidden" name="unfoldedToolsIconUrl" value="${escapeHtml(settings.unfoldedToolsIconUrl || '')}"><input type="hidden" name="unfoldedToolsIconAsset" value="${escapeHtml(settings.unfoldedToolsIconAsset ? JSON.stringify(settings.unfoldedToolsIconAsset) : '')}"><small>Search app icons, TV app icons, community icons, and country-specific TV channel logos.</small></div><div class="field"><label>Upload PNG or SVG</label><input class="settings-input" type="file" name="customIconFile" accept="image/png,image/svg+xml,image/webp"><small>Maximum 2 MB. The image is stored in the dashboard configuration.</small></div>${iconPreviews}${settings.customIconData ? '<label class="checkbox-row"><input type="checkbox" name="clearCustomIcon"> Remove uploaded icon</label>' : ''}</section>`;
}

function renderWidgetCodeSettings(item) {
  const settings = item.settings || {};
  return `<section class="settings-section advanced-widget-settings"><h3>Custom HTML, CSS and JavaScript</h3><p class="warning-copy">Custom code runs with dashboard access. Only use code you trust.</p>
    <label class="checkbox-row custom-code-scope-toggle"><input type="checkbox" name="customCodeGlobal" ${settings.customCodeScope === 'dashboard' ? 'checked' : ''}> Apply CSS and JavaScript to the entire dashboard</label><small>When disabled, CSS selectors are scoped to this widget and the JavaScript <code>root</code> variable points to the widget. When enabled, selectors such as <code>* { … }</code> can affect the complete dashboard and <code>root</code> points to the document.</small>
    <div class="field"><label>Custom HTML placement</label><select class="settings-input" name="customHtmlMode">${[['append','After built-in content'],['prepend','Before built-in content'],['replace','Replace built-in content']].map(([value,label]) => `<option value="${value}" ${settings.customHtmlMode === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
    <div class="field"><label>Custom HTML</label><textarea class="settings-input settings-code" name="customHtml" spellcheck="false">${escapeHtml(settings.customHtml || '')}</textarea></div>
    <div class="field"><label>Custom CSS</label><textarea class="settings-input settings-code" name="customCss" spellcheck="false" placeholder=":host { border-color: #d0d0d0; }">${escapeHtml(settings.customCss || '')}</textarea></div>
    <div class="field"><label>Custom JavaScript</label><textarea class="settings-input settings-code" name="customJs" spellcheck="false" placeholder="root.querySelector('…')">${escapeHtml(settings.customJs || '')}</textarea><small>Available variables: <code>widget</code>, <code>entity</code>, <code>state</code>, <code>api</code>, and <code>root</code>. Return a cleanup function to remove timers or listeners before rerendering.</small></div>
  </section>`;
}

function previewItemFromForm(form, item) {
  const preview = structuredClone(item);
  preview._previewSourceId = item.id;
  preview.id = `${item.id}__preview`;
  preview.settings = { ...(item.settings || {}) };
  const data = new FormData(form);
  if (preview.kind === 'system') {
    const defaults = SYSTEM_WIDGETS[preview.widgetType]?.settings || {};
    for (const [key, fallback] of Object.entries(defaults)) {
      if (['items','tabs','activityConfigs','activeTabId','templateElements'].includes(key)) continue;
      if (preview.widgetType === 'activity_launcher' && key === 'activityEntityIds') preview.settings[key] = data.getAll(key).join(',');
      else if (typeof fallback === 'boolean') preview.settings[key] = data.get(key) === 'on';
      else if (data.has(key)) preview.settings[key] = String(data.get(key) ?? fallback);
    }
    if (preview.widgetType === 'entity_template') {
      preview.settings.entityId = String(data.get('entityId') || '');
      preview.settings.templateColumns = String(Math.max(1, Math.min(6, Number(data.get('templateColumns')) || 2)));
      preview.settings.templateGap = String(Math.max(0, Math.min(32, Number(data.get('templateGap')) || 10)));
      preview.settings.templateElements = templateElementsFromForm(data, form, preview.settings);
    }
  } else {
    const type = preview.entityType || entityForItem(preview)?.entity_type;
    preview.settings.customTitle = String(data.get('customTitle') || '').trim();
    preview.settings.customSubtitle = String(data.get('customSubtitle') || '').trim();
    preview.settings.elements = { ...(preview.settings.elements || {}) };
    for (const [key] of ELEMENT_OPTIONS[type] || []) preview.settings.elements[key] = data.get(`element:${key}`) === 'on';
  }
  preview.settings.showWidgetTitle = data.get('showWidgetTitle') === 'on';
  preview.settings.showWidgetBackground = data.get('showWidgetBackground') === 'on';
  preview.settings.showWidgetBorder = data.get('showWidgetBorder') === 'on';
  preview.settings.textOverflow = String(data.get('textOverflow') || preview.settings.textOverflow || 'scroll');
  preview.settings.iconMode = String(data.get('iconMode') || preview.settings.iconMode || 'default');
  preview.settings.materialIcon = String(data.get('materialIcon') || preview.settings.materialIcon || '');
  preview.settings.unfoldedToolsIconUrl = String(data.get('unfoldedToolsIconUrl') || preview.settings.unfoldedToolsIconUrl || '');
  try { preview.settings.unfoldedToolsIconAsset = JSON.parse(String(data.get('unfoldedToolsIconAsset') || '{}')); } catch {}
  preview.settings.customHtmlMode = String(data.get('customHtmlMode') || preview.settings.customHtmlMode || 'append');
  preview.settings.customHtml = String(data.get('customHtml') || '');
  preview.settings.customCss = String(data.get('customCss') || '');
  preview.settings.customJs = String(data.get('customJs') || '');
  preview.settings.customCodeScope = data.get('customCodeGlobal') === 'on' ? 'dashboard' : 'widget';
  preview.settings.elementLayout = elementLayoutFromForm(data, preview);
  if (preview.kind !== 'system' && ENTITY_GRID_LAYOUT_TYPES.has(preview.entityType || entityForItem(preview)?.entity_type)) preview.settings.entityGrid = entityGridLayoutFromForm(data, preview);
  if (data.get('clearCustomIcon') === 'on') {
    preview.settings.customIconData = '';
    preview.settings.customIconName = '';
  } else if (form._previewCustomIconData) {
    preview.settings.customIconData = form._previewCustomIconData;
    preview.settings.customIconName = form._previewCustomIconName || 'Uploaded icon';
  }
  return preview;
}

function widgetEditorPreviewDimensions(item) {
  const sourceId = String(item?._previewSourceId || item?.id || '').replace(/__preview$/, '');
  let live = null;
  if (sourceId) {
    try {
      live = [...app.querySelectorAll(`[data-item-id="${CSS.escape(sourceId)}"]`)].find((node) => !node.closest('[data-widget-preview]')) || null;
    } catch { live = null; }
  }
  // offsetWidth/offsetHeight are the widget's layout size in CSS pixels. Unlike
  // getBoundingClientRect() they are not distorted by kiosk scale-to-fit or
  // dashboard transition transforms, so the preview lays out exactly like the tile.
  const width = live?.offsetWidth || 0;
  const height = live?.offsetHeight || 0;
  if (width >= 40 && height >= 40) return { width: Math.round(width), height: Math.round(height), source:'dashboard' };
  const type = item?.kind === 'system' ? item.widgetType : item?.entityType || item?.snapshot?.entity_type || 'sensor';
  const defaults = DEFAULT_SIZES[type] || { w:4, h:2 };
  const w = Math.max(1, Number(item?.w) || defaults.w);
  const h = Math.max(1, Number(item?.h) || defaults.h);
  // Widgets that are not currently rendered use the real square grid geometry
  // of the dashboard instead of a fixed 64px legacy cell.
  const view = dashboardViewState();
  const shared = state.sharedDashboardGeometry || {};
  const cell = Number(view?.gridCellSize) || Number(shared.gridCellSize) || 64;
  const gap = Number(view?.gridCellSize) ? (Number(view.gridGap) || 0) : Number(shared.gridCellSize) ? (Number(shared.gridGap) || 0) : 10;
  return { width: Math.round(w * cell + Math.max(0, w - 1) * gap), height: Math.round(h * cell + Math.max(0, h - 1) * gap), source:'grid' };
}

// Scale the editor preview down (never up) so the complete widget is visible in
// the preview pane. The widget itself keeps its real pixel dimensions, so text,
// controls and breakpoints render exactly as they do on the dashboard.
function fitWidgetEditorPreview(form) {
  const frame = form?.querySelector?.('[data-widget-preview-frame]');
  const target = frame?.querySelector('[data-widget-preview]');
  const card = target?.querySelector('.widget-editor-preview-card');
  if (!frame || !target || !card) return;
  const frameStyles = getComputedStyle(frame);
  const availableWidth = frame.clientWidth - (Number.parseFloat(frameStyles.paddingLeft) || 0) - (Number.parseFloat(frameStyles.paddingRight) || 0);
  const pane = form.querySelector('.widget-editor-preview-pane');
  const head = pane?.querySelector('.widget-editor-preview-head');
  const note = pane?.querySelector('.widget-editor-preview-sticky > small');
  const availableHeight = pane ? pane.clientHeight - (head?.offsetHeight || 0) - (note?.offsetHeight || 0) - 120 : Infinity;
  const width = card.offsetWidth;
  const height = card.offsetHeight;
  if (!width || !height || availableWidth <= 0) return;
  const scale = Math.max(0.2, Math.min(1, availableWidth / width, availableHeight > 160 ? availableHeight / height : 1));
  target.style.setProperty('--preview-fit-scale', scale.toFixed(4));
  frame.dataset.previewScale = String(Math.round(scale * 100));
}

function renderWidgetEditorPreview(item) {
  const previousPreviewState = state.renderingPreview;
  state.renderingPreview = true;
  try {
    const isSystem = item.kind === 'system';
    const entity = isSystem ? null : entityForItem(item);
    const type = isSystem ? item.widgetType : entity?.entity_type || item.entityType || 'unknown';
    const transparent = isSystem && ['carousel','entity_group'].includes(type) && item.settings?.containerStyle === false;
    const nativeContent = isSystem ? renderSystemWidget(item) : renderEntityWidget(entity || item.snapshot || {}, item);
    const dimensions = widgetEditorPreviewDimensions(item);
    const runtimeStyle = widgetRuntimeStyle(item);
    const previewStyle = [`--widget-preview-width:${dimensions.width}px`,`--widget-preview-height:${dimensions.height}px`,responsiveStyle(item),runtimeStyle].filter(Boolean).join(';');
    return `<article class="remote-entity widget-editor-preview-card ${responsiveClasses(item)} ${isSystem ? 'system-widget' : 'entity-widget'} type-${escapeHtml(type)} text-overflow-${widgetTextMode(item)} ${item.settings?.showWidgetTitle === false ? 'widget-title-hidden' : ''} widget-content-align-${escapeHtml(item.settings?.contentAlignment || 'default')} ${item.settings?.showWidgetBackground === false ? 'widget-background-hidden' : ''} ${item.settings?.showWidgetBorder === false ? 'widget-border-hidden' : ''} ${transparent ? 'container-shell-transparent' : ''}" style="${escapeHtml(previewStyle)}" data-preview-size-source="${dimensions.source}" data-item-id="${escapeHtml(item.id)}">${widgetCustomStyle(item)}${widgetElementLayoutStyle(item)}${composeWidgetContent(item, nativeContent)}</article>`;
  } finally {
    state.renderingPreview = previousPreviewState;
  }
}

function updateWidgetEditorPreview(form) {
  const target = form?.querySelector('[data-widget-preview]');
  if (!target) return;
  const { item } = findDashboardItem(form.dataset.itemId);
  if (!item) return;
  const draft = previewItemFromForm(form, item);
  target.innerHTML = renderWidgetEditorPreview(draft);
  applyWidgetElementLayouts(target);
  updateMarquees(target);
  initializeMediaSwipers(target);
  initializeWidgetCarousels(target);
  annotateWidgetLayoutPreview(form);
  fitWidgetEditorPreview(form);
}

function scheduleWidgetEditorPreview(form) {
  if (!form?.matches('[data-widget-settings-form]')) return;
  cancelAnimationFrame(form._previewRaf || 0);
  form._previewRaf = requestAnimationFrame(() => updateWidgetEditorPreview(form));
}

function setWidgetEditorStep(form, requested) {
  if (!form) return;
  const steps = ['content','behavior','appearance','layout','variants','advanced'];
  const step = steps.includes(requested) ? requested : 'content';
  form.dataset.editorStep = step;
  form.querySelectorAll('[data-widget-editor-step]').forEach((button) => button.classList.toggle('active', button.dataset.widgetEditorStep === step));
  form.querySelectorAll('[data-widget-editor-panel]').forEach((panel) => panel.hidden = panel.dataset.widgetEditorPanel !== step);
  const index = steps.indexOf(step);
  const previous = form.querySelector('[data-action="widget-editor-previous"]');
  const next = form.querySelector('[data-action="widget-editor-next"]');
  if (previous) { previous.hidden = index <= 0; previous.disabled = index <= 0; }
  if (next) { next.hidden = index >= steps.length - 1; next.disabled = index >= steps.length - 1; }
  const frame = form.querySelector('[data-widget-preview-frame]');
  frame?.classList.toggle('layout-editor-active', step === 'layout');
  if (step === 'layout') selectLayoutEditorElement(form, form.dataset.layoutSelectedElement || form.querySelector('[data-layout-editor]')?.dataset.initialLayoutElement || '', { scroll:false });
  fitWidgetEditorPreview(form);
}

function renderWidgetSettingsModal() {
  const { item } = findDashboardItem(state.modal.itemId);
  if (!item) return '';
  const isSystem = item.kind === 'system';
  const entity = isSystem ? null : entityForItem(item);
  const type = isSystem ? item.widgetType : entity.entity_type;
  const label = isSystem ? SYSTEM_WIDGETS[type]?.label || type : localName(entity.name);

  let body = '';
  if (isSystem) {
    const settings = { ...(SYSTEM_WIDGETS[type]?.settings || {}), ...(item.settings || {}) };
    if (type === 'activity_launcher') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title || 'Activities')}"></div>${entitySelect('activityEntityIds', settings.activityEntityIds, 'Activities (leave all unchecked to show every activity)', ['activity'], true)}<div class="field"><label>Columns</label><select class="settings-input" name="columns">${[1,2,3,4].map((value) => `<option value="${value}" ${Number(settings.columns) === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div><section class="settings-section"><h3>Activity row</h3>${[['showIcon','Show activity icon'],['showName','Show activity name'],['showState','Show activity state'],['showCount','Show activity count in header']].map(([key,label]) => `<label class="checkbox-row"><input type="checkbox" name="${key}" ${settings[key] !== false ? 'checked' : ''}> ${label}</label>`).join('')}</section>${activityLauncherConfigFields(settings)}${mediaBrowserModalSettingsFields(settings)}`;
    } else if (type === 'camera') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title || 'Camera')}"></div><div class="field"><label>Stream or image URL</label><input class="settings-input" name="sourceUrl" value="${escapeHtml(settings.sourceUrl || '')}" placeholder="rtsp://user:password@camera/stream"></div><div class="field"><label>Source type</label><select class="settings-input" name="sourceType">${[['auto','Automatic'],['go2rtc','go2rtc RTSP output (MSE / WebRTC)'],...(!state.settings.onRemote ? [['generic_rtsp','Generic RTSP (external FFmpeg)']] : []),['video','Browser-compatible video'],['image','Still/MJPEG image']].map(([value,label]) => `<option value="${value}" ${settings.sourceType === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="field"><label>go2rtc API URL override</label><input class="settings-input" name="go2rtcApiUrl" value="${escapeHtml(settings.go2rtcApiUrl || '')}" placeholder="http://go2rtc-host:1984"><small>Optional. For an RTSP URL on port 8554, the dashboard automatically uses the same host on port 1984.</small></div><div class="field"><label>go2rtc stream name override</label><input class="settings-input" name="go2rtcStreamName" value="${escapeHtml(settings.go2rtcStreamName || '')}" placeholder="front-door"><small>Optional. Use this when the stream name cannot be derived from the pasted URL.</small></div><div class="field"><label>go2rtc playback modes</label><input class="settings-input" name="go2rtcMode" value="${escapeHtml(settings.go2rtcMode || 'webrtc,webrtc/tcp,mse,hls,mjpeg,mp4')}"><small>The integrated go2rtc player tries these modes in order. Recommended: webrtc,webrtc/tcp,mse,hls,mjpeg,mp4.</small></div><div class="field"><label>Poster URL</label><input class="settings-input" name="posterUrl" value="${escapeHtml(settings.posterUrl || '')}"></div><div class="field"><label>Image fit</label><select class="settings-input" name="objectFit">${['cover','contain','fill'].map((value) => `<option value="${value}" ${settings.objectFit === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div><div class="field"><label>Camera crop zoom</label><input type="range" min="100" max="160" name="cameraZoom" value="${escapeHtml(settings.cameraZoom || 112)}"><small>Increase this when the embedded go2rtc player shows letterboxing or a control strip.</small></div><div class="field"><label>Still-image refresh interval (seconds)</label><input class="settings-input" type="number" min="2" max="3600" name="refreshSeconds" value="${escapeHtml(settings.refreshSeconds || 10)}"></div>${[['showTitle','Show title'],['autoplay','Autoplay'],['muted','Mute stream'],['controls','Show video controls']].map(([key,label]) => `<label class="checkbox-row"><input type="checkbox" name="${key}" ${settings[key] ? 'checked' : ''}> ${label}</label>`).join('')}<p class="muted">go2rtc streams use go2rtc’s official compatibility player. With a go2rtc API URL, an arbitrary RTSP URL can be relayed directly by go2rtc by leaving the stream-name override empty. Generic RTSP uses FFmpeg only in an external deployment. On Remote Two and Remote 3, RTSP requires go2rtc.</p>`;
    } else if (type === 'conditional') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title || '')}"></div>${entitySelect('conditionEntityId', settings.conditionEntityId, 'Condition entity')}<div class="field"><label>Operator</label><select class="settings-input" name="operator">${[['equals','Equals'],['not_equals','Does not equal'],['contains','Contains'],['greater','Greater than'],['less','Less than'],['truthy','Is active / truthy']].map(([value,label]) => `<option value="${value}" ${settings.operator === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="field"><label>Comparison value</label><input class="settings-input" name="compareValue" value="${escapeHtml(settings.compareValue ?? 'ON')}"></div><div class="field"><label>Message when false</label><input class="settings-input" name="falseText" value="${escapeHtml(settings.falseText || 'Condition not met')}"></div><label class="checkbox-row"><input type="checkbox" name="invert" ${settings.invert ? 'checked' : ''}> Invert result</label><label class="checkbox-row"><input type="checkbox" name="hideWhenFalse" ${settings.hideWhenFalse ? 'checked' : ''}> Collapse completely when false</label><label class="checkbox-row"><input type="checkbox" name="layoutLocked" ${settings.layoutLocked ? 'checked' : ''}> Lock child order and layout</label>${conditionalItemOptions(item)}`;
    } else if (type === 'media_browser') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title || 'Media')}"></div>${entitySelect('mediaEntityId', settings.mediaEntityId, 'Media player', ['media_player'])}${mediaPresentationEditor(settings)}<div class="field"><label>Default play action</label><select class="settings-input" name="playAction">${[['PLAY_NOW','Play now'],['PLAY_NEXT','Play next'],['ADD_TO_QUEUE','Add to queue']].map(([value,label]) => `<option value="${value}" ${settings.playAction === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><label class="checkbox-row"><input type="checkbox" name="showArtwork" ${settings.showArtwork !== false ? 'checked' : ''}> Show artwork</label><label class="checkbox-row"><input type="checkbox" name="showSubtitle" ${settings.showSubtitle !== false ? 'checked' : ''}> Show subtitle / artist</label><label class="checkbox-row"><input type="checkbox" name="showSearch" ${settings.showSearch !== false ? 'checked' : ''}> Show search when supported</label>`;
    } else if (type === 'tab_container') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title || 'Tabs')}"></div>${tabContainerSettingsFields(item)}`;
    } else if (type === 'carousel') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title || 'Carousel')}"></div>${carouselPresentationEditor(settings)}<label class="checkbox-row"><input type="checkbox" name="showCounter" ${settings.showCounter !== false ? 'checked' : ''}> Show slide number in the top-right corner</label><label class="checkbox-row"><input type="checkbox" name="containerStyle" ${settings.containerStyle !== false ? 'checked' : ''}> Show carousel card background and border</label><label class="checkbox-row"><input type="checkbox" name="autoplay" ${settings.autoplay ? 'checked' : ''}> Rotate automatically</label><label class="checkbox-row"><input type="checkbox" name="layoutLocked" ${settings.layoutLocked ? 'checked' : ''}> Lock child order and layout</label><div class="field"><label>Rotation interval in seconds</label><input class="settings-input" type="number" name="intervalSeconds" min="2" max="3600" value="${escapeHtml(settings.intervalSeconds || 8)}"></div>${containerItemOptions(item)}`;
    } else if (type === 'entity_group') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title || 'Entity group')}"></div><div class="field-row"><div class="field"><label>Columns</label><select class="settings-input" name="columns">${[1,2,3,4].map((value) => `<option value="${value}" ${Number(settings.columns) === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div><div class="field"><label>Orientation</label><select class="settings-input" name="orientation">${[['grid','Grid'],['horizontal','Horizontal'],['vertical','Vertical']].map(([value,label])=>`<option value="${value}" ${settings.orientation===value?'selected':''}>${label}</option>`).join('')}</select></div></div><div class="field-row"><div class="field"><label>Gap</label><input class="settings-input" type="number" min="0" max="48" name="gap" value="${escapeHtml(settings.gap||12)}"></div><div class="field"><label>Padding</label><input class="settings-input" type="number" min="0" max="48" name="padding" value="${escapeHtml(settings.padding||0)}"></div></div><label class="checkbox-row"><input type="checkbox" name="wrap" ${settings.wrap!==false?'checked':''}> Wrap children</label><label class="checkbox-row"><input type="checkbox" name="showHeading" ${settings.showHeading !== false ? 'checked' : ''}> Show group heading</label><label class="checkbox-row"><input type="checkbox" name="containerStyle" ${settings.containerStyle !== false ? 'checked' : ''}> Show group card background and border</label><label class="checkbox-row"><input type="checkbox" name="layoutLocked" ${settings.layoutLocked ? 'checked' : ''}> Lock child order and layout</label>${containerItemOptions(item)}`;
    } else if (type === 'scene_routine') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title || 'Scenes & routines')}"></div><div class="field"><label>Columns</label><select class="settings-input" name="columns">${[1,2,3,4].map((value)=>`<option value="${value}" ${Number(settings.columns||2)===value?'selected':''}>${value}</option>`).join('')}</select></div><label class="checkbox-row"><input type="checkbox" name="showLastRun" ${settings.showLastRun!==false?'checked':''}> Show last-run time</label><label class="checkbox-row"><input type="checkbox" name="showState" ${settings.showState!==false?'checked':''}> Show source state</label><section class="settings-section"><div class="settings-section-heading"><div><h3>Routine actions</h3><p class="muted">Each action runs a command exposed by an entity.</p></div><button type="button" class="pill-button" data-action="routine-action-add">${materialSymbol('add',18)} Add action</button></div><div data-routine-action-list>${(settings.routineActions||[]).map((action,index)=>routineActionEditorRow(action,index)).join('')}</div></section>`;
    } else if (type === 'entity_table') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title||'Entities')}"></div>${entitySelect('entityIds',settings.entityIds,'Entities',null,true)}<div class="field-row"><div class="field"><label>Attribute</label><input class="settings-input" name="attribute" value="${escapeHtml(settings.attribute||'')}" placeholder="Leave empty for state"></div><div class="field"><label>Sort by</label><select class="settings-input" name="sortBy">${[['name','Name'],['state','State/value'],['changed','Last changed']].map(([v,l])=>`<option value="${v}" ${settings.sortBy===v?'selected':''}>${l}</option>`).join('')}</select></div></div><div class="field-row"><div class="field"><label>Sort direction</label><select class="settings-input" name="sortDirection"><option value="asc" ${settings.sortDirection!=='desc'?'selected':''}>Ascending</option><option value="desc" ${settings.sortDirection==='desc'?'selected':''}>Descending</option></select></div><div class="field"><label>Group by</label><select class="settings-input" name="groupBy">${[['none','No grouping'],['type','Entity type'],['device_class','Device class'],['state','State']].map(([v,l])=>`<option value="${v}" ${settings.groupBy===v?'selected':''}>${l}</option>`).join('')}</select></div></div><div class="field"><label>Filter</label><input class="settings-input" name="filter" value="${escapeHtml(settings.filter||'')}" placeholder="Name, entity ID or state"></div><label class="checkbox-row"><input type="checkbox" name="showIcon" ${settings.showIcon!==false?'checked':''}> Show icons</label><label class="checkbox-row"><input type="checkbox" name="showState" ${settings.showState!==false?'checked':''}> Show state/value</label><label class="checkbox-row"><input type="checkbox" name="showLastChanged" ${settings.showLastChanged!==false?'checked':''}> Show last changed</label><label class="checkbox-row"><input type="checkbox" name="compact" ${settings.compact?'checked':''}> Compact rows</label>`;
    } else if (type === 'counter_statistics') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title||'Statistic')}"></div>${entitySelect('entityIds',settings.entityIds,'Data sources',null,true)}<div class="field-row"><div class="field"><label>Operation</label><select class="settings-input" name="operation">${[['count_matching','Count matching'],['percent_matching','Percentage matching'],['sum','Sum'],['average','Average'],['min','Minimum'],['max','Maximum']].map(([v,l])=>`<option value="${v}" ${settings.operation===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="field"><label>Attribute</label><input class="settings-input" name="attribute" value="${escapeHtml(settings.attribute||'')}" placeholder="State"></div></div><div class="field-row"><div class="field"><label>Match operator</label><select class="settings-input" name="operator">${conditionOperatorOptions(settings.operator)}</select></div><div class="field"><label>Comparison value</label><input class="settings-input" name="compareValue" value="${escapeHtml(settings.compareValue??'on')}"></div></div><div class="field-row"><div class="field"><label>Decimals</label><input class="settings-input" type="number" min="0" max="4" name="decimals" value="${escapeHtml(settings.decimals||0)}"></div><div class="field"><label>Unit</label><input class="settings-input" name="unit" value="${escapeHtml(settings.unit||'')}"></div></div><label class="checkbox-row"><input type="checkbox" name="showBreakdown" ${settings.showBreakdown!==false?'checked':''}> Show source breakdown</label>`;
    } else if (type === 'entity_template') {
      body = `${catalogEntitySelect('entityId',settings.entityId,'Default entity (optional)')}${templateElementsEditor(settings)}`;
    } else if (type === 'timer_countdown') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title||'Timer')}"></div><div class="field"><label>Mode</label><select class="settings-input" name="mode"><option value="countdown" ${settings.mode!=='stopwatch'?'selected':''}>Countdown</option><option value="stopwatch" ${settings.mode==='stopwatch'?'selected':''}>Stopwatch</option></select></div><div data-countdown-only ${settings.mode==='stopwatch'?'hidden':''}><div class="field"><label>Countdown duration in seconds</label><input class="settings-input" type="number" min="1" max="86400" name="durationSeconds" value="${escapeHtml(settings.durationSeconds||300)}"></div><div class="field"><label>Preset durations</label><input class="settings-input" name="presets" value="${escapeHtml(settings.presets||'60,300,600,1800')}" placeholder="60,300,600"></div><div class="field"><label>Command when countdown finishes</label><select class="settings-input" name="finishAction"><option value="">No command</option>${allCommandActions().map((command)=>{const value=encodeCommandAction(command);return `<option value="${escapeHtml(value)}" ${settings.finishAction===value?'selected':''}>${escapeHtml(command.label)}</option>`}).join('')}</select></div><label class="checkbox-row"><input type="checkbox" name="showPresets" ${settings.showPresets!==false?'checked':''}> Show presets</label><section class="settings-section timer-audio-settings"><h3>Completion sound</h3><label class="checkbox-row"><input type="checkbox" name="playFinishSound" ${settings.playFinishSound!==false?'checked':''}> Play uploaded audio when the countdown ends</label><div class="field"><label>Audio file</label><input class="settings-input" type="file" name="finishSoundFile" accept="audio/*"><small>${settings.finishSoundName?`Current file: ${escapeHtml(settings.finishSoundName)}`:'Upload MP3, WAV, OGG, M4A or another browser-supported audio file.'}</small></div><input type="hidden" name="finishSound" value="${escapeHtml(settings.finishSound||'')}"><input type="hidden" name="finishSoundName" value="${escapeHtml(settings.finishSoundName||'')}">${settings.finishSound?'<label class="checkbox-row"><input type="checkbox" name="clearFinishSound"> Remove uploaded completion sound</label>':''}</section></div><label class="checkbox-row"><input type="checkbox" name="showProgress" ${settings.showProgress!==false?'checked':''}> Show progress ring</label>`;
    } else if (type === 'room_summary') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title||'Room')}"></div><div class="field"><label>Area / room name</label><input class="settings-input" name="area" value="${escapeHtml(settings.area||'')}" placeholder="Living Room"></div><label class="checkbox-row"><input type="checkbox" name="autoDiscover" ${settings.autoDiscover!==false?'checked':''}> Automatically include entities assigned to this room</label>${entitySelect('entityIds',settings.entityIds,'Additional room entities',null,true)}${sensorSelect('temperatureEntityId',settings.temperatureEntityId,'Temperature')}${sensorSelect('humidityEntityId',settings.humidityEntityId,'Humidity')}${entitySelect('occupancyEntityId',settings.occupancyEntityId,'Occupancy entity')}${entitySelect('climateEntityId',settings.climateEntityId,'Climate entity',['climate'])}${entitySelect('mediaEntityId',settings.mediaEntityId,'Media player',['media_player'])}${entitySelect('warningEntityIds',settings.warningEntityIds,'Warning entities',null,true)}<div class="field"><label>Navigate to dashboard</label><select class="settings-input" name="navigateDashboardId"><option value="">No navigation</option>${state.config.dashboards.map((dashboard)=>`<option value="${escapeHtml(dashboard.id)}" ${settings.navigateDashboardId===dashboard.id?'selected':''}>${escapeHtml(dashboard.name)}</option>`).join('')}</select></div><div class="field"><label>Layout</label><select class="settings-input" name="layout">${[['compact','Compact'],['standard','Standard'],['detailed','Detailed']].map(([v,l])=>`<option value="${v}" ${settings.layout===v?'selected':''}>${l}</option>`).join('')}</select></div>${[['showTemperature','Temperature'],['showHumidity','Humidity'],['showLights','Lights'],['showOpenings','Openings'],['showOccupancy','Occupancy'],['showMedia','Media'],['showClimate','Climate'],['showWarnings','Warnings']].map(([key,label])=>`<label class="checkbox-row"><input type="checkbox" name="${key}" ${settings[key]!==false?'checked':''}> ${label}</label>`).join('')}`;
    } else if (type === 'history_graph') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title||'History')}"></div>${entitySelect('entityIds',settings.entityIds,'Entities (up to four)',null,true)}<div class="field"><label>Numeric attribute</label><input class="settings-input" name="attribute" value="${escapeHtml(settings.attribute||'')}" placeholder="Leave empty for value/state"></div><div class="field-row"><div class="field"><label>Chart</label><select class="settings-input" name="chartType">${[['line','Line'],['area','Area'],['bar','Bar'],['state','State timeline']].map(([v,l])=>`<option value="${v}" ${settings.chartType===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="field"><label>Range</label><select class="settings-input" name="rangeHours">${[['1','1 hour'],['6','6 hours'],['24','24 hours'],['168','7 days']].map(([v,l])=>`<option value="${v}" ${String(settings.rangeHours)===v?'selected':''}>${l}</option>`).join('')}</select></div></div><div class="field-row"><div class="field"><label>Threshold</label><input class="settings-input" type="number" step="any" name="threshold" value="${escapeHtml(settings.threshold||'')}"></div><div class="field"><label>Decimals</label><input class="settings-input" type="number" min="0" max="4" name="decimals" value="${escapeHtml(settings.decimals||1)}"></div></div><label class="checkbox-row"><input type="checkbox" name="showLegend" ${settings.showLegend!==false?'checked':''}> Show legend</label><label class="checkbox-row"><input type="checkbox" name="showStats" ${settings.showStats!==false?'checked':''}> Show min, average and max</label><label class="checkbox-row"><input type="checkbox" name="comparePrevious" ${settings.comparePrevious?'checked':''}> Compare with previous period</label><p class="muted">History is sampled and stored locally by each dashboard browser.</p>`;
    } else if (type === 'alert_center') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title||'Alerts')}"></div><div class="field"><label>Maximum alerts</label><input class="settings-input" type="number" min="1" max="50" name="maxAlerts" value="${escapeHtml(settings.maxAlerts||20)}"></div><label class="checkbox-row"><input type="checkbox" name="showEmptyState" ${settings.showEmptyState!==false?'checked':''}> Show all-clear state</label><div class="settings-info-card">${materialSymbol('settings',20)}<span>Automatic low-battery, unavailable-entity, update and dismissal settings are configured in <strong>Settings → Notifications</strong>.</span></div><section class="settings-section"><div class="settings-section-heading"><div><h3>Custom alert rules</h3></div><button type="button" class="pill-button" data-action="alert-rule-add">${materialSymbol('add',18)} Add</button></div><div data-alert-rule-list>${(settings.alertRules||[]).map(alertRuleEditorRow).join('')}</div></section>`;
    } else if (type === 'gauge') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title || 'Gauge')}"></div>${entitySelect('entityId', settings.entityId, 'Value entity')}<div class="field"><label>Attribute name</label><input class="settings-input" name="valueAttribute" value="${escapeHtml(settings.valueAttribute || '')}" placeholder="Leave empty for value/state"></div><div class="field-row"><div class="field"><label>Minimum</label><input class="settings-input" type="number" step="any" name="min" value="${escapeHtml(settings.min ?? 0)}"></div><div class="field"><label>Maximum</label><input class="settings-input" type="number" step="any" name="max" value="${escapeHtml(settings.max ?? 100)}"></div></div><div class="field-row"><div class="field"><label>Decimals</label><input class="settings-input" type="number" min="0" max="4" name="decimals" value="${escapeHtml(settings.decimals || 0)}"></div><div class="field"><label>Unit override</label><input class="settings-input" name="unit" value="${escapeHtml(settings.unit || '')}"></div></div><div class="field-row"><div class="field"><label>Gauge color</label>${renderColorPicker('color', settings.color || '#d0d0d0')}</div><div class="field"><label>Track color</label>${renderColorPicker('trackColor', settings.trackColor || '#2a2a2a')}</div></div>${[['showName','Show title'],['showValue','Show value'],['showUnit','Show unit']].map(([key,label]) => `<label class="checkbox-row"><input type="checkbox" name="${key}" ${settings[key] !== false ? 'checked' : ''}> ${label}</label>`).join('')}`;
    } else if (type === 'divider_horizontal' || type === 'divider_vertical') {
      body = `<div class="field"><label>Color</label>${renderColorPicker('color', settings.color || '#3a3a3a')}</div><div class="field"><label>Thickness</label><input class="settings-input" type="number" min="1" max="20" name="thickness" value="${escapeHtml(settings.thickness || 1)}"></div><div class="field"><label>Style</label><select class="settings-input" name="style">${['solid','dashed','dotted'].map((value) => `<option value="${value}" ${settings.style === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div><div class="field"><label>Opacity</label><input type="range" min="5" max="100" name="opacity" value="${escapeHtml(settings.opacity || 100)}"></div>`;
    } else if (['icon_button','text_button','icon_text_button'].includes(type)) {
      const actions = allCommandActions();
      const selectedAction = String(settings.commandAction || '');
      const selectedKnown = actions.some((action) => encodeCommandAction(action) === selectedAction);
      const fixedMode = type === 'icon_button' ? 'icon' : type === 'text_button' ? 'text' : type === 'icon_text_button' ? 'both' : '';
      const textFields = fixedMode === 'icon' ? `<div class="field"><label>Accessible label</label><input class="settings-input" name="label" value="${escapeHtml(settings.label || 'Command')}" placeholder="Used for the tooltip and screen readers"></div>` : `<div class="field"><label>Button label</label><input class="settings-input" name="label" value="${escapeHtml(settings.label || 'Command')}"></div><div class="field"><label>Subtitle</label><input class="settings-input" name="subtitle" value="${escapeHtml(settings.subtitle || '')}"></div>`;
      const modeField = fixedMode ? `<input type="hidden" name="displayMode" value="${fixedMode}"><div class="settings-info-card">${materialSymbol(fixedMode === 'icon' ? 'touch_app' : fixedMode === 'text' ? 'text_fields' : 'buttons_alt',20)}<span>This widget always renders as <strong>${fixedMode === 'icon' ? 'icon only' : fixedMode === 'text' ? 'text only' : 'icon and text'}</strong>. Choose its icon in the Appearance step.</span></div>` : `<div class="field"><label>Content</label><select class="settings-input" name="displayMode">${[['both','Text and icon'],['text','Text only'],['icon','Icon only']].map(([value,label]) => `<option value="${value}" ${settings.displayMode === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>`;
      const iconSizeField = type === 'icon_button' ? `<div class="field"><label>Icon size</label><input class="settings-input" type="number" min="16" max="160" name="iconSize" value="${escapeHtml(settings.iconSize || 64)}"><small>Sets the icon size in pixels while keeping it constrained inside the button.</small></div>` : '';
      body = `${textFields}${modeField}${iconSizeField}<div class="field"><label>Entity command</label><select class="settings-input" name="commandAction"><option value="">Choose a command</option>${!selectedKnown && selectedAction ? `<option value="${escapeHtml(selectedAction)}" selected>Previously configured command</option>` : ''}${actions.map((action) => { const value = encodeCommandAction(action); return `<option value="${escapeHtml(value)}" ${selectedAction === value ? 'selected' : ''}>${escapeHtml(action.label)}</option>`; }).join('')}</select></div><label class="checkbox-row"><input type="checkbox" name="confirmCommand" ${settings.confirmCommand ? 'checked' : ''}> Ask for confirmation before running</label>`;
    } else if (type === 'clock') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title || '')}"></div><div class="field"><label>Time zone</label><input class="settings-input" name="timezone" value="${escapeHtml(settings.timezone || '')}" placeholder="Europe/Berlin"><small>Leave empty to use the browser time zone.</small></div><label class="checkbox-row"><input type="checkbox" name="showDate" ${settings.showDate ? 'checked' : ''}> Show date</label><label class="checkbox-row"><input type="checkbox" name="showSeconds" ${settings.showSeconds ? 'checked' : ''}> Show seconds</label><label class="checkbox-row"><input type="checkbox" name="hour12" ${settings.hour12 ? 'checked' : ''}> Use 12-hour time</label>`;
    } else if (type === 'weather') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title || 'Weather')}"></div><div class="field"><label>Layout</label><select class="settings-input" name="layout">${[['current','Current only'],['hourly','Hourly'],['daily','Daily'],['combined','Combined']].map(([v,l])=>`<option value="${v}" ${settings.layout===v?'selected':''}>${l}</option>`).join('')}</select></div>${sensorSelect('temperatureEntityId', settings.temperatureEntityId, 'Temperature sensor')}${sensorSelect('conditionEntityId', settings.conditionEntityId, 'Condition sensor', true)}${sensorSelect('humidityEntityId', settings.humidityEntityId, 'Humidity sensor')}${sensorSelect('windEntityId', settings.windEntityId, 'Wind sensor')}${sensorSelect('precipitationEntityId', settings.precipitationEntityId, 'Rain probability sensor')}${sensorSelect('uvEntityId', settings.uvEntityId, 'UV sensor')}${sensorSelect('sunriseEntityId', settings.sunriseEntityId, 'Sunrise sensor', true)}${sensorSelect('sunsetEntityId', settings.sunsetEntityId, 'Sunset sensor', true)}${entitySelect('forecastEntityId',settings.forecastEntityId,'Forecast entity')}<div class="field-row"><div class="field"><label>Forecast attribute</label><input class="settings-input" name="forecastAttribute" value="${escapeHtml(settings.forecastAttribute||'forecast')}"></div><div class="field"><label>Forecast items</label><input class="settings-input" type="number" min="1" max="12" name="forecastLimit" value="${escapeHtml(settings.forecastLimit||6)}"></div></div>${[['showCondition','Condition'],['showHumidity','Humidity'],['showWind','Wind'],['showPrecipitation','Rain probability'],['showUv','UV'],['showSun','Sunrise and sunset'],['showForecast','Forecast']].map(([key,label])=>`<label class="checkbox-row"><input type="checkbox" name="${key}" ${settings[key]!==false?'checked':''}> ${label}</label>`).join('')}`;
    } else if (type === 'text') {
      body = `<div class="field"><label>Heading</label><input class="settings-input" name="title" value="${escapeHtml(settings.title || '')}"></div><label class="checkbox-row"><input type="checkbox" name="showHeading" ${settings.showHeading !== false ? 'checked' : ''}> Show heading</label><label class="checkbox-row"><input type="checkbox" name="dividerBelowHeading" ${settings.dividerBelowHeading ? 'checked' : ''}> Divider below heading</label><div class="field"><label>Text</label><textarea class="settings-input settings-textarea" name="body">${escapeHtml(settings.body || '')}</textarea></div><label class="checkbox-row"><input type="checkbox" name="showBody" ${settings.showBody !== false ? 'checked' : ''}> Show text</label><label class="checkbox-row"><input type="checkbox" name="dividerBelowBody" ${settings.dividerBelowBody ? 'checked' : ''}> Divider below text</label>`;
    } else if (type === 'custom_code') {
      body = `<p class="muted">This widget is controlled entirely through the advanced HTML, CSS and JavaScript fields below.</p>`;
    } else if (type === 'connection') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title || 'Remote')}"></div><label class="checkbox-row"><input type="checkbox" name="showMessage" ${settings.showMessage ? 'checked' : ''}> Show connection message</label><label class="checkbox-row"><input type="checkbox" name="showEntityCount" ${settings.showEntityCount ? 'checked' : ''}> Show entity count</label>`;
    } else if (type === 'power') {
      body = `<div class="field"><label>Title</label><input class="settings-input" name="title" value="${escapeHtml(settings.title || 'Remote power')}"></div><label class="checkbox-row"><input type="checkbox" name="showBattery" ${settings.showBattery ? 'checked' : ''}> Show battery level</label><label class="checkbox-row"><input type="checkbox" name="showCharging" ${settings.showCharging ? 'checked' : ''}> Show charging state</label>`;
    } else {
      body = '<p class="muted">Resize this spacer directly on the dashboard.</p>';
    }
    if (!['divider_horizontal','divider_vertical','spacer','custom_code'].includes(type)) body += textTemplateHelp();
    if (supportsWidgetContentAlignment(type)) body += widgetContentAlignmentField(settings);
  } else {
    const elements = itemElements(item, type);
    body = `<section class="settings-section"><h3>Labels</h3><div class="field"><label>Custom title</label><input class="settings-input" name="customTitle" value="${escapeHtml(item.settings?.customTitle || '')}" placeholder="Use entity name"></div><div class="field"><label>Custom subtitle</label><input class="settings-input" name="customSubtitle" value="${escapeHtml(item.settings?.customSubtitle || '')}" placeholder="Use live state"></div></section><section class="settings-section"><h3>Visible elements</h3><div class="element-options">${(ELEMENT_OPTIONS[type] || []).map(([key, optionLabel]) => `<label class="element-option"><input type="checkbox" name="element:${key}" ${elements[key] ? 'checked' : ''}><span>${escapeHtml(optionLabel)}</span></label>`).join('')}</div></section><section class="settings-section"><h3>Defaults</h3><label class="checkbox-row"><input type="checkbox" name="saveTypeDefault"> Use these elements as the default for new ${escapeHtml(TYPE_LABELS[type])} widgets</label><label class="checkbox-row"><input type="checkbox" name="applyToType"> Apply these elements to every ${escapeHtml(TYPE_LABELS[type])} widget on this dashboard</label></section>${textTemplateHelp()}${type === 'activity' ? mediaBrowserModalSettingsFields(item.settings || {}, { mediaEntitySelect: `${entitySelect('mediaBrowserEntityId', item.settings?.mediaBrowserEntityId || '', 'Media player used by browser', ['media_player'])}<p class="muted">When no media player is selected, the first media player referenced by the activity is used.</p>` }) : type === 'media_player' ? mediaBrowserModalSettingsFields(item.settings || {}) : ''}`;
  }

  const behavior = renderWidgetBehaviorSettings(item);
  const appearance = renderWidgetAppearanceSettings(item);
  const layoutEditor = renderWidgetLayoutSettings(item);
  const variants = responsiveEditor(item);
  const advanced = renderWidgetCodeSettings(item);
  return `<div class="modal-backdrop" data-action="close-modal"></div><section class="modal widget-settings-modal widget-editor-modal" role="dialog" aria-modal="true"><div class="modal-head"><div><div class="eyebrow">CUSTOMIZE</div><h2>${escapeHtml(label)}</h2></div><button class="icon-button" data-action="close-modal">${icon('close')}</button></div><form data-widget-settings-form data-item-id="${escapeHtml(item.id)}" data-editor-step="${escapeHtml(state.modal?.step || 'content')}"><div class="modal-body widget-editor-modal-body"><div class="widget-editor-layout"><div class="widget-editor-column"><nav class="widget-editor-flow" aria-label="Widget editor steps"><button type="button" class="active" data-action="widget-editor-step" data-widget-editor-step="content"><i>1</i><span>Content</span></button><button type="button" data-action="widget-editor-step" data-widget-editor-step="behavior"><i>2</i><span>Behavior</span></button><button type="button" data-action="widget-editor-step" data-widget-editor-step="appearance"><i>3</i><span>Appearance</span></button><button type="button" data-action="widget-editor-step" data-widget-editor-step="layout"><i>4</i><span>Layout</span></button><button type="button" data-action="widget-editor-step" data-widget-editor-step="variants"><i>5</i><span>Variants</span></button><button type="button" data-action="widget-editor-step" data-widget-editor-step="advanced"><i>6</i><span>Advanced</span></button></nav><div class="widget-editor-panels"><section class="widget-editor-panel" data-widget-editor-panel="content">${body}</section><section class="widget-editor-panel" data-widget-editor-panel="behavior" hidden>${behavior}</section><section class="widget-editor-panel" data-widget-editor-panel="appearance" hidden>${appearance}</section><section class="widget-editor-panel" data-widget-editor-panel="layout" hidden>${layoutEditor}</section><section class="widget-editor-panel" data-widget-editor-panel="variants" hidden>${variants}</section><section class="widget-editor-panel" data-widget-editor-panel="advanced" hidden>${componentReuseControls(item)}${advanced}</section></div><div class="widget-editor-step-controls"><button type="button" class="pill-button" data-action="widget-editor-previous" hidden disabled>${materialSymbol('arrow_back',18)} Back</button><button type="button" class="pill-button" data-action="widget-editor-next">Next ${materialSymbol('arrow_forward',18)}</button></div></div><aside class="widget-editor-preview-pane"><div class="widget-editor-preview-sticky"><div class="widget-editor-preview-head"><div><span>LIVE PREVIEW</span><strong>Changes update immediately</strong></div><div class="widget-preview-size-switch"><button type="button" class="active" data-action="widget-preview-size" data-size="standard" title="Standard preview">${materialSymbol('crop_landscape',18)}</button><button type="button" data-action="widget-preview-size" data-size="compact" title="Compact preview">${materialSymbol('crop_portrait',18)}</button><button type="button" data-action="widget-preview-size" data-size="wide" title="Wide preview">${materialSymbol('panorama_wide_angle',18)}</button></div></div><div class="widget-editor-preview-frame size-standard" data-widget-preview-frame><div data-widget-preview>${renderWidgetEditorPreview(structuredClone(item))}</div></div><small>The preview uses current entity data. Commands are disabled in the editor.</small></div></aside></div></div><div class="modal-actions widget-reuse-actions"><div><button type="button" class="pill-button" data-action="duplicate-widget" data-item-id="${escapeHtml(item.id)}">${materialSymbol('content_copy',17)} Duplicate</button><button type="button" class="pill-button" data-action="copy-widget-style" data-item-id="${escapeHtml(item.id)}">Copy style</button><button type="button" class="pill-button" data-action="copy-widget-actions" data-item-id="${escapeHtml(item.id)}">Copy actions</button><button type="button" class="pill-button" data-action="copy-widget-all" data-item-id="${escapeHtml(item.id)}">Copy all</button>${state.widgetClipboard ? `<button type="button" class="pill-button" data-action="paste-widget-config" data-item-id="${escapeHtml(item.id)}">Paste ${escapeHtml(state.widgetClipboard.mode)}</button>` : ''}</div><button type="button" class="pill-button" data-action="close-modal">Cancel</button><button type="submit" class="pill-button primary" data-save-widget-button>Save widget</button></div></form></section>`;
}

function updateMarquees(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') root = document;
  root.querySelectorAll('.marquee').forEach((node) => {
    const widget = node.closest('.remote-entity, .nested-widget, [data-item-id]');
    if (widget && !widget.classList.contains('text-overflow-scroll')) {
      node.classList.remove('overflowing');
      node.style.removeProperty('--marquee-distance');
      node.style.removeProperty('--marquee-duration');
      return;
    }
    const content = node.querySelector('.marquee-content');
    if (!content) return;
    content.style.transform = '';
    const overflow = Math.ceil(content.scrollWidth - node.clientWidth);
    const active = overflow > 3;
    node.classList.toggle('overflowing', active);
    if (active) {
      node.style.setProperty('--marquee-distance', `${-overflow}px`);
      node.style.setProperty('--marquee-duration', `${Math.max(6, Math.min(20, 5 + overflow / 22))}s`);
    }
  });
}

function updateLiveWidgets() {
  sampleEntityHistory();
  document.querySelectorAll('[data-local-timer-value]').forEach((node) => { const {item}=findDashboardItem(node.dataset.itemId); if(!item)return; const timer=timerState(item,item.settings); const elapsed=timerElapsed(timer); const remaining=timer.mode==='stopwatch'?elapsed:Math.max(0,timer.duration-elapsed); node.textContent=formatDuration(remaining); const ring=node.closest('.timer-progress'); if(ring){const ratio=timer.mode==='stopwatch'?0:Math.max(0,Math.min(1,1-(remaining/Math.max(1,timer.duration))));ring.style.setProperty('--timer-progress',`${ratio*360}deg`);} if(timer.mode==='countdown'&&timer.running&&remaining<=0&&!timer.finished){timer.finished=true;timer.running=false;timer.elapsed=timer.duration;persistTimer(item.id,timer);const decoded=decodeCommandAction(item.settings?.finishAction);if(decoded)executeCommand(decoded.entityId,decoded.command,decoded.params);playTimerFinishSound(item);toast(`${renderTextTemplate(item.settings?.title||'Timer',{item})} finished`);} });
  app.querySelectorAll('[data-live-clock]').forEach((node) => {
    let settings = {};
    try { settings = JSON.parse(node.dataset.clockSettings || '{}'); } catch { /* ignored */ }
    const time = node.querySelector('[data-clock-time]');
    const date = node.querySelector('[data-clock-date] .marquee-content');
    if (time) time.textContent = currentTime(settings);
    if (date) date.textContent = currentDate(settings);
  });
  app.querySelectorAll('[data-screensaver-clock]').forEach((node) => {
    const time = node.querySelector('[data-screensaver-time]');
    const date = node.querySelector('[data-screensaver-date]');
    if (time) time.textContent = currentTime({ showSeconds: false });
    if (date) date.textContent = currentDate();
  });
  app.querySelectorAll('[data-media-progress]').forEach((node) => {
    const duration = Number(node.dataset.duration || 0);
    const base = Number(node.dataset.basePosition || 0);
    const updatedAt = Date.parse(node.dataset.updatedAt || '');
    const playing = node.dataset.playing === 'true';
    const position = playing && Number.isFinite(updatedAt) ? Math.min(duration || Number.POSITIVE_INFINITY, base + Math.max(0, (Date.now() - updatedAt) / 1000)) : base;
    const percentage = duration > 0 ? Math.max(0, Math.min(100, position / duration * 100)) : 0;
    const bar = node.querySelector('i');
    if (bar) bar.style.width = `${percentage}%`;
    node.title = `${Math.round(position)} / ${Math.round(duration)} seconds`;
  });
  advanceAutoplayCarousels();
  app.querySelectorAll('[data-camera-image]').forEach((image) => {
    const seconds = Math.max(2, Number(image.dataset.refreshSeconds) || 10);
    const bucket = Math.floor(Date.now() / (seconds * 1000));
    if (image.dataset.refreshBucket !== String(bucket)) {
      image.dataset.refreshBucket = String(bucket);
      image.src = `/api/camera-image?widget=${encodeURIComponent(image.dataset.widgetId)}&t=${bucket}`;
    }
  });
}


function itemReferencesEntity(item, entityIds) {
  if (!item || !entityIds?.size) return false;
  if (item.entityId && entityIds.has(item.entityId)) return true;
  const settingsText = JSON.stringify(item.settings || {});
  for (const id of entityIds) if (settingsText.includes(id)) return true;
  if (item.kind === 'system' && item.widgetType === 'tab_container') return (item.settings?.tabs || []).some((tab) => (tab.items || []).some((child) => itemReferencesEntity(child, entityIds)));
  if (item.kind === 'system' && CONTAINER_WIDGET_TYPES.has(item.widgetType)) return (item.settings?.items || []).some((child) => itemReferencesEntity(child, entityIds));
  return false;
}

function cleanupCustomWidgetScript(itemId) {
  const cleanup = state.customScriptCleanups.get(itemId);
  if (!cleanup) return;
  try { cleanup(); } catch (error) { console.warn(`Custom widget cleanup failed for ${itemId}`, error); }
  state.customScriptCleanups.delete(itemId);
}


const RUNTIME_WIDGET_TYPES = new Set(['connection','power']);

function itemContainsCamera(item) {
  if (!item) return false;
  if (item.kind === 'system' && item.widgetType === 'camera') return true;
  if (item.kind !== 'system' || !CONTAINER_WIDGET_TYPES.has(item.widgetType)) return false;
  const groups = item.widgetType === 'tab_container' ? (item.settings?.tabs || []).map((tab) => tab.items || []) : [item.settings?.items || []];
  return groups.some((items) => items.some(itemContainsCamera));
}

function patchCameraSafeContainer(node, item, entityIds, runtime) {
  const groups = item.widgetType === 'tab_container' ? (item.settings?.tabs || []).map((tab) => tab.items || []) : [item.settings?.items || []];
  for (const children of groups) for (const child of children) {
    if (child.kind === 'system' && child.widgetType === 'camera') continue;
    const relevant = runtime ? (child.kind === 'system' ? RUNTIME_WIDGET_TYPES.has(child.widgetType) : child.entityType === 'media_player') : itemReferencesEntity(child, entityIds);
    if (!relevant) continue;
    const childNode = [...node.querySelectorAll(`[data-item-id="${CSS.escape(child.id)}"]`)].find((candidate) => candidate.closest('[data-item-id]')?.dataset.itemId === child.id);
    if (!childNode) continue;
    if (itemContainsCamera(child) && child.kind === 'system' && CONTAINER_WIDGET_TYPES.has(child.widgetType)) patchCameraSafeContainer(childNode, child, entityIds, runtime);
    else replaceNodeFromHtml(childNode, renderNestedWidget(child, { depth:Number(childNode.dataset.nestingDepth) || 1 }));
  }
}

function replaceNodeFromHtml(node, html) {
  const itemId = node?.dataset?.itemId;
  if (itemId) cleanupCustomWidgetScript(itemId);
  const template = document.createElement('template');
  template.innerHTML = localizedDashboardMarkup(String(html || '').trim());
  const replacement = template.content.firstElementChild;
  if (replacement && node?.isConnected) node.replaceWith(replacement);
  return replacement;
}

function runtimeWidgetSignature(item) {
  if (item?.kind !== 'system') return '';
  if (item.widgetType === 'connection') return JSON.stringify({
    connected: state.connected,
    message: state.connectionMessage,
    entityCount: state.entities.size,
    settings: item.settings || {}
  });
  if (item.widgetType === 'power') return JSON.stringify({
    level: runtimeBatteryLevel(),
    charging: runtimeBatteryCharging(),
    settings: item.settings || {},
    language: dashboardLocale() || 'en'
  });
  return '';
}

function patchVisibleDashboard({ entityIds = null, runtime = false } = {}) {
  if (!state.config || !app.querySelector('.remote-shell')) return;
  const dashboard = currentDashboard();
  if (!dashboard) return;
  const status = app.querySelector('.remote-statusbar');
  if (status && (runtime || entityIds)) replaceNodeFromHtml(status, renderStatusBar(dashboard));
  const columns = getColumns();
  const layout = displayLayout(dashboard.items || [], columns);
  const layoutMap = new Map(layout.map((entry) => [entry.id, entry]));
  const grid = app.querySelector('.remote-entity-grid');
  if (grid) {
    for (const item of dashboard.items || []) {
      const relevant = runtime ? (item.kind === 'system' ? RUNTIME_WIDGET_TYPES.has(item.widgetType) : item.entityType === 'media_player') : itemReferencesEntity(item, entityIds);
      if (!relevant) continue;
      const node = [...grid.children].find((candidate) => candidate.dataset?.itemId === item.id);
      const signature = runtime ? runtimeWidgetSignature(item) : '';
      if (node && signature && node.dataset.runtimeSignature === signature) continue;
      if (!node) {
        // A previously hidden widget has no DOM node: insert it when its rule becomes true.
        const markup = renderWidget(item, layoutMap.get(item.id), columns);
        if (!markup) continue;
        const template = document.createElement('template');
        template.innerHTML = localizedDashboardMarkup(markup.trim());
        const inserted = template.content.firstElementChild;
        if (!inserted) continue;
        const following = dashboard.items.slice(dashboard.items.indexOf(item) + 1)
          .map((other) => [...grid.children].find((child) => child.dataset?.itemId === other.id))
          .find(Boolean);
        if (following) grid.insertBefore(inserted, following);
        else grid.append(inserted);
        continue;
      }
      if (itemContainsCamera(item) && item.kind === 'system' && CONTAINER_WIDGET_TYPES.has(item.widgetType)) patchCameraSafeContainer(node, item, entityIds, runtime);
      else if (!(item.kind === 'system' && item.widgetType === 'camera')) {
        const markup = renderWidget(item, layoutMap.get(item.id), columns);
        if (!markup) {
          // Remove a widget that stopped matching, without rebuilding camera streams.
          cleanupCustomWidgetScript(item.id);
          node.remove();
          continue;
        }
        const replacement = replaceNodeFromHtml(node, markup);
        if (replacement && signature) replacement.dataset.runtimeSignature = signature;
      }
    }
  }
  if (state.screensaverActive && state.screensaverTrigger?.widgetId) {
    const triggeredItem = allDashboardItems().find((item) => item.id === state.screensaverTrigger.widgetId);
    const triggeredNode = app.querySelector('.screensaver-trigger-widget');
    const relevant = triggeredItem && (runtime || itemReferencesEntity(triggeredItem, entityIds));
    if (triggeredNode && relevant) replaceNodeFromHtml(triggeredNode, renderScreensaverTriggeredWidget(triggeredItem));
  }
  requestAnimationFrame(() => {
    syncDashboardGridGeometry(app);
    applyWidgetElementLayouts(app);
    updateLiveWidgets();
      updateMarquees(app);
    runCustomWidgetScripts();
    initializeMediaSwipers(app);
    initializeWidgetCarousels(app);
    applyKioskScale();
  });
}

function scheduleRuntimePatch(options = {}) {
  if (options.entityIds) {
    state._pendingEntityPatch ||= new Set();
    for (const id of options.entityIds) state._pendingEntityPatch.add(id);
  }
  state._pendingRuntimePatch ||= Boolean(options.runtime);
  cancelAnimationFrame(state.runtimePatchRaf || 0);
  state.runtimePatchRaf = requestAnimationFrame(() => {
    const ids = state._pendingEntityPatch;
    const runtime = state._pendingRuntimePatch;
    state._pendingEntityPatch = null;
    state._pendingRuntimePatch = false;
    patchVisibleDashboard({ entityIds: ids, runtime });
  });
}

function allDashboardItems() {
  const result = [];
  const visit = (items) => {
    for (const item of items || []) {
      result.push(item);
      if (item.kind === 'system' && item.widgetType === 'tab_container') for (const tab of item.settings?.tabs || []) visit(tab.items);
      else if (item.kind === 'system' && CONTAINER_WIDGET_TYPES.has(item.widgetType)) visit(item.settings?.items);
    }
  };
  for (const dashboard of state.config?.dashboards || []) visit(dashboard.items);
  return result;
}

function triggerConditionMatches(trigger) {
  const entity = state.entities.get(trigger.entityId);
  if (!entity) return false;
  const actual = conditionValue(entity);
  const expected = trigger.value;
  switch (trigger.operator) {
    case 'not_equals': return String(actual).toLowerCase() !== String(expected).toLowerCase();
    case 'greater': return Number(actual) > Number(expected);
    case 'less': return Number(actual) < Number(expected);
    case 'equals': return String(actual).toLowerCase() === String(expected).toLowerCase();
    case 'truthy': default: return ['on','true','active','open','playing','home','detected'].includes(String(actual).toLowerCase()) || actual === true;
  }
}

function clearScreensaverTrigger() {
  clearTimeout(state.screensaverTriggerTimer);
  state.screensaverTriggerTimer = null;
  state.screensaverTrigger = null;
  state.screensaverWidgetFullscreen = false;
  if (state.screensaverActive && !state.screensaverExiting) render();
}

function evaluateScreensaverTriggers(changedEntityId = '') {
  const triggers = screensaverSettings().triggers || [];
  const trigger = triggers.find((entry) => entry.entityId && (!changedEntityId || entry.entityId === changedEntityId) && entry.widgetId && triggerConditionMatches(entry));
  if (!trigger) return false;
  const widget = allDashboardItems().find((item) => item.id === trigger.widgetId);
  if (!widget) return false;
  state.screensaverTrigger = { ...trigger, widgetId: widget.id };
  state.screensaverWidgetFullscreen = false;
  beginScreensaver();
  clearTimeout(state.screensaverTriggerTimer);
  state.screensaverTriggerTimer = setTimeout(clearScreensaverTrigger, Math.max(5, Number(trigger.durationSeconds) || 30) * 1000);
  render();
  return true;
}

function setConnection(status, message) {
  state.connectionStatus = status;
  state.connectionMessage = message;
  state.connected = status === 'connected';
  scheduleRuntimePatch({ runtime: true });
}

function replaceEntities(entities) {
  state.entities = new Map((entities || []).filter((entity) => entity?.entity_id).map((entity) => [entity.entity_id, entity]));
  sampleEntityHistory(true);
}

function applyRuntime(runtime) {
  if (!runtime) return;
  const wasConnected = state.connected;
  const normalizedLevel = runtimeBatteryLevel(runtime);
  const normalizedCharging = runtimeBatteryCharging(runtime);
  state.runtime = {
    ...runtime,
    battery: {
      ...(runtime.battery && typeof runtime.battery === 'object' ? runtime.battery : {}),
      level: Number.isFinite(normalizedLevel) ? normalizedLevel : null,
      charging: normalizedCharging
    }
  };
  state.settings = { ...state.settings, ...(runtime.settings || {}), onRemote: Boolean(runtime.onRemote) };
  state.connectionStatus = runtime.connectionStatus || 'offline';
  state.connectionMessage = runtime.connectionMessage || 'Offline';
  state.connected = Boolean(runtime.connected);
  if (!wasConnected && state.connected) {
    queueMicrotask(() => {
      for (const [itemId, browser] of state.mediaBrowsers) {
        if (browser?.errorStatus !== 503) continue;
        browser.error = '';
        browser.errorStatus = 0;
        browser.loaded = false;
        loadMediaBrowser(itemId, { force: true, silent: true });
      }
    });
  }
}

async function loadServerState() {
  const [runtimeResponse, entitiesResponse] = await Promise.all([
    fetch('/api/runtime', { cache: 'no-store' }),
    fetch('/api/entities', { cache: 'no-store' })
  ]);
  if (!runtimeResponse.ok) throw new Error(`Runtime request failed (${runtimeResponse.status})`);
  if (!entitiesResponse.ok) throw new Error(`Entity request failed (${entitiesResponse.status})`);
  applyRuntime(await runtimeResponse.json());
  const entityPayload = await entitiesResponse.json();
  replaceEntities(entityPayload.entities || []);
  state.entityCatalog = Array.isArray(entityPayload.catalog) ? entityPayload.catalog : (entityPayload.entities || []).map((entity) => ({ ...entity, dashboard_supported: true }));
}

function subscribeEvents() {
  state.eventSource?.close();
  const source = new EventSource('/api/events');
  state.eventSource = source;

  source.addEventListener('snapshot', (event) => {
    const snapshot = JSON.parse(event.data);
    applyRuntime(snapshot.runtime);
    replaceEntities(snapshot.entities);
    if (Array.isArray(snapshot.catalog)) state.entityCatalog = snapshot.catalog;
    scheduleRuntimePatch({ runtime: true, entityIds: new Set((snapshot.entities || []).map((entity) => entity.entity_id).filter(Boolean)) });
  });
  source.addEventListener('runtime', (event) => {
    applyRuntime(JSON.parse(event.data));
    scheduleRuntimePatch({ runtime: true });
  });
  source.addEventListener('entities', (event) => {
    const entities = JSON.parse(event.data);
    replaceEntities(entities);
    scheduleRuntimePatch({ entityIds: new Set((entities || []).map((entity) => entity.entity_id).filter(Boolean)) });
  });
  source.addEventListener('entity_catalog', (event) => {
    try { state.entityCatalog = JSON.parse(event.data || '[]'); } catch { state.entityCatalog = []; }
    scheduleRuntimePatch({ entityIds: new Set((state.entityCatalog || []).map((entity) => entity?.entity_id).filter(Boolean)) });
    const settingsForm = modalRoot.querySelector('[data-settings-form]');
    if (settingsForm) {
      const summary = settingsForm.querySelector('.entity-access-summary');
      if (summary) {
        const supported = state.entityCatalog.filter((entity)=>entity.dashboard_supported!==false).length;
        const unsupported = state.entityCatalog.length-supported;
        summary.innerHTML = `<span>${supported} supported</span><span>${unsupported} available but unsupported</span>`;
      }
    }
  });
  source.addEventListener('entity_change', (event) => {
    const entity = JSON.parse(event.data);
    if (entity?.entity_id) { state.entities.set(entity.entity_id, entity); if(historyTrackedEntityIds().has(entity.entity_id))recordEntityHistory(entity); evaluateScreensaverTriggers(entity.entity_id); }
    scheduleRuntimePatch({ entityIds: new Set(entity?.entity_id ? [entity.entity_id] : []) });
  });
  source.addEventListener('config_changed', async (event) => {
    let change = {};
    try { change = JSON.parse(event.data || '{}'); } catch {}
    if (change.reason !== 'user_save') return;
    if (state.kioskMode) {
      window.location.reload();
      return;
    }
    if (state.editMode || editorFormModalOpen()) return;
    try {
      const activeBeforeRefresh = currentDashboard()?.id || state.viewDashboardId;
      const response = await fetch(`/api/config?revision=${encodeURIComponent(change.revision || Date.now())}`, { cache: 'no-store' });
      if (!response.ok) return;
      state.config = normalizeConfig(await response.json());
      restoreViewDashboard(activeBeforeRefresh);
      render();
    } catch {}
  });
  source.addEventListener('error', () => {
    state.connected = false;
    state.connectionStatus = 'offline';
    state.connectionMessage = 'Dashboard service unavailable';
    scheduleRuntimePatch({ runtime: true });
  });
}

function applyOptimistic(entityId, command, params = {}) {
  const entity = state.entities.get(entityId);
  if (!entity) return;
  const attrs = { ...(entity.attributes || {}) };
  switch (entity.entity_type) {
    case 'activity':
      if (command === 'start') attrs.state = 'ACTIVE';
      if (command === 'stop') attrs.state = 'INACTIVE';
      break;
    case 'button': toast(`${localName(entity.name)} pressed`); break;
    case 'light':
      if (command === 'on') attrs.state = 'ON';
      if (command === 'off') attrs.state = 'OFF';
      if (command === 'toggle') attrs.state = attrs.state === 'ON' ? 'OFF' : 'ON';
      Object.assign(attrs, params);
      break;
    case 'media_player':
      if (command === 'play_pause') attrs.state = attrs.state === 'PLAYING' ? 'PAUSED' : 'PLAYING';
      if (command === 'on') attrs.state = 'ON';
      if (command === 'off') attrs.state = 'OFF';
      if (command === 'volume') attrs.volume = Number(params.volume);
      if (command === 'mute_toggle') attrs.muted = !attrs.muted;
      break;
    case 'cover':
      if (command === 'open') Object.assign(attrs, { state: 'OPEN', position: 100 });
      if (command === 'close') Object.assign(attrs, { state: 'CLOSED', position: 0 });
      if (command === 'position') Object.assign(attrs, { position: Number(params.position), state: Number(params.position) === 0 ? 'CLOSED' : 'OPEN' });
      break;
    case 'climate':
      if (command === 'off') attrs.state = 'OFF';
      if (command === 'hvac_mode') attrs.state = params.hvac_mode;
      if (command === 'target_temperature') attrs.target_temperature = Number(params.temperature);
      break;
    case 'select':
      if (command === 'select_option') attrs.current_option = params.option;
      break;
  }
  state.entities.set(entityId, { ...entity, attributes: attrs });
  scheduleRuntimePatch({ entityIds: new Set([entityId]) });
}

async function executeCommand(entityId, command, params) {
  applyOptimistic(entityId, command, params);
  try {
    const response = await fetch('/api/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entityId, command, params })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Command failed (${response.status})`);
    }
  } catch (error) {
    toast(error.message, 'error');
    try {
      const response = await fetch('/api/entities', { cache: 'no-store' });
      if (response.ok) replaceEntities((await response.json()).entities || []);
    } catch { /* ignored */ }
    scheduleRuntimePatch({ entityIds: new Set([entityId]) });
  }
}

async function executeTemplateElementCommand(itemId, elementId, value, commandOverride = '') {
  const { item } = findDashboardItem(itemId);
  if (!item || item.widgetType !== 'entity_template') return;
  const element = templateElementById(item, elementId);
  if (!element) return;
  const entityId = String(element.entityId || item.settings?.entityId || '');
  const command = String(commandOverride || element.command || '').trim();
  if (!entityId) { toast('Choose an entity for this template element', 'error'); return; }
  if (!command) { toast('Set a command for this template element', 'error'); return; }
  await executeCommand(entityId, command, templateCommandParams(item, element, value));
}

async function forceRefreshEntities() {
  const buttons = document.querySelectorAll('[data-action="refresh-entities"]');
  buttons.forEach((button) => { button.disabled = true; button.classList.add('spinning'); });
  try {
    const response = await fetch('/api/entities/refresh', { method: 'POST', headers: { 'content-type': 'application/json' } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Entity refresh failed (${response.status})`);
    replaceEntities(payload.entities || []);
    scheduleRuntimePatch({ entityIds: new Set((payload.entities || []).map((entity) => entity.entity_id).filter(Boolean)), runtime: true });
    toast(`Entity list refreshed · ${payload.count ?? state.entities.size} available`);
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    document.querySelectorAll('[data-action="refresh-entities"]').forEach((button) => { button.disabled = false; button.classList.remove('spinning'); });
  }
}

function addEntityToDashboard(entityId) {
  const entity = state.entities.get(entityId);
  if (!currentDashboard() || !entity) return;
  beginWidgetPlacement(createEntityWidget(entity), localName(entity.name));
}

function addSystemWidget(type) {
  const definition = SYSTEM_WIDGETS[type];
  if (!definition || !currentDashboard()) return;
  beginWidgetPlacement(createSystemWidget(type), definition.label);
}


function duplicateWidget(itemId) { const {item,parentItems}=findDashboardItem(itemId); if(!item||!parentItems)return; const copy=structuredClone(item); const renew=(entry)=>{entry.id=uid('widget'); if(entry.kind==='system'&&entry.widgetType==='tab_container')for(const tab of entry.settings?.tabs||[]){tab.id=uid('tab');for(const child of tab.items||[])renew(child);} else if(entry.kind==='system'&&CONTAINER_WIDGET_TYPES.has(entry.widgetType))for(const child of entry.settings?.items||[])renew(child);}; renew(copy); copy.x=Math.min(DASHBOARD_GRID_COLUMNS-1,(Number(item.x)||0)+1); copy.y=(Number(item.y)||0)+1; parentItems.splice(parentItems.indexOf(item)+1,0,copy); persistConfig(); state.modal=null; render(); toast('Widget duplicated'); }
function copyWidgetConfiguration(itemId,mode) { const {item}=findDashboardItem(itemId); if(!item)return; const styleKeys=['showWidgetTitle','showWidgetBackground','showWidgetBorder','textOverflow','backgroundColor','borderColor','textColor','accentColor','opacity','customCss','elementLayout','stateStyles']; const payload=mode==='all'?structuredClone(item.settings):mode==='actions'?{actions:structuredClone(item.settings?.actions||{})}:Object.fromEntries(styleKeys.filter((key)=>key in (item.settings||{})).map((key)=>[key,structuredClone(item.settings[key])])); state.widgetClipboard={mode,payload}; toast(`${mode} copied`); renderModalRoot(); }
function pasteWidgetConfiguration(itemId) { const {item}=findDashboardItem(itemId); if(!item||!state.widgetClipboard)return; item.settings={...(item.settings||{}),...structuredClone(state.widgetClipboard.payload)}; persistConfig(); state.modal=null; render(); toast(`${state.widgetClipboard.mode} pasted`); }

function applyWidgetTemplate(item,template){if(!item||!template)return;const preserved={id:item.id,x:item.x,y:item.y,w:item.w,h:item.h};const copy=structuredClone(template);if(copy.kind==='system'&&CONTAINER_WIDGET_TYPES.has(copy.widgetType)){if(copy.widgetType==='tab_container')for(const tab of copy.settings?.tabs||[]){tab.id=uid('tab');for(const child of tab.items||[])renewWidgetIds(child);}else for(const child of copy.settings?.items||[])renewWidgetIds(child);}Object.assign(item,copy,preserved);}
function saveWidgetPreset(itemId,name){const {item}=findDashboardItem(itemId);if(!item||!name)return;state.config.widgetPresets.push({id:uid('preset'),name,template:widgetTemplate(item)});persistConfig();toast(`Preset “${name}” saved`);}
function applyWidgetPreset(itemId,presetId){const {item}=findDashboardItem(itemId),preset=presetById(presetId);if(!item||!preset)return;if(preset.template.kind!==item.kind||(item.kind==='system'&&preset.template.widgetType!==item.widgetType)||(item.kind==='entity'&&preset.template.entityType!==item.entityType)){toast('Preset type does not match this widget','error');return;}applyWidgetTemplate(item,preset.template);persistConfig();state.modal=null;render();toast(`Preset “${preset.name}” applied`);}
function createWidgetMaster(itemId,name){const {item}=findDashboardItem(itemId);if(!item||!name)return;const master={id:uid('component'),name,template:widgetTemplate(item),updatedAt:Date.now()};state.config.widgetMasters.push(master);item.linkedMasterId=master.id;item.linkedOverrides={entityId:item.entityId||'',settings:{customTitle:item.settings?.customTitle||'',customSubtitle:item.settings?.customSubtitle||''}};persistConfig();state.modal=null;render();toast(`Linked component “${name}” created`);}
function linkWidgetMaster(itemId,masterId){const {item}=findDashboardItem(itemId),master=componentById(masterId);if(!item||!master)return;if(master.template.kind!==item.kind||(item.kind==='system'&&master.template.widgetType!==item.widgetType)||(item.kind==='entity'&&master.template.entityType!==item.entityType)){toast('Component type does not match this widget','error');return;}item.linkedMasterId=master.id;item.linkedOverrides={entityId:item.entityId||'',settings:{customTitle:item.settings?.customTitle||'',customSubtitle:item.settings?.customSubtitle||''}};synchronizeLinkedWidgets();persistConfig();state.modal=null;render();toast(`Linked to “${master.name}”`);}
function updateWidgetMaster(itemId){const {item}=findDashboardItem(itemId),master=componentById(item?.linkedMasterId);if(!item||!master)return;master.template=widgetTemplate(item);master.updatedAt=Date.now();synchronizeLinkedWidgets();persistConfig();state.modal=null;render();toast(`Component “${master.name}” updated`);}
function detachWidgetMaster(itemId){const {item}=findDashboardItem(itemId);if(!item)return;item.linkedMasterId='';item.linkedOverrides={};persistConfig();state.modal=null;render();toast('Widget detached from component');}
function openEntityInfo(entityId) { const entity=state.entities.get(entityId); if(!entity)return; state.modal={type:'entity-info',entityId}; renderModalRoot(); }
function runRoutineAction(itemId,routineId) { const {item}=findDashboardItem(itemId); const action=item?.settings?.routineActions?.find((entry)=>entry.id===routineId); const decoded=decodeCommandAction(action?.commandAction); if(!decoded)return; const run=()=>{executeCommand(decoded.entityId,decoded.command,decoded.params); action.lastRunAt=Date.now(); persistConfig(); render();}; if(action.confirm){state.modal={type:'confirm',title:'Run routine?',message:`Run “${action.label}”?`,confirmLabel:'Run',onConfirm:run};renderModalRoot();}else run(); }
function toggleLocalTimer(itemId) { const {item}=findDashboardItem(itemId); if(!item)return; const timer=timerState(item,item.settings); if(timer.running){timer.elapsed=timerElapsed(timer);timer.startedAt=0;timer.running=false;persistTimer(itemId,timer);}else{timer.startedAt=Date.now();timer.running=true;timer.finished=false;persistTimer(itemId,timer);} render(); }
function resetLocalTimer(itemId) { const {item}=findDashboardItem(itemId); if(!item)return; const timer=timerState(item,item.settings); Object.assign(timer,{elapsed:0,startedAt:0,running:false,finished:false});persistTimer(itemId,timer);render(); }
function setLocalTimerPreset(itemId,seconds) { const {item}=findDashboardItem(itemId); if(!item)return; const timer=timerState(item,item.settings); Object.assign(timer,{duration:Math.max(1,seconds),elapsed:0,startedAt:0,running:false,finished:false});persistTimer(itemId,timer);render(); }
function toggleWidgetEntity(entityId) {
  const entity = state.entities.get(entityId);
  if (!entity) return;
  const stateValue = entityState(entity).toUpperCase();
  if (entity.entity_type === 'activity') executeCommand(entityId, stateValue === 'ACTIVE' ? 'stop' : 'start');
  else if (entity.entity_type === 'cover') executeCommand(entityId, ['OPEN','OPENING'].includes(stateValue) ? 'close' : 'open');
  else if (entity.entity_type === 'media_player') executeCommand(entityId, stateValue === 'OFF' ? 'on' : 'off');
  else executeCommand(entityId, 'toggle');
}
async function executeWidgetAction(item,slot='tap',options={}) {
  const action=normalizeWidgetActions(item.settings?.actions)[slot];
  if(action.type==='none')return;
  const run=()=>{ if(action.type==='navigate'&&action.dashboardId)switchDashboard(action.dashboardId); else if(action.type==='command'){const decoded=decodeCommandAction(action.commandAction);if(decoded)executeCommand(decoded.entityId,decoded.command,decoded.params);} else if(action.type==='toggle'&&action.entityId)toggleWidgetEntity(action.entityId); else if(action.type==='more_info'&&action.entityId)openEntityInfo(action.entityId); else if(action.type==='modal_widget'&&action.widgetId){state.modal={type:'widget-view',itemId:action.widgetId};renderModalRoot();} };
  if(action.confirmMode==='dialog'&&!options.confirmed){state.modal={type:'confirm',title:'Confirm action',message:action.confirmText||`Run ${slot} action?`,confirmLabel:'Run',onConfirm:run};renderModalRoot();}
  else if(action.confirmMode==='hold'&&!options.confirmed){toast(`Hold for ${action.holdSeconds.toFixed(1)} seconds to confirm`);}
  else run();
}

function removeWidget(itemId) {
  const { parentItems } = findDashboardItem(itemId);
  if (!parentItems) return;
  const index = parentItems.findIndex((item) => item.id === itemId);
  if (index >= 0) parentItems.splice(index, 1);
  persistConfig();
  render();
}

function moveOrResizeItem(itemId, displayPosition, columns) {
  const dashboard = currentDashboard();
  const item = dashboard.items.find((entry) => entry.id === itemId);
  if (!item) return;
  item.x = Math.max(0, Math.min(columns - 1, Math.round(displayPosition.x)));
  item.w = Math.max(1, Math.min(columns - item.x, Math.round(displayPosition.w)));
  item.y = Math.max(0, Math.round(displayPosition.y));
  item.h = Math.max(1, Math.round(displayPosition.h));
  for (const other of dashboard.items) {
    if (other.id === item.id) continue;
    if (overlaps(item, other)) other.y = item.y + item.h;
  }
  persistConfig();
  render();
}

function updateWidgetDragPreview(drag, position) {
  if (!drag?.preview || !position) return;
  drag.preview.style.gridColumn = `${position.x + 1} / span ${position.w}`;
  drag.preview.style.gridRow = `${position.y + 1} / span ${position.h}`;
  const conflict = (currentDashboard()?.items || []).some((item) => item.id !== drag.itemId && overlaps(position, item));
  drag.preview.classList.toggle('conflict', conflict);
  drag.preview.querySelector('small')?.replaceChildren(`${position.w} × ${position.h}`);
}

function startPointerInteraction(event, mode) {
  const widget = event.target.closest('[data-widget]');
  const grid = widget?.closest('[data-grid]');
  if (!widget || !grid || !state.editMode) return;
  if (mode === 'move' && event.target.closest('button,input,select,textarea,[data-resize-handle],.widget-tools')) return;
  const columns = Number(widget.dataset.columns);
  const styles = getComputedStyle(grid);
  const gap = Number.parseFloat(styles.columnGap) || 0;
  const rowHeight = Number.parseFloat(styles.gridAutoRows) || 84;
  const cellWidth = (grid.clientWidth - gap * (columns - 1)) / columns;
  const preview = document.createElement('div');
  preview.className = `widget-drag-preview ${mode === 'resize' ? 'resizing' : 'moving'}`;
  preview.setAttribute('aria-hidden', 'true');
  preview.innerHTML = `<span>${materialSymbol(mode === 'resize' ? 'aspect_ratio' : 'open_with',20)}</span><small></small>`;
  grid.append(preview);
  state.drag = { mode, pointerId: event.pointerId, widget, grid, preview, itemId: widget.dataset.itemId, columns, startX: event.clientX, startY: event.clientY, x: Number(widget.dataset.x), y: Number(widget.dataset.y), w: Number(widget.dataset.w), h: Number(widget.dataset.h), cellWidth, rowHeight, gap, current: null };
  updateWidgetDragPreview(state.drag, { x:state.drag.x, y:state.drag.y, w:state.drag.w, h:state.drag.h });
  widget.classList.add('dragging');
  grid.classList.add('drag-preview-active');
  widget.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function updatePointerInteraction(event) {
  const drag = state.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const dx = Math.round((event.clientX - drag.startX) / (drag.cellWidth + drag.gap));
  const dy = Math.round((event.clientY - drag.startY) / (drag.rowHeight + drag.gap));
  const next = drag.mode === 'resize'
    ? { x: drag.x, y: drag.y, w: Math.max(1, Math.min(drag.columns - drag.x, drag.w + dx)), h: Math.max(1, drag.h + dy) }
    : { x: Math.max(0, Math.min(drag.columns - drag.w, drag.x + dx)), y: Math.max(0, drag.y + dy), w: drag.w, h: drag.h };
  drag.current = next;
  updateWidgetDragPreview(drag, next);
  drag.widget.style.gridColumn = `${next.x + 1} / span ${next.w}`;
  drag.widget.style.gridRow = `${next.y + 1} / span ${next.h}`;
}

function endPointerInteraction(event) {
  const drag = state.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  drag.widget.classList.remove('dragging');
  drag.grid?.classList.remove('drag-preview-active');
  drag.preview?.remove();
  if (drag.current) moveOrResizeItem(drag.itemId, drag.current, drag.columns);
  state.drag = null;
}

function startPageSwipe(event) {
  if (state.editMode || (state.config?.dashboards?.length || 0) < 2 || event.target.closest('.page-dots')) return;
  const hero = event.target.closest('[data-page-swipe]');
  if (!hero) return;
  state.pageSwipe = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, hero, moved: false };
  hero.setPointerCapture?.(event.pointerId);
}

function updatePageSwipe(event) {
  const swipe = state.pageSwipe;
  if (!swipe || swipe.pointerId !== event.pointerId) return;
  const dx = event.clientX - swipe.startX;
  const dy = event.clientY - swipe.startY;
  if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
    swipe.moved = true;
    swipe.hero.style.setProperty('--swipe-x', `${Math.max(-80, Math.min(80, dx * 0.35))}px`);
    event.preventDefault();
  }
}

function endPageSwipe(event) {
  const swipe = state.pageSwipe;
  if (!swipe || swipe.pointerId !== event.pointerId) return;
  const dx = event.clientX - swipe.startX;
  const dy = event.clientY - swipe.startY;
  swipe.hero.style.removeProperty('--swipe-x');
  state.pageSwipe = null;
  if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.25) {
    state.suppressPageClickUntil = Date.now() + 450;
    switchDashboard(dx < 0 ? 1 : -1);
  }
}

function dashboardTransitionFrames(transition, phase, direction) {
  const entering = phase === 'enter';
  const x = direction * (entering ? 60 : -46);
  if (transition === 'fade') return entering ? [{opacity:0},{opacity:1}] : [{opacity:1},{opacity:0}];
  if (transition === 'scale') return entering ? [{opacity:.2,transform:'scale(.94)'},{opacity:1,transform:'scale(1)'}] : [{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(1.035)'}];
  if (transition === 'coverflow') return entering ? [{opacity:.42,transform:`perspective(1200px) translate3d(${direction*52}%,0,-220px) rotateY(${-direction*52}deg) scale(.78)`,filter:'brightness(.56)'},{opacity:1,transform:'perspective(1200px) translate3d(0,0,0) rotateY(0) scale(1)',filter:'brightness(1)'}] : [{opacity:1,transform:'perspective(1200px) translate3d(0,0,0) rotateY(0) scale(1)',filter:'brightness(1)'},{opacity:.42,transform:`perspective(1200px) translate3d(${-direction*52}%,0,-220px) rotateY(${direction*52}deg) scale(.78)`,filter:'brightness(.56)'}];
  if (transition === 'flip') return entering ? [{opacity:0,transform:`perspective(900px) rotateY(${-direction*88}deg)`},{opacity:1,transform:'perspective(900px) rotateY(0)'}] : [{opacity:1,transform:'perspective(900px) rotateY(0)'},{opacity:0,transform:`perspective(900px) rotateY(${direction*88}deg)`}];
  if (transition === 'push') return entering ? [{transform:`translateX(${direction*100}%)`},{transform:'translateX(0)'}] : [{transform:'translateX(0)'},{transform:`translateX(${-direction*35}%)`,opacity:.5}];
  if (transition === 'reveal') return entering ? [{opacity:.45,clipPath:direction > 0 ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)'},{opacity:1,clipPath:'inset(0 0 0 0)'}] : [{opacity:1,transform:'scale(1)'},{opacity:.25,transform:'scale(.975)'}];
  if (transition === 'vertical') return entering ? [{opacity:.2,transform:`translateY(${direction*52}px)`},{opacity:1,transform:'translateY(0)'}] : [{opacity:1,transform:'translateY(0)'},{opacity:0,transform:`translateY(${-direction*38}px)`}];
  return entering ? [{opacity:.28,transform:`translateX(${direction*44}px)`},{opacity:1,transform:'translateX(0)'}] : [{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-direction*34}px)`}];
}

function runCoverflowDashboardTransition(nextDashboardId, direction) {
  const viewport = app.querySelector('.remote-viewport');
  if (!viewport || !viewport.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  const rect = viewport.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const outgoing = viewport.cloneNode(true);
  captureDashboardViewState();
  freezeActiveDashboardShell();
  setViewDashboard(nextDashboardId);
  state.modal = null;
  if (!restoreFrozenDashboardShell(nextDashboardId)) render({ preserveFrozen: true });
  const liveViewport = app.querySelector('.remote-viewport');
  if (!liveViewport) return true;
  const incoming = liveViewport.cloneNode(true);
  liveViewport.style.visibility = 'hidden';
  const layer = document.createElement('div');
  layer.className = 'dashboard-coverflow-transition-layer';
  Object.assign(layer.style, { left:`${rect.left}px`, top:`${rect.top}px`, width:`${rect.width}px`, height:`${rect.height}px` });
  const wrap = (clone, className) => {
    const slide = document.createElement('div');
    slide.className = `dashboard-coverflow-transition-slide ${className}`;
    clone.style.width = '100%';
    clone.style.maxWidth = 'none';
    clone.style.height = '100%';
    clone.style.margin = '0';
    slide.append(clone);
    layer.append(slide);
    return slide;
  };
  const oldSlide = wrap(outgoing, 'is-outgoing');
  const newSlide = wrap(incoming, 'is-incoming');
  document.body.append(layer);
  const distance = Math.min(Math.max(rect.width * .5, 180), 560);
  const outgoingTransform = `translate3d(${-direction * distance}px,0,-220px) rotateY(${direction * 52}deg) scale(.78)`;
  const incomingTransform = `translate3d(${direction * distance}px,0,-220px) rotateY(${-direction * 52}deg) scale(.78)`;
  const options = { duration: 540, easing:'cubic-bezier(.22,.8,.2,1)', fill:'both' };
  const oldAnimation = oldSlide.animate([
    { offset:0, opacity:1, transform:'translate3d(0,0,0) rotateY(0deg) scale(1)', filter:'brightness(1)' },
    { offset:.82, opacity:.42, transform:outgoingTransform, filter:'brightness(.56)' },
    { offset:1, opacity:0, transform:outgoingTransform, filter:'brightness(.48)' }
  ], options);
  const newAnimation = newSlide.animate([
    { opacity:.42, transform:incomingTransform, filter:'brightness(.56)' },
    { opacity:1, transform:'translate3d(0,0,0) rotateY(0deg) scale(1)', filter:'brightness(1)' }
  ], options);
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    layer.remove();
    const current = app.querySelector('.remote-viewport');
    if (current) current.style.visibility = '';
  };
  Promise.allSettled([oldAnimation.finished, newAnimation.finished]).then(cleanup);
  setTimeout(cleanup, 720);
  return true;
}

function switchDashboard(deltaOrId) {
  const dashboards = state.config?.dashboards || [];
  if (!dashboards.length) return;
  const currentId = currentDashboard()?.id || dashboards[0].id;
  const currentIndex = Math.max(0, dashboards.findIndex((entry) => entry.id === currentId));
  const nextIndex = typeof deltaOrId === 'string' ? dashboards.findIndex((entry) => entry.id === deltaOrId) : (currentIndex + deltaOrId + dashboards.length) % dashboards.length;
  if (nextIndex < 0 || nextIndex === currentIndex) return;
  const direction = nextIndex > currentIndex || (currentIndex === dashboards.length - 1 && nextIndex === 0) ? 1 : -1;
  const transition = navigationSettings().transition;
  captureDashboardViewState();
  const viewport = app.querySelector('.remote-viewport');
  if (transition === 'coverflow' && runCoverflowDashboardTransition(dashboards[nextIndex].id, direction)) return;
  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    freezeActiveDashboardShell();
    setViewDashboard(dashboards[nextIndex].id);
    state.modal = null;
    if (!restoreFrozenDashboardShell(dashboards[nextIndex].id)) render({ preserveFrozen: true });
    const nextViewport = app.querySelector('.remote-viewport');
    if (!nextViewport || transition === 'none' || !nextViewport.animate) return;
    nextViewport.animate(dashboardTransitionFrames(transition,'enter',direction),{duration:transition === 'coverflow' || transition === 'flip' ? 430 : 320,easing:'cubic-bezier(.16,1,.3,1)'});
  };
  if (!viewport || transition === 'none' || !viewport.animate) return commit();
  const animation = viewport.animate(dashboardTransitionFrames(transition,'exit',direction),{duration:transition === 'coverflow' || transition === 'flip' ? 240 : 150,easing:'ease-in',fill:'forwards'});
  animation.addEventListener?.('finish',commit,{once:true});
  setTimeout(commit, transition === 'coverflow' || transition === 'flip' ? 300 : 210);
}


function actionNodeFromEvent(event) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  for (const node of path) {
    if (node?.nodeType === 1 && node.matches?.('[data-action]')) return node;
  }
  return event.target?.closest?.('[data-action]') || null;
}


function mediaSwiperActionFromEvent(event) {
  const actionNode = actionNodeFromEvent(event);
  if (!actionNode || !['media-browser-open', 'media-browser-play'].includes(actionNode.dataset.action)) return null;
  const swiper = actionNode.closest?.('swiper-container[data-media-swiper]');
  return swiper ? { actionNode, swiper } : null;
}

function beginMediaSwiperPointer(event) {
  if (event.button !== undefined && event.button !== 0) return;
  const match = mediaSwiperActionFromEvent(event);
  if (!match) return;
  state.mediaSwiperPointer = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startedAt: performance.now(),
    startIndex: Number(match.swiper.swiper?.activeIndex ?? -1),
    swiper: match.swiper,
    actionNode: match.actionNode
  };
}

function finishMediaSwiperPointer(event) {
  const pointer = state.mediaSwiperPointer;
  if (!pointer || pointer.pointerId !== event.pointerId) return false;
  state.mediaSwiperPointer = null;
  if (performance.now() < state.suppressMediaClickUntil) return false;
  const dx = event.clientX - pointer.startX;
  const dy = event.clientY - pointer.startY;
  const distance = Math.hypot(dx, dy);
  const elapsed = performance.now() - pointer.startedAt;
  const currentIndex = Number(pointer.swiper?.swiper?.activeIndex ?? pointer.startIndex);
  if (elapsed > 800 || distance > 24 || currentIndex !== pointer.startIndex) return false;
  // Swiper may suppress the native click even for a valid tap. Resolve short,
  // stationary pointer sequences ourselves while leaving actual swipes alone.
  state.suppressMediaClickUntil = performance.now() + 700;
  event.preventDefault();
  event.stopImmediatePropagation();
  handleActionClick(event, pointer.actionNode);
  return true;
}

function cancelMediaSwiperPointer(event) {
  if (!state.mediaSwiperPointer || (event?.pointerId !== undefined && state.mediaSwiperPointer.pointerId !== event.pointerId)) return;
  state.mediaSwiperPointer = null;
}

function handleActionClick(event, explicitActionNode = null) {
  if (event.__ucActionHandled && !explicitActionNode) return true;
  const actionNode = explicitActionNode || actionNodeFromEvent(event);
  if (!actionNode) return false;
  event.__ucActionHandled = true;
  const action = actionNode.dataset.action;
  if (action === 'toggle-edit') { state.modal = null; state.editMode = !state.editMode; if (!state.editMode) { state.editContainerId = ''; state.pendingWidgetPlacement = null; state.placementHover = null; } state.editorDirty = false; if (state.editMode) initializeHistory(); render(); }
  else if (action === 'save-dashboard') { publishEditorChanges(); }
  else if (action === 'undo-dashboard') { undoDashboardChange(); }
  else if (action === 'redo-dashboard') { redoDashboardChange(); }
  else if (action === 'open-settings') { state.backupImportCandidate = null; state.backupImportBusy = false; state.modal = { type: 'settings' }; renderModalRoot(); queueMicrotask(() => refreshUnfoldedToolsSettingsStatus()); }
  else if (action === 'export-dashboard-backup') { exportDashboardBackup(actionNode); }
  else if (action === 'import-dashboard-backup') { importDashboardBackup(actionNode.closest('[data-settings-form]'), actionNode); }
  else if (action === 'test-unfolded-tools-connection') { testUnfoldedToolsConnection(actionNode.closest('[data-settings-form]'), actionNode); }
  else if (action === 'refresh-unfolded-tools-cache') { refreshUnfoldedToolsSettingsStatus(actionNode.closest('[data-settings-form]')); }
  else if (action === 'clear-unfolded-tools-cache') { clearUnfoldedToolsCache(actionNode.closest('[data-settings-form]')); }
  else if (action === 'open-navigation-editor') { state.modal = { type: 'navigation-settings' }; renderModalRoot(); }
  else if (action === 'open-statusbar-editor') { state.modal = { type: 'statusbar-settings' }; renderModalRoot(); }
  else if (action === 'statusbar-item-left') moveStatusbarEditorItem(actionNode.closest('[data-statusbar-layout-item]'), -1);
  else if (action === 'statusbar-item-right') moveStatusbarEditorItem(actionNode.closest('[data-statusbar-layout-item]'), 1);
  else if (action === 'statusbar-item-delete') deleteStatusbarEditorItem(actionNode.closest('[data-statusbar-layout-item]'));
  else if (action === 'carousel-order-move') {
    const row = actionNode.closest('[data-carousel-order-row]');
    const direction = Number(actionNode.dataset.direction) || 0;
    if (row && direction < 0 && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
    else if (row && direction > 0 && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
    [...row?.parentElement?.children || []].forEach((entry,index)=>{ const count=entry.querySelector('small'); if(count)count.textContent=String(index+1); });
    scheduleWidgetEditorPreview(actionNode.closest('form'));
  }
  else if (action === 'template-element-add') {
    const form = actionNode.closest('form');
    const list = form?.querySelector('[data-template-element-list]');
    const type = form?.querySelector('[data-template-new-element-type]')?.value || 'text';
    if (list && list.children.length < 40) {
      list.insertAdjacentHTML('beforeend', templateElementEditor(normalizeTemplateElement({ type }, list.children.length), list.children.length));
      const row = list.lastElementChild;
      refreshTemplateElementEditor(row);
      row?.scrollIntoView?.({ block:'nearest', behavior:'smooth' });
      scheduleWidgetEditorPreview(form);
    }
  }
  else if (action === 'template-element-remove') {
    const form = actionNode.closest('form');
    actionNode.closest('[data-template-element-editor]')?.remove();
    scheduleWidgetEditorPreview(form);
  }
  else if (action === 'template-element-move') {
    const form = actionNode.closest('form');
    const row = actionNode.closest('[data-template-element-editor]');
    const direction = Number(actionNode.dataset.direction) || 0;
    if (row && direction < 0 && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling);
    else if (row && direction > 0 && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row);
    scheduleWidgetEditorPreview(form);
  }
  else if (action === 'template-command') executeTemplateElementCommand(actionNode.dataset.itemId, actionNode.dataset.templateElementId, actionNode.dataset.value || '');
  else if (action === 'template-submit-control') {
    const row = actionNode.closest('.entity-template-element');
    const input = row?.querySelector('[data-template-input-control]');
    executeTemplateElementCommand(actionNode.dataset.itemId, actionNode.dataset.templateElementId, input?.value ?? '');
  }
  else if (action === 'template-toggle-control') {
    const { item } = findDashboardItem(actionNode.dataset.itemId);
    const element = templateElementById(item, actionNode.dataset.templateElementId);
    const active = actionNode.dataset.templateActive === 'true';
    if (element) executeTemplateElementCommand(item.id, element.id, active ? element.offValue : element.onValue, active ? element.offCommand : element.onCommand);
  }
  else if (action === 'open-media-browser-modal') { const entityId = actionNode.dataset.mediaEntityId; const { item } = findDashboardItem(actionNode.closest('[data-item-id]')?.dataset.itemId || ''); openMediaBrowserModal(entityId, item?.settings || {}, actionNode.title || 'Media'); }
  else if (action === 'open-page-selector') { if (Date.now() >= state.suppressPageClickUntil) { state.modal = { type: 'page-selector' }; renderModalRoot(); } }
  else if (action === 'open-dashboard-unlock') { const dashboardId = actionNode.dataset.dashboardId || currentDashboard()?.id; state.modal = { type: 'page-pin', dashboardId }; renderModalRoot(); }
  else if (action === 'relock-current-dashboard') { const dashboard = currentDashboard(); if (dashboard?.pinHash) { markDashboardLocked(dashboard); state.modal = null; toast(`${localName(dashboard.name)} locked`); render(); } }
  else if (action === 'open-page-menu') { state.modal = { type: 'page-menu' }; renderModalRoot(); }
  else if (action === 'close-modal') { if (state.modal?.type === 'settings') { state.backupImportCandidate = null; state.backupImportBusy = false; } state.modal = state.modal?.returnModal || null; renderModalRoot(); }
  else if (action === 'request-screensaver-wake') { requestScreensaverWake(); }
  else if (action === 'cancel-screensaver-unlock') { state.screensaverUnlockPrompt = false; render(); }
  else if (action === 'toggle-screensaver-widget-fullscreen') { state.screensaverWidgetFullscreen = !state.screensaverWidgetFullscreen; state.lastActivityAt = Date.now(); render(); }
  else if (action === 'add-screensaver-trigger') { const editor = modalRoot.querySelector('[data-screensaver-trigger-editor]'); if (editor && editor.querySelectorAll('[data-screensaver-trigger-row]').length < 8) editor.insertAdjacentHTML('beforeend', screensaverTriggerRow({}, uid('trigger-row'))); else toast('A maximum of eight screensaver triggers is supported', 'error'); }
  else if (action === 'remove-screensaver-trigger') { actionNode.closest('[data-screensaver-trigger-row]')?.remove(); }
  else if (action === 'preview-screensaver') { state.modal = null; state.screensaverActive = true; state.screensaverExiting = false; state.screensaverUnlockPrompt = false; state.screensaverWidgetFullscreen = false; render(); }
  else if (action === 'select-container-tab') { const { item } = findDashboardItem(actionNode.dataset.itemId); if (item?.widgetType === 'tab_container' && item.settings?.tabs?.some((tab) => tab.id === actionNode.dataset.tabId)) { item.settings.activeTabId = actionNode.dataset.tabId; persistConfig(); render(); } }
  else if (action === 'carousel-step') { const { item } = findDashboardItem(actionNode.dataset.itemId); if (item) setCarouselIndex(item.id, carouselIndex(item, item.settings?.items?.length || 0) + Number(actionNode.dataset.step || 0)); }
  else if (action === 'carousel-select') { setCarouselIndex(actionNode.dataset.itemId, Number(actionNode.dataset.index) || 0); }
  else if (action === 'media-browser-back') { const browser = mediaBrowserEntry(actionNode.dataset.itemId); if (browser.searchResults) { browser.query = ''; browser.searchResults = null; loadMediaBrowser(actionNode.dataset.itemId, { page: 1 }); } else if (browser.path.length > 1) loadMediaBrowser(actionNode.dataset.itemId, { pathIndex: browser.path.length - 2, page: 1 }); else if (browser.path.length === 1) loadMediaBrowser(actionNode.dataset.itemId, { root: true, page: 1 }); }
  else if (action === 'media-browser-root') { loadMediaBrowser(actionNode.dataset.itemId, { root: true, page: 1 }); }
  else if (action === 'media-browser-path') { loadMediaBrowser(actionNode.dataset.itemId, { pathIndex: Number(actionNode.dataset.pathIndex), page: 1 }); }
  else if (action === 'media-browser-search') submitMediaBrowserSearch(actionNode.closest('[data-media-browser-search]'));
  else if (action === 'media-browser-reload') { const browser = mediaBrowserEntry(actionNode.dataset.itemId); browser.loaded = false; browser.error = ''; browser.errorStatus = 0; loadMediaBrowser(actionNode.dataset.itemId, { page: browser.page || 1, force: true, ...(browser.searchResults ? { searchQuery: browser.query } : {}) }); }
  else if (action === 'media-browser-clear-search') { const browser = mediaBrowserEntry(actionNode.dataset.itemId); browser.query = ''; browser.searchResults = null; loadMediaBrowser(actionNode.dataset.itemId, { page: 1 }); }
  else if (action === 'media-browser-page') { const browser = mediaBrowserEntry(actionNode.dataset.itemId); loadMediaBrowser(actionNode.dataset.itemId, { page: Math.max(1, Number(actionNode.dataset.page) || 1), ...(browser.searchResults ? { searchQuery: browser.query } : {}) }); }
  else if (action === 'media-browser-open' || action === 'media-browser-play') {
    const media = decodeMediaBrowserPayload(actionNode.dataset.mediaPayload);
    if (media && action === 'media-browser-open') loadMediaBrowser(actionNode.dataset.itemId, { pathEntry: mediaPathEntry(media), page: 1 });
    else if (media && action === 'media-browser-play') { const context = getMediaBrowserContext(actionNode.dataset.itemId); const settings = context?.settings || {}; if (settings.mediaEntityId) executeCommand(settings.mediaEntityId, 'play_media', { media_id: media.mediaId, media_type: media.mediaType, action: settings.playAction || 'PLAY_NOW' }); }
  }
  else if (action === 'open-drawer') { state.modal = null; state.drawerOpen = true; renderModalRoot(); syncDrawer(); }
  else if (action === 'close-drawer') { state.drawerOpen = false; syncDrawer(); }
  else if (action === 'cancel-widget-placement') cancelWidgetPlacement();
  else if (action === 'set-drawer-tab') { state.drawerTab = actionNode.dataset.tab; renderDrawerTabContent(); drawerRoot.querySelectorAll('[data-action="set-drawer-tab"]').forEach((button) => button.classList.toggle('active', button.dataset.tab === state.drawerTab)); }
  else if (action === 'select-dashboard') switchDashboard(actionNode.dataset.id);
  else if (action === 'refresh-entities') { forceRefreshEntities(); }
  else if (action === 'toggle-custom-color-picker') { const picker = actionNode.closest('[data-custom-color-picker]'); const popover = picker?.querySelector('[data-custom-color-popover]'); if (picker && popover) { const opening = popover.hidden; closeCustomColorPickers(opening ? picker : null); popover.hidden = !opening; actionNode.setAttribute('aria-expanded', String(opening)); if (opening) picker.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); } }
  else if (action === 'set-custom-color') { const picker = actionNode.closest('[data-custom-color-picker]'); if (picker) setCustomColorPickerValue(picker, actionNode.dataset.color || '#000000'); }
  else if (action === 'toggle-material-icon-picker') { const panel = actionNode.closest('[data-icon-choice],.field')?.querySelector('[data-material-icon-picker]'); if (panel) { panel.hidden = !panel.hidden; if (!panel.hidden) { state.materialSymbolPage = 1; loadMaterialSymbolsCatalog().then(() => updateMaterialSymbolPicker(panel)); updateMaterialSymbolPicker(panel); panel.querySelector('[data-material-icon-search]')?.focus(); } } }
  else if (action === 'open-unfolded-tools-picker') { openUnfoldedToolsIconLibrary(actionNode); }
  else if (action === 'flow-editor-step') { setFlowEditorStep(actionNode.closest('form'), actionNode.dataset.flowEditorStep); }
  else if (action === 'flow-editor-previous' || action === 'flow-editor-next') { const form = actionNode.closest('form'); const steps = flowEditorSteps(form); const current = Math.max(0, steps.indexOf(form?.dataset.editorStep || steps[0])); setFlowEditorStep(form, steps[Math.max(0, Math.min(steps.length - 1, current + (action === 'flow-editor-next' ? 1 : -1)))]); }
  else if (action === 'widget-editor-step') { setWidgetEditorStep(actionNode.closest('form'), actionNode.dataset.widgetEditorStep); }
  else if (action === 'widget-editor-previous' || action === 'widget-editor-next') { const form = actionNode.closest('form'); const steps = ['content','behavior','appearance','layout','variants','advanced']; const current = Math.max(0, steps.indexOf(form?.dataset.editorStep || 'content')); setWidgetEditorStep(form, steps[Math.max(0, Math.min(steps.length - 1, current + (action === 'widget-editor-next' ? 1 : -1)))]); }
  else if (action === 'widget-preview-size') { const form = actionNode.closest('form'); const frame = form?.querySelector('[data-widget-preview-frame]'); if (frame) { const size = ['standard','compact','wide'].includes(actionNode.dataset.size) ? actionNode.dataset.size : 'standard'; frame.classList.remove('size-standard','size-compact','size-wide'); frame.classList.add(`size-${size}`); form.querySelectorAll('[data-action="widget-preview-size"]').forEach((button) => button.classList.toggle('active', button === actionNode)); fitWidgetEditorPreview(form); } }
  else if (action === 'tab-editor-add') {
    const list = actionNode.closest('form')?.querySelector('[data-tab-editor-list]');
    if (list && list.children.length < 16) { const id = uid('tab'); list.insertAdjacentHTML('beforeend', tabEditorRow({ id, name: `Tab ${list.children.length + 1}`, icon: 'tab', color: '#d0d0d0', columns: 1, showIcon: true, showLabel: true }, list.children.length, list.children.length + 1)); syncTabEditor(actionNode.closest('form')); }
  }
  else if (action === 'tab-editor-move') { const row = actionNode.closest('[data-tab-editor-row]'); const direction = Number(actionNode.dataset.direction); if (row && direction < 0 && row.previousElementSibling) row.parentElement.insertBefore(row, row.previousElementSibling); else if (row && direction > 0 && row.nextElementSibling) row.parentElement.insertBefore(row.nextElementSibling, row); syncTabEditor(actionNode.closest('form')); }
  else if (action === 'tab-editor-remove') { const row = actionNode.closest('[data-tab-editor-row]'); if (row && row.parentElement.children.length > 1) { row.remove(); syncTabEditor(actionNode.closest('form')); } }
  else if (action === 'material-icon-page') { updateMaterialSymbolPicker(actionNode.closest('[data-material-icon-picker]') || modalRoot, Number(actionNode.dataset.page) || 1); }
  else if (action === 'select-material-icon') { const form = actionNode.closest('form'); const name = actionNode.dataset.iconName || ''; const choice = actionNode.closest('[data-icon-choice]'); if (choice) { const input = choice.querySelector('[name]'); if (input) { input.value = name; input.dispatchEvent(new Event('input',{bubbles:true})); } updateIconChoicePreview(choice); choice.querySelector('[data-material-icon-picker]')?.setAttribute('hidden',''); } else { const input = form?.querySelector('[name="materialIcon"]'); const mode = form?.querySelector('[name="iconMode"]'); if (input) input.value = name; if (mode) mode.value = 'material'; form?.querySelectorAll('[data-uploaded-icon-preview],[data-unfolded-tools-icon-preview]').forEach((node) => { node.hidden = true; }); const preview = form?.querySelector('[data-material-icon-preview]'); if (preview) { preview.hidden = false; preview.innerHTML = `<span>${materialSymbol(name, 34)}</span><span>${escapeHtml(name)}</span>`; } scheduleWidgetEditorPreview(form); } }
  else if (action === 'clear-icon-choice') { const choice = actionNode.closest('[data-icon-choice]'); const input = choice?.querySelector('[name]'); if (input) { input.value = ''; input.dispatchEvent(new Event('input',{bubbles:true})); } updateIconChoicePreview(choice); }
  else if (action === 'save-background-preset') { saveBackgroundPresetFromForm(actionNode.closest('[data-background-form]')); }
  else if (action === 'delete-background-preset') { const presetId = actionNode.dataset.presetId || ''; const saved = savedBackgroundPresetById(presetId); if (saved) { for (const dashboard of state.config.dashboards) { if (dashboardBackgroundPreset(dashboard.background) === savedBackgroundPresetKey(presetId)) dashboard.background = { preset:'custom', ...normalizeBackgroundDefinition(saved.background) }; } state.config.backgroundPresets = savedBackgroundPresets().filter((entry) => entry.id !== presetId); persistConfig(); renderModalRoot(); toast(`Deleted background preset ${saved.name}`); } }
  else if (action === 'select-layout-element') { selectLayoutEditorElement(actionNode.closest('form'), actionNode.dataset.layoutElement || '', { scroll:true }); }
  else if (action === 'reset-layout-element') { resetLayoutEditorElement(actionNode.closest('form'), actionNode.dataset.layoutElement || ''); }
  else if (action === 'request-remove-dashboard-pin') { openDashboardPinRemoval(actionNode.dataset.dashboardId || ''); }
  else if (action === 'cancel-remove-dashboard-pin') { actionNode.closest('.pin-removal-overlay')?.remove(); }
  else if (action === 'filter-entity') { state.entityFilter = actionNode.dataset.type; drawerRoot.querySelectorAll('[data-action="filter-entity"]').forEach((button) => button.classList.toggle('active', button.dataset.type === state.entityFilter)); updateEntityDrawerList(); }
  else if (action === 'add-entity') addEntityToDashboard(actionNode.dataset.entityId);
  else if (action === 'copy-entity-to-clipboard') copyEntityToDashboardClipboard(actionNode.dataset.entityId);
  else if (action === 'add-system-widget') addSystemWidget(actionNode.dataset.widgetType);
  else if (action === 'copy-dashboard-widget') copyWidgetToDashboardClipboard(actionNode.dataset.itemId);
  else if (action === 'paste-dashboard-clipboard') pasteDashboardClipboardEntry(actionNode.dataset.clipboardKind, actionNode.dataset.clipboardId);
  else if (action === 'paste-dashboard-clipboard-last') pasteLastDashboardClipboardEntry();
  else if (action === 'remove-dashboard-clipboard') removeDashboardClipboardEntry(actionNode.dataset.clipboardKind, actionNode.dataset.clipboardId);
  else if (action === 'clear-dashboard-clipboard') clearDashboardClipboard();
  else if (action === 'add-nested-entity' || action === 'add-nested-system') { const form = actionNode.closest('form'); const value = form?.querySelector(action === 'add-nested-entity' ? '[data-nested-entity-select]' : '[data-nested-system-select]')?.value || ''; const tabId = form?.querySelector('[data-nested-target-tab]')?.value || ''; addNestedWidget(actionNode.dataset.containerId, action === 'add-nested-entity' ? 'entity' : 'system', value, tabId); }
  else if (action === 'remove-widget') removeWidget(actionNode.dataset.itemId);
  else if (action === 'configure-widget') { state.modal = { type: 'widget-settings', itemId: actionNode.dataset.itemId }; renderModalRoot(); }
  else if (action === 'edit-container-contents') { state.editContainerId = actionNode.dataset.itemId || ''; state.collapsedContainers.delete(state.editContainerId); render(); }
  else if (action === 'exit-container-contents') { state.editContainerId = ''; render(); }
  else if (action === 'toggle-container-collapse') { const id=actionNode.dataset.itemId; if(state.collapsedContainers.has(id))state.collapsedContainers.delete(id);else state.collapsedContainers.add(id); render(); }
  else if (action === 'move-nested-widget') moveNestedWidget(actionNode.dataset.itemId, Number(actionNode.dataset.direction)||0);
  else if (action === 'duplicate-widget') duplicateWidget(actionNode.dataset.itemId);
  else if (action === 'copy-widget-style') copyWidgetConfiguration(actionNode.dataset.itemId,'style');
  else if (action === 'copy-widget-actions') copyWidgetConfiguration(actionNode.dataset.itemId,'actions');
  else if (action === 'copy-widget-all') copyWidgetConfiguration(actionNode.dataset.itemId,'all');
  else if (action === 'paste-widget-config') pasteWidgetConfiguration(actionNode.dataset.itemId);
  else if (action === 'save-widget-preset') { state.modal={type:'prompt',purpose:'save-widget-preset',itemId:actionNode.dataset.itemId,title:'Save widget preset',label:'Preset name',value:widgetEditorLabel(findDashboardItem(actionNode.dataset.itemId).item),returnModal:widgetEditorReturnModal(actionNode)}; renderModalRoot(); }
  else if (action === 'apply-widget-preset') { const select=actionNode.closest('.reuse-library')?.querySelector('[data-widget-preset-select]'); if(select?.value)applyWidgetPreset(actionNode.dataset.itemId,select.value); }
  else if (action === 'create-widget-master') { state.modal={type:'prompt',purpose:'create-widget-master',itemId:actionNode.dataset.itemId,title:'Create linked component',label:'Component name',value:widgetEditorLabel(findDashboardItem(actionNode.dataset.itemId).item),returnModal:widgetEditorReturnModal(actionNode)}; renderModalRoot(); }
  else if (action === 'link-widget-master') { const select=actionNode.closest('.reuse-library')?.querySelector('[data-widget-master-select]'); if(select?.value)linkWidgetMaster(actionNode.dataset.itemId,select.value); }
  else if (action === 'update-widget-master') updateWidgetMaster(actionNode.dataset.itemId);
  else if (action === 'detach-widget-master') detachWidgetMaster(actionNode.dataset.itemId);
  else if (action === 'open-status-alerts') { state.modal={type:'status-alerts'}; renderModalRoot(); }
  else if (action === 'reset-translation-dictionary') {
    const form = actionNode.closest('form');
    const code = String(form?.querySelector('[name="localizationLanguage"]')?.value || 'en');
    const textarea = form?.querySelector('[data-translation-dictionary]');
    if (textarea) { textarea.value = JSON.stringify(state.defaultDictionaries?.[code] || {}, null, 2); textarea.dispatchEvent(new Event('input',{bubbles:true})); }
  }
  else if (action === 'dismiss-alert') { dismissAlert(actionNode.dataset.alertId,actionNode.dataset.alertSignature); if(state.modal?.type==='status-alerts')renderModalRoot(); }
  else if (action === 'acknowledge-alert') { acknowledgeAlert(actionNode.dataset.alertId,notificationSettings().acknowledgeMinutes); if(state.modal?.type==='status-alerts')renderModalRoot(); }
  else if (action === 'navigate-dashboard') switchDashboard(actionNode.dataset.dashboardId);
  else if (action === 'add-condition-row') { const list=actionNode.closest('form')?.querySelector('[data-condition-list]'); if(list)list.insertAdjacentHTML('beforeend',conditionEditorRow({id:uid('condition')},list.children.length)); }
  else if (action === 'remove-condition-row') actionNode.closest('[data-condition-row]')?.remove();
  else if (action === 'add-state-style-row') { const list=actionNode.closest('form')?.querySelector('[data-state-style-list]'); if(list)list.insertAdjacentHTML('beforeend',stateStyleEditorRow({id:uid('style')},list.children.length)); }
  else if (action === 'remove-state-style-row') actionNode.closest('[data-state-style-row]')?.remove();
  else if (action === 'alert-rule-add') { const list=actionNode.closest('form')?.querySelector('[data-alert-rule-list]'); if(list)list.insertAdjacentHTML('beforeend',alertRuleEditorRow({id:uid('alert')},list.children.length)); }
  else if (action === 'alert-rule-remove') actionNode.closest('[data-alert-rule-row]')?.remove();
  else if (action === 'routine-action-add') { const list=actionNode.closest('form')?.querySelector('[data-routine-action-list]'); if(list)list.insertAdjacentHTML('beforeend',routineActionEditorRow({id:uid('routine'),label:'Action',icon:'play_arrow'},list.children.length)); }
  else if (action === 'routine-action-remove') actionNode.closest('[data-routine-action-row]')?.remove();
  else if (action === 'run-routine-action') runRoutineAction(actionNode.dataset.itemId,actionNode.dataset.routineId);
  else if (action === 'show-entity-info') openEntityInfo(actionNode.dataset.entityId);
  else if (action === 'timer-toggle') toggleLocalTimer(actionNode.dataset.itemId);
  else if (action === 'timer-reset') resetLocalTimer(actionNode.dataset.itemId);
  else if (action === 'timer-preset') setLocalTimerPreset(actionNode.dataset.itemId,Number(actionNode.dataset.seconds));
  else if (action === 'add-dashboard') { state.modal = { type: 'prompt', purpose: 'add-dashboard', title: 'New dashboard', label: 'Dashboard name', value: '' }; renderModalRoot(); }
  else if (action === 'customize-background') { state.modal = { type: 'background' }; renderModalRoot(); }
  else if (action === 'rename-dashboard') { state.modal = { type: 'prompt', purpose: 'rename-dashboard', title: 'Rename dashboard', label: 'Dashboard name', value: currentDashboard().name }; renderModalRoot(); }
  else if (action === 'delete-dashboard') {
    if (state.config.dashboards.length === 1) toast('At least one dashboard is required', 'error');
    else { state.modal = { type: 'confirm', title: 'Delete dashboard', message: `Delete “${currentDashboard().name}” and all of its widgets?`, confirmLabel: 'Delete', danger: true, onConfirm: () => { const id = currentDashboard().id; state.config.dashboards = state.config.dashboards.filter((entry) => entry.id !== id); state.config.activeDashboardId = state.config.dashboards[0].id; restoreViewDashboard(state.config.activeDashboardId); persistConfig(); render(); } }; renderModalRoot(); }
  } else if (action === 'confirm-modal') { const modal = state.modal; state.modal = null; try { modal?.onConfirm?.(); } catch (error) { toast(error.message || String(error), 'error'); } renderModalRoot(); }
  return true;
}

function handleCommandClick(event) {
  const commandNode = event.target.closest('[data-command]');
  if (commandNode) {
    let params;
    if (commandNode.dataset.commandParams) { try { params = JSON.parse(decodeURIComponent(commandNode.dataset.commandParams)); } catch {} }
    const run = () => executeCommand(commandNode.dataset.entityId, commandNode.dataset.command, params);
    if (commandNode.dataset.confirmCommand) {
      state.modal = { type: 'confirm', title: 'Run command?', message: `Run “${commandNode.dataset.confirmCommand}”?`, confirmLabel: 'Run', onConfirm: run };
      renderModalRoot();
    } else run();
    return;
  }
  const modeNode = event.target.closest('[data-climate-mode]');
  if (modeNode) { const mode = modeNode.dataset.climateMode; executeCommand(modeNode.dataset.entityId, mode === 'OFF' ? 'off' : 'hvac_mode', mode === 'OFF' ? undefined : { hvac_mode: mode }); return; }
  const tempNode = event.target.closest('[data-temp-adjust]');
  if (tempNode) { const entity = state.entities.get(tempNode.dataset.entityId); const current = Number(entity?.attributes?.target_temperature ?? 20); executeCommand(tempNode.dataset.entityId, 'target_temperature', { temperature: Number((current + Number(tempNode.dataset.tempAdjust)).toFixed(1)) }); }
}


function widgetInteractionTarget(event) { const widget=event.target.closest?.('[data-widget-interaction="true"]'); if(!widget||state.editMode||event.target.closest('button,input,select,textarea,a,[data-action],[data-command],[data-resize-handle],.widget-tools'))return null; return findDashboardItem(widget.dataset.itemId).item; }
function beginWidgetPress(event) {
  const item=widgetInteractionTarget(event); if(!item)return;
  const actions=normalizeWidgetActions(item.settings?.actions);
  const holdToConfirmSlot = ['tap','double','hold'].find((slot)=>actions[slot].type!=='none'&&actions[slot].confirmMode==='hold');
  const slot = holdToConfirmSlot || (actions.hold.type!=='none' ? 'hold' : '');
  state.widgetPress={pointerId:event.pointerId,itemId:item.id,startX:event.clientX,startY:event.clientY,startedAt:performance.now(),holdTimer:null,held:false,slot};
  if(slot){ const action=actions[slot]; const wait=action.confirmMode==='hold'?action.holdSeconds*1000:650; state.widgetPress.holdTimer=setTimeout(()=>{const press=state.widgetPress;if(!press||press.itemId!==item.id)return;press.held=true;state.suppressWidgetClickItemId=item.id;state.suppressWidgetClickUntil=performance.now()+500;executeWidgetAction(item,slot,{confirmed:true});},wait); }
}
function endWidgetPress(event) { const press=state.widgetPress;if(!press||press.pointerId!==event.pointerId)return;clearTimeout(press.holdTimer);state.widgetPress=null; }
function moveWidgetPress(event) { const press=state.widgetPress;if(!press||press.pointerId!==event.pointerId)return;if(Math.hypot(event.clientX-press.startX,event.clientY-press.startY)>14)endWidgetPress(event); }

document.addEventListener('click', (event) => {
  const actionNode = actionNodeFromEvent(event);
  if (!actionNode || !String(actionNode.dataset.action || '').startsWith('media-browser-')) return;
  event.preventDefault();
  if (performance.now() < state.suppressMediaClickUntil && ['media-browser-open', 'media-browser-play'].includes(actionNode.dataset.action)) {
    event.stopImmediatePropagation();
    return;
  }
  handleActionClick(event, actionNode);
}, true);

document.addEventListener('click', (event) => {
  if (!event.target.closest?.('[data-custom-color-picker]')) closeCustomColorPickers();
}, true);

app.addEventListener('click', (event) => {
  if (state.pendingWidgetPlacement && event.target.closest('[data-grid]') && !event.target.closest('[data-widget],[data-action]')) {
    const candidate = placementCandidateFromPointer(event.target.closest('[data-grid]'), event);
    if (candidate) commitWidgetPlacement(candidate);
    return;
  }
  if (handleActionClick(event)) return;
  const item=widgetInteractionTarget(event);
  if(item){
    if(state.suppressWidgetClickItemId===item.id&&performance.now()<state.suppressWidgetClickUntil)return;
    const actions=normalizeWidgetActions(item.settings?.actions);
    if(actions.tap.type==='none'){handleCommandClick(event);return;}
    const existing=state.widgetTapTimers.get(item.id); if(existing)clearTimeout(existing);
    const timer=setTimeout(()=>{state.widgetTapTimers.delete(item.id);executeWidgetAction(item,'tap');},220);
    state.widgetTapTimers.set(item.id,timer); return;
  }
  handleCommandClick(event);
});
app.addEventListener('dblclick', (event) => {
  const item=widgetInteractionTarget(event); if(!item)return;
  event.preventDefault(); const timer=state.widgetTapTimers.get(item.id); if(timer){clearTimeout(timer);state.widgetTapTimers.delete(item.id);}
  executeWidgetAction(item,'double');
});
app.addEventListener('pointermove', (event) => {
  if (!state.pendingWidgetPlacement) return;
  const grid = event.target.closest?.('[data-grid]');
  if (grid) updatePlacementGhost(placementCandidateFromPointer(grid, event));
});
app.addEventListener('pointerdown', beginWidgetPress, true);
window.addEventListener('pointermove', moveWidgetPress, true);
window.addEventListener('pointerup', endWidgetPress, true);
window.addEventListener('pointercancel', endWidgetPress, true);


let carouselOrderDrag = null;
modalRoot.addEventListener('dragstart', (event) => {
  const row = event.target.closest?.('[data-carousel-order-row]');
  if (!row) return;
  carouselOrderDrag = row;
  row.classList.add('dragging');
  if (event.dataTransfer) { event.dataTransfer.effectAllowed='move'; event.dataTransfer.setData('text/plain', row.dataset.itemId || ''); }
});
modalRoot.addEventListener('dragover', (event) => {
  const row = event.target.closest?.('[data-carousel-order-row]');
  if (!carouselOrderDrag || !row || row === carouselOrderDrag) return;
  event.preventDefault();
  const rect = row.getBoundingClientRect();
  row.parentElement.insertBefore(carouselOrderDrag, event.clientY < rect.top + rect.height / 2 ? row : row.nextElementSibling);
});
modalRoot.addEventListener('drop', (event) => { if (carouselOrderDrag) { event.preventDefault(); carouselOrderDrag.classList.remove('dragging'); carouselOrderDrag=null; scheduleWidgetEditorPreview(event.target.closest('form')); } });
modalRoot.addEventListener('dragend', () => { carouselOrderDrag?.classList.remove('dragging'); carouselOrderDrag=null; });

app.addEventListener('dragstart', (event) => {
  const node=event.target.closest?.('[data-nested-widget][data-item-id]'); if(!node||!state.editMode)return;
  const found=findDashboardItem(node.dataset.itemId); if(!found.item||!found.parentItems)return;
  const path=findDashboardItemPath(found.item.id).path; const parent=path[path.length-2];
  if(parent?.settings?.layoutLocked){event.preventDefault();toast('Container layout is locked','error');return;}
  state.nestedDrag={itemId:found.item.id,parentItems:found.parentItems};
  event.dataTransfer?.setData('text/plain',found.item.id); if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
  node.classList.add('dragging');
});
app.addEventListener('dragend', (event) => { event.target.closest?.('[data-nested-widget]')?.classList.remove('dragging'); state.nestedDrag=null; });
app.addEventListener('dragover', (event) => { if(state.nestedDrag&&event.target.closest?.('[data-nested-widget][data-item-id]'))event.preventDefault(); });
app.addEventListener('drop', (event) => {
  const targetNode=event.target.closest?.('[data-nested-widget][data-item-id]'); const drag=state.nestedDrag;
  if(!drag||!targetNode)return; event.preventDefault();
  const target=findDashboardItem(targetNode.dataset.itemId); if(target.parentItems!==drag.parentItems)return;
  const from=drag.parentItems.findIndex((entry)=>entry.id===drag.itemId); const to=drag.parentItems.findIndex((entry)=>entry.id===target.item.id);
  if(from<0||to<0||from===to)return; const [moved]=drag.parentItems.splice(from,1); drag.parentItems.splice(to,0,moved); state.nestedDrag=null; persistConfig();render();
});


function updateStatusbarEditorColumnStates(formOrEditor) {
  const editor = formOrEditor?.matches?.('[data-statusbar-layout-editor]') ? formOrEditor : formOrEditor?.querySelector?.('[data-statusbar-layout-editor]');
  const form = editor?.closest('form');
  const input = form?.querySelector('[data-statusbar-column-count]');
  if (!editor || !input) return;
  const columns = Math.max(1, Math.min(24, Number(input.value) || 1));
  [...editor.querySelectorAll('[data-statusbar-layout-item]')].forEach((row,index) => {
    const active = index < columns;
    const title = row.querySelector('.statusbar-layout-item-head strong');
    if (title) title.textContent = `Column ${index + 1}`;
    row.classList.toggle('statusbar-column-inactive', !active);
    row.dataset.statusColumnActive = active ? 'true' : 'false';
  });
}

function refreshStatusbarEditorColumns(form) {
  const editor = form?.querySelector('[data-statusbar-layout-editor]');
  const input = form?.querySelector('[data-statusbar-column-count]');
  if (!editor || !input) return;
  const columns = Math.max(1, Math.min(24, Number(input.value) || 1));
  input.value = String(columns);
  const rows = [...editor.querySelectorAll('[data-statusbar-layout-item]')];
  while (rows.length < columns) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = statusBarLayoutEditorItem({ type:'empty' }, rows.length, columns);
    const row = wrapper.firstElementChild;
    editor.append(row);
    rows.push(row);
  }
  editor.style.setProperty('--editor-status-columns', String(columns));
  updateStatusbarEditorColumnStates(editor);
  updateFlowEditorPreview(form);
}

function moveStatusbarEditorItem(row, direction) {
  const editor = row?.parentElement;
  if (!editor) return;
  const sibling = direction < 0 ? row.previousElementSibling : row.nextElementSibling;
  if (!sibling) return;
  if (direction < 0) editor.insertBefore(row, sibling); else editor.insertBefore(sibling, row);
  updateStatusbarEditorColumnStates(editor);
  updateFlowEditorPreview(row.closest('form'));
}

function deleteStatusbarEditorItem(row) {
  const editor = row?.parentElement;
  const form = row?.closest('form');
  if (!editor || !form) return;
  const rows = [...editor.querySelectorAll('[data-statusbar-layout-item]')];
  if (rows.length <= 1) {
    const typeSelect = row.querySelector('[data-status-item-type]');
    if (typeSelect) typeSelect.value = 'empty';
    row.dataset.statusType = 'empty';
  } else {
    row.remove();
    const countInput = form.querySelector('[data-statusbar-column-count]');
    if (countInput) countInput.value = String(Math.max(1, Math.min(Number(countInput.value) || 1, editor.querySelectorAll('[data-statusbar-layout-item]').length)));
  }
  updateStatusbarEditorColumnStates(editor);
  updateFlowEditorPreview(form);
}

function reorderStatusbarEditorRow(dragged, target) {
  if (!target || !dragged || target === dragged || target.parentElement !== dragged.parentElement) return false;
  const editor = target.parentElement;
  const rows = [...editor.children];
  const from = rows.indexOf(dragged), to = rows.indexOf(target);
  editor.insertBefore(dragged, from < to ? target.nextElementSibling : target);
  updateStatusbarEditorColumnStates(editor);
  return true;
}

modalRoot.addEventListener('dragstart', (event) => {
  const row = event.target.closest?.('[data-statusbar-layout-item]');
  if (!row) return;
  state.statusBarDrag = row;
  row.classList.add('dragging');
  if (event.dataTransfer) { event.dataTransfer.effectAllowed='move'; event.dataTransfer.setData('text/plain',row.dataset.statusItemId||'statusbar-item'); }
});
modalRoot.addEventListener('dragend', (event) => { event.target.closest?.('[data-statusbar-layout-item]')?.classList.remove('dragging'); state.statusBarDrag=null; });
modalRoot.addEventListener('dragover', (event) => { if (state.statusBarDrag && event.target.closest?.('[data-statusbar-layout-item]')) event.preventDefault(); });
modalRoot.addEventListener('drop', (event) => {
  const target = event.target.closest?.('[data-statusbar-layout-item]');
  const dragged = state.statusBarDrag;
  if (!reorderStatusbarEditorRow(dragged, target)) return;
  event.preventDefault();
  dragged.classList.remove('dragging'); state.statusBarDrag=null;
  updateFlowEditorPreview(target.closest('form'));
});

// Android WebView and other touch browsers do not consistently emit native HTML5 drag events.
// Pointer-based reordering keeps the same drag-and-drop interaction available on Remote Two/3.
modalRoot.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest?.('.statusbar-drag-handle');
  const row = handle?.closest?.('[data-statusbar-layout-item]');
  if (!handle || !row) return;
  state.statusBarPointerDrag = { row, handle, pointerId:event.pointerId, moved:false };
  row.classList.add('dragging');
  handle.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});
modalRoot.addEventListener('pointermove', (event) => {
  const drag = state.statusBarPointerDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-statusbar-layout-item]');
  if (reorderStatusbarEditorRow(drag.row, target)) drag.moved = true;
  event.preventDefault();
});
function finishStatusbarPointerDrag(event) {
  const drag = state.statusBarPointerDrag;
  if (!drag || (event.pointerId !== undefined && drag.pointerId !== event.pointerId)) return;
  drag.handle.releasePointerCapture?.(drag.pointerId);
  drag.row.classList.remove('dragging');
  state.statusBarPointerDrag = null;
  if (drag.moved) updateFlowEditorPreview(drag.row.closest('form'));
}
modalRoot.addEventListener('pointerup', finishStatusbarPointerDrag);
modalRoot.addEventListener('pointercancel', finishStatusbarPointerDrag);

drawerRoot.addEventListener('click', handleActionClick);
modalRoot.addEventListener('click', handleActionClick);
iconLibraryRoot.addEventListener('click', (event) => {
  const action = event.target.closest('[data-unfolded-tools-action]');
  if (!action) return;
  event.preventDefault();
  const type = action.dataset.unfoldedToolsAction;
  if (type === 'close') closeUnfoldedToolsIconLibrary();
  else if (type === 'category') {
    state.unfoldedToolsPicker.category = action.dataset.category || 'apps';
    state.unfoldedToolsPicker.page = 1;
    state.unfoldedToolsPicker.query = '';
    state.unfoldedToolsPicker.icons = [];
    void loadUnfoldedToolsIcons();
  } else if (type === 'page') {
    state.unfoldedToolsPicker.page = Math.max(1, Number(action.dataset.page) || 1);
    void loadUnfoldedToolsIcons();
  } else if (type === 'retry') void loadUnfoldedToolsIcons();
  else if (type === 'select') void selectUnfoldedToolsIcon(action);
});
iconLibraryRoot.addEventListener('input', (event) => {
  if (!event.target.matches('[data-unfolded-tools-search]')) return;
  state.unfoldedToolsPicker.query = event.target.value;
  state.unfoldedToolsPicker.page = 1;
  clearTimeout(state.unfoldedToolsPicker.searchTimer);
  state.unfoldedToolsPicker.searchTimer = setTimeout(() => void loadUnfoldedToolsIcons(), 240);
});
iconLibraryRoot.addEventListener('change', (event) => {
  if (!event.target.matches('[data-unfolded-tools-country]')) return;
  state.unfoldedToolsPicker.country = event.target.value;
  state.unfoldedToolsPicker.page = 1;
  void loadUnfoldedToolsIcons();
});
drawerRoot.addEventListener('pointerdown', () => registerUserActivity({ wake:false }));
modalRoot.addEventListener('pointerdown', () => registerUserActivity({ wake:false }));
iconLibraryRoot.addEventListener('pointerdown', () => registerUserActivity({ wake:false }));

drawerRoot.addEventListener('input', (event) => {
  if (event.target.matches('[data-entity-search]')) {
    state.entitySearch = event.target.value;
    updateEntityDrawerList();
  }
});


modalRoot.addEventListener('input', (event) => {
  if (event.target.matches('[data-settings-entity-search]')) {
    const query = String(event.target.value || '').trim().toLowerCase();
    event.target.closest('form')?.querySelectorAll('[data-settings-entity-card]').forEach((card) => { card.hidden = Boolean(query) && !String(card.dataset.searchText || '').includes(query); });
  }
  const customHexInput = event.target.closest('[data-custom-color-hex]');
  if (customHexInput) {
    const raw = String(customHexInput.value || '').trim();
    if (/^#?[0-9a-f]{6}$/i.test(raw)) setCustomColorPickerValue(customHexInput.closest('[data-custom-color-picker]'), raw.startsWith('#') ? raw : `#${raw}`);
  }
  const customBrightnessInput = event.target.closest('[data-custom-color-brightness]');
  if (customBrightnessInput) {
    const picker = customBrightnessInput.closest('[data-custom-color-picker]');
    const wheel = picker?.querySelector('[data-custom-color-wheel]');
    if (picker && wheel) {
      const brightness = Math.max(0, Math.min(1, Number(customBrightnessInput.value) / 100));
      picker.dataset.brightness = String(brightness);
      const hue = Number(wheel.dataset.hue) || 0;
      const saturation = Number(wheel.dataset.saturation) || 0;
      setCustomColorPickerValue(picker, hsvToHex(hue, saturation, brightness), { hsv: { hue, saturation, value: brightness } });
    }
  }
  if (event.target.matches('[name="mode"]') && event.target.closest('[data-widget-settings-form]')) {
    const countdown = event.target.closest('form')?.querySelector('[data-countdown-only]');
    if (countdown) countdown.hidden = event.target.value === 'stopwatch';
  }
  if (event.target.matches('[data-entity-grid-row-count]')) {
    const count = Math.max(1,Math.min(6,Number(event.target.value)||1));
    event.target.closest('form')?.querySelectorAll('[data-entity-grid-row-editor]').forEach((row)=>{ row.hidden = Number(row.dataset.entityGridRowEditor) > count; });
  }
  const layoutRange = event.target.closest('.element-layout-controls input[type="range"]');
  if (layoutRange) {
    const output = layoutRange.closest('label')?.querySelector('[data-layout-range-output]');
    if (output) output.textContent = `${layoutRange.value}%`;
  }
  const iconChoice = event.target.closest('[data-icon-choice]');
  if (iconChoice) {
    updateIconChoicePreview(iconChoice);
    const dashboardCard = iconChoice.closest('[data-dashboard-access-id]');
    const dashboardPreview = dashboardCard?.querySelector('.dashboard-navigation-editor-preview');
    const iconInput = iconChoice.querySelector('[name]');
    if (dashboardPreview && iconInput) dashboardPreview.innerHTML = renderChosenIcon(iconInput.value || 'dashboard', 26, 'dashboard');
  }
  const widgetForm = event.target.closest('[data-widget-settings-form]');
  if (widgetForm) scheduleWidgetEditorPreview(widgetForm);
  if (event.target.closest('[data-media-presentation-editor]')) updateMediaPresentationEditor(event.target.closest('form') || modalRoot);
  if (event.target.closest('[data-carousel-presentation-editor]')) updateCarouselPresentationEditor(event.target.closest('form') || modalRoot);
  const backgroundForm = event.target.closest('[data-background-form]');
  if (backgroundForm) {
    makeBackgroundPresetEditable(backgroundForm, event.target);
    updateBackgroundEditor(backgroundForm, { syncSelectedDefinition: event.target.matches('[name="preset"]') });
  }
  const flowForm = event.target.closest('[data-flow-editor-form]');
  if (event.target.matches('[data-status-item-type]')) event.target.closest('[data-statusbar-layout-item]')?.setAttribute('data-status-type', event.target.value || 'empty');
  if (event.target.matches('[data-statusbar-column-count]')) refreshStatusbarEditorColumns(flowForm);
  else if (flowForm) updateFlowEditorPreview(flowForm);
  if (flowForm?.matches('[data-statusbar-form]')) refreshStatusbarConditionalSettings(flowForm);
  if (event.target.closest('[data-tab-editor-row]')) syncTabEditor(event.target.closest('form'));
  if (event.target.matches('[data-material-icon-search]')) { state.materialSymbolPage = 1; updateMaterialSymbolPicker(event.target.closest('[data-material-icon-picker]') || modalRoot); }
});

app.addEventListener('input', (event) => {
  if (event.target.matches('input[type="range"]')) {
    const input = event.target;
    const percentage = (Number(input.value) - Number(input.min || 0)) / (Number(input.max || 100) - Number(input.min || 0)) * 100;
    input.style.setProperty('--range-value', `${percentage}%`);
  }
});

app.addEventListener('change', (event) => {
  const select = event.target.closest('[data-select-entity]');
  if (select) executeCommand(select.dataset.selectEntity, 'select_option', { option: select.value });
  const range = event.target.closest('[data-range-command]');
  if (range) executeCommand(range.dataset.entityId, range.dataset.rangeCommand, { [range.dataset.rangeParam]: Number(range.value) });
  const templateSelect = event.target.closest('[data-template-select-control]');
  if (templateSelect) executeTemplateElementCommand(templateSelect.dataset.itemId, templateSelect.dataset.templateElementId, templateSelect.value);
  const templateSlider = event.target.closest('[data-template-slider-control]');
  if (templateSlider) {
    const value = Number(templateSlider.value);
    templateSlider.closest('.entity-template-control')?.querySelector('b')?.replaceChildren(String(value));
    executeTemplateElementCommand(templateSlider.dataset.itemId, templateSlider.dataset.templateElementId, value);
  }
});


function submitMediaBrowserSearch(searchRoot) {
  if (!searchRoot?.matches?.('[data-media-browser-search]')) return false;
  const query = String(searchRoot.querySelector('[name="query"]')?.value || '').trim();
  if (!query) return true;
  loadMediaBrowser(searchRoot.dataset.itemId, { searchQuery: query, page: 1 });
  return true;
}

function handleMediaBrowserSearchSubmit(event) {
  const form = event.target.closest('form[data-media-browser-search]');
  if (!form) return false;
  event.preventDefault();
  return submitMediaBrowserSearch(form);
}

app.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-screensaver-unlock-form]');
  if (!form) return;
  event.preventDefault();
  const pin = String(new FormData(form).get('pin') || '');
  const hash = await hashPagePin(pin);
  if (hash !== String(screensaverSettings().lockPinHash || '')) { toast('Incorrect screensaver PIN', 'error'); form.querySelector('[name="pin"]')?.select(); return; }
  deactivateScreensaver();
});

app.addEventListener('submit', handleMediaBrowserSearchSubmit);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || !event.target.matches?.('[data-media-browser-search] input[name="query"]')) return;
  event.preventDefault();
  submitMediaBrowserSearch(event.target.closest('[data-media-browser-search]'));
});
modalRoot.addEventListener('change', async (event) => {
  if (event.target.matches('[data-dashboard-backup-file]')) await inspectDashboardBackupFile(event.target);
  if (event.target.matches('[data-backup-import-confirm]')) updateBackupImportControls(event.target.closest('[data-settings-form]'));
  if (event.target.matches('[data-template-element-type-select]')) refreshTemplateElementEditor(event.target.closest('[data-template-element-editor]'));
  if (event.target.matches('[data-localization-language]')) {
    const code = String(event.target.value || 'en');
    const textarea = event.target.closest('form')?.querySelector('[data-translation-dictionary]');
    const custom = state.config?.ui?.localization?.customDictionaries?.[code] || {};
    if (textarea) textarea.value = JSON.stringify({ ...(state.defaultDictionaries?.[code] || {}), ...custom }, null, 2);
  }
  if (event.target.matches('[data-status-item-type]')) event.target.closest('[data-statusbar-layout-item]')?.setAttribute('data-status-type', event.target.value || 'empty');
  const statusbarForm = event.target.closest('[data-statusbar-form]');
  if (statusbarForm) refreshStatusbarConditionalSettings(statusbarForm);
  const changedWidgetForm = event.target.closest('[data-widget-settings-form]');
  if (changedWidgetForm) scheduleWidgetEditorPreview(changedWidgetForm);
  const changedFlowForm = event.target.closest('[data-flow-editor-form]');
  if (changedFlowForm) updateFlowEditorPreview(changedFlowForm);
  if (event.target.closest('[data-carousel-presentation-editor]')) updateCarouselPresentationEditor(event.target.closest('form') || modalRoot);
  const backgroundForm = event.target.closest('[data-background-form]');
  if (backgroundForm) {
    makeBackgroundPresetEditable(backgroundForm, event.target);
    updateBackgroundEditor(backgroundForm, { syncSelectedDefinition: event.target.matches('[name="preset"]') });
  }
  if (event.target.matches('[data-generic-icon-upload]')) {
    const file = event.target.files?.[0];
    const choice = event.target.closest('[data-icon-choice]');
    if (!file || !choice) return;
    if (file.size > 2 * 1024 * 1024) { toast('Icon image must be 2 MB or smaller','error'); event.target.value=''; return; }
    const value = await fileToDataUrl(file);
    const input = choice.querySelector('[name]');
    if (input) { input.value = value; input.dispatchEvent(new Event('input',{bubbles:true})); }
    updateIconChoicePreview(choice);
    const owningWidgetForm = choice.closest('[data-widget-settings-form]');
    if (owningWidgetForm) scheduleWidgetEditorPreview(owningWidgetForm);
    const owningFlowForm = choice.closest('[data-flow-editor-form]');
    if (owningFlowForm) updateFlowEditorPreview(owningFlowForm);
    return;
  }
  const form = event.target.closest('[data-widget-settings-form]');
  if (!form) return;
  if (event.target.matches('[name="customIconFile"]')) {
    const file = event.target.files?.[0];
    if (file && file.size <= 2 * 1024 * 1024) {
      form._previewCustomIconData = await fileToDataUrl(file);
      form._previewCustomIconName = file.name;
      const mode = form.querySelector('[name="iconMode"]');
      if (mode) mode.value = 'upload';
      form.querySelectorAll('[data-material-icon-preview],[data-unfolded-tools-icon-preview]').forEach((node) => { node.hidden = true; });
      const preview = form.querySelector('[data-uploaded-icon-preview]');
      if (preview) { preview.hidden = false; preview.innerHTML = `<img src="${escapeHtml(form._previewCustomIconData)}" alt=""><span>${escapeHtml(file.name || 'Uploaded icon')}</span>`; }
    }
  }
  scheduleWidgetEditorPreview(form);
});

modalRoot.addEventListener('submit', (event) => { if (handleMediaBrowserSearchSubmit(event)) event.stopImmediatePropagation(); });

modalRoot.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (event.target.matches('[data-remove-dashboard-pin-form]')) {
    const dashboard = state.config.dashboards.find((entry) => entry.id === event.target.dataset.dashboardId);
    if (!dashboard?.pinHash) { event.target.closest('.pin-removal-overlay')?.remove(); return; }
    const pin = String(new FormData(event.target).get('pin') || '');
    const hash = await hashPagePin(pin);
    if (hash !== dashboard.pinHash) { toast('Incorrect dashboard PIN', 'error'); event.target.querySelector('[name="pin"]')?.select(); return; }
    dashboard.pinHash = '';
    dashboard.pinHint = '';
    dashboard.relockEnabled = false;
    markDashboardLocked(dashboard);
    event.target.closest('.pin-removal-overlay')?.remove();
    const card = modalRoot.querySelector(`[data-dashboard-access-id="${CSS.escape(dashboard.id)}"]`);
    if (card) {
      card.querySelector('.dashboard-pin-trash')?.remove();
      const pinInput = card.querySelector(`[name="dashboardPin:${CSS.escape(dashboard.id)}"]`);
      if (pinInput) { pinInput.value = ''; pinInput.placeholder = 'No PIN'; }
      const hintInput = card.querySelector(`[name="dashboardPinHint:${CSS.escape(dashboard.id)}"]`);
      if (hintInput) hintInput.value = '';
      const relockInput = card.querySelector(`[name="dashboardRelockEnabled:${CSS.escape(dashboard.id)}"]`);
      if (relockInput) relockInput.checked = false;
      const label = card.querySelector('.dashboard-pin-field > label');
      if (label) label.textContent = 'Optional page PIN';
      const help = card.querySelector('.dashboard-pin-field > small');
      if (help) help.textContent = 'Leave empty to keep this dashboard unlocked.';
    }
    persistConfig();
    toast(`Removed PIN lock from ${dashboard.name}`);
    updateFlowEditorPreview(modalRoot.querySelector('[data-navigation-form]'));
    return;
  }

  if (event.target.matches('[data-page-pin-form]')) {
    const dashboard = state.config.dashboards.find((entry) => entry.id === event.target.dataset.dashboardId);
    if (!dashboard) return;
    const pin = String(new FormData(event.target).get('pin') || '');
    const hash = await hashPagePin(pin);
    if (hash !== dashboard.pinHash) { toast('Incorrect page PIN', 'error'); event.target.querySelector('[name="pin"]')?.select(); return; }
    markDashboardUnlocked(dashboard);
    const targetId = dashboard.id;
    state.modal = null;
    state.pendingDashboardId = '';
    setViewDashboard(targetId);
    render();
    return;
  }

  if (event.target.matches('[data-settings-form]')) {
    const data = new FormData(event.target);
    const previousPort = Number(state.settings.dashboardPort);
    let screensaverImage = String(data.get('screensaverImage') || '').trim();
    const screensaverImageFile = data.get('screensaverImageFile');
    if (screensaverImageFile instanceof File && screensaverImageFile.size > 0) {
      if (screensaverImageFile.size > 5 * 1024 * 1024) { toast('Screensaver image must be 5 MB or smaller', 'error'); return; }
      screensaverImage = await fileToDataUrl(screensaverImageFile);
    }
    const payload = {
      dashboardPort: Number(data.get('dashboardPort') || state.settings.dashboardPort),
      reconnect: data.get('reconnect') === 'on',
      chargingGated: data.get('chargingGated') === 'on',
      logLevel: String(data.get('logLevel') || state.settings.logLevel || 'info'),
      unfoldedToolsApiKey: String(data.get('unfoldedToolsApiKey') || '').trim(),
      clearUnfoldedToolsApiKey: data.get('clearUnfoldedToolsApiKey') === 'on',
      unfoldedToolsCacheSelected: data.get('unfoldedToolsCacheSelected') === 'on',
      unfoldedToolsIncludeInBackup: data.get('unfoldedToolsIncludeInBackup') === 'on'
    };
    state.config.ui.kiosk = { scaleToFit: data.get('kioskScaleToFit') === 'on', allowUpscale: data.get('kioskAllowUpscale') === 'on', padding: Math.max(0, Math.min(80, Number(data.get('kioskPadding')) || 0)), widthMode: ['fill','center','left'].includes(String(data.get('kioskWidthMode'))) ? String(data.get('kioskWidthMode')) : 'fill' };
    const localizationLanguage = String(data.get('localizationLanguage') || 'en').toLowerCase();
    let editedDictionary = {};
    try {
      editedDictionary = JSON.parse(String(data.get('translationDictionary') || '{}'));
      if (!editedDictionary || typeof editedDictionary !== 'object' || Array.isArray(editedDictionary)) throw new Error('Dictionary must be a JSON object');
    } catch (error) {
      toast(`Translation dictionary is invalid: ${error.message}`, 'error');
      event.target.querySelector('[name="translationDictionary"]')?.focus();
      return;
    }
    const defaultsForLanguage = state.defaultDictionaries?.[localizationLanguage] || {};
    const customDictionary = {};
    for (const [key,value] of Object.entries(editedDictionary)) {
      if (typeof value !== 'string') continue;
      if (defaultsForLanguage[key] !== value || !Object.prototype.hasOwnProperty.call(defaultsForLanguage,key)) customDictionary[key] = value;
    }
    state.config.ui.localization = {
      enabled: data.get('localizationEnabled') === 'on',
      language: localizationLanguage,
      customDictionaries: { ...(state.config.ui.localization?.customDictionaries || {}), [localizationLanguage]: customDictionary }
    };
    state.config.ui.entities = {
      mode: data.get('entityAccessMode') === 'selected' ? 'selected' : 'all',
      includedIds: [...new Set(data.getAll('entityAccessId').map(String))]
    };
    state.config.ui.notifications = {
      autoLowBattery: data.get('notificationAutoLowBattery') === 'on',
      batteryThreshold: Math.max(1, Math.min(100, Number(data.get('notificationBatteryThreshold')) || 20)),
      autoUnavailable: data.get('notificationAutoUnavailable') === 'on',
      autoUpdates: data.get('notificationAutoUpdates') === 'on',
      acknowledgeMinutes: Math.max(1, Math.min(10080, Number(data.get('notificationAcknowledgeMinutes')) || 60)),
      dismissHours: Math.max(1, Math.min(8760, Number(data.get('notificationDismissHours')) || 24)),
      maxStatusAlerts: Math.max(1, Math.min(500, Number(data.get('notificationMaxStatusAlerts')) || 100))
    };
    const previousScreensaver = state.config.ui.screensaver || {};
    const lockEnabled = data.get('screensaverLockEnabled') === 'on';
    const enteredLockPin = String(data.get('screensaverLockPin') || '');
    let lockPinHash = data.get('screensaverLockPinClear') === 'on' ? '' : String(previousScreensaver.lockPinHash || '');
    if (enteredLockPin) lockPinHash = await hashPagePin(enteredLockPin);
    if (lockEnabled && !lockPinHash) { toast('Set a screensaver PIN before enabling lock mode', 'error'); event.target.querySelector('[name="screensaverLockPin"]')?.focus(); return; }
    state.config.ui.screensaver = { enabled: data.get('screensaverEnabled') === 'on', timeoutSeconds: Math.max(15, Math.min(86400, Number(data.get('screensaverTimeout')) || 300)), mode: ['clock','image','clock_image'].includes(String(data.get('screensaverMode'))) ? String(data.get('screensaverMode')) : 'clock', title: String(data.get('screensaverTitle') || ''), image: screensaverImage, imageFit: ['cover','contain','fill'].includes(String(data.get('screensaverImageFit'))) ? String(data.get('screensaverImageFit')) : 'cover', background: String(data.get('screensaverBackground') || '#000000'), foreground: String(data.get('screensaverForeground') || '#ffffff'), overlay: Math.max(0, Math.min(90, Number(data.get('screensaverOverlay')) || 0)), contentScale: Math.max(50, Math.min(180, Number(data.get('screensaverContentScale')) || 100)), clockSize: Math.max(50, Math.min(180, Number(data.get('screensaverClockSize')) || 100)), movementDuration: Math.max(30, Math.min(1800, Number(data.get('screensaverMovementDuration')) || 180)), widgetColumns: Math.max(1, Math.min(4, Number(data.get('screensaverWidgetColumns')) || 2)), showDate: data.get('screensaverShowDate') === 'on', showBattery: data.get('screensaverShowBattery') === 'on', showConnection: data.get('screensaverShowConnection') === 'on', showWakeHint: data.get('screensaverShowWakeHint') === 'on', movement: data.get('screensaverMovement') === 'on', lockEnabled, lockPinHash, lockPinHint: String(data.get('screensaverLockPinHint') || ''), triggers: screensaverTriggersFromForm(data, event.target) };
    state.lastActivityAt = Date.now();
    persistConfig();
    try {
      const response = await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Settings update failed (${response.status})`);
      const portChanged = !state.settings.environmentOverrides?.dashboardPort && Number(payload.dashboardPort) !== previousPort;
      state.modal = null;
      applyRuntime({ ...(state.runtime || {}), settings: result.settings });
      render();
      if (portChanged) {
        toast(`Dashboard is moving to port ${payload.dashboardPort}`);
        setTimeout(() => { const nextUrl = new URL(window.location.href); nextUrl.port = String(payload.dashboardPort); window.location.assign(nextUrl.toString()); }, 700);
      }
    } catch (error) { toast(error.message, 'error'); }
  }

  if (event.target.matches('[data-prompt-form]')) {
    const value = String(new FormData(event.target).get('value') || '').trim();
    if (!value) return;
    const returnModal = state.modal.returnModal || null;
    if (state.modal.purpose === 'add-dashboard') {
      const dashboard = { id: uid('dashboard'), name: value, navIcon: 'dashboard', navColor: '#d0d0d0', background: { preset: 'black', ...DASHBOARD_BACKGROUND_PRESETS.black }, items: [] };
      state.config.dashboards.push(dashboard);
      state.config.activeDashboardId = dashboard.id;
      setViewDashboard(dashboard.id);
    } else if (state.modal.purpose === 'rename-dashboard') currentDashboard().name = value;
    else if (state.modal.purpose === 'save-widget-preset') saveWidgetPreset(state.modal.itemId,value);
    else if (state.modal.purpose === 'create-widget-master') createWidgetMaster(state.modal.itemId,value);
    state.modal = returnModal;
    persistConfig();
    render(returnModal ? { preserveModal:false } : {});
  }



  if (event.target.matches('[data-navigation-form]')) {
    const data = new FormData(event.target);
    const mode = String(data.get('mode') || 'default');
    state.config.ui.navigation = {
      mode: ['default','right_cards','top_tabs','bottom_dock'].includes(mode) ? mode : 'default',
      showIcons: data.get('showIcons') === 'on',
      showLabels: data.get('showLabels') === 'on',
      cardWidth: Math.max(112, Math.min(240, Number(data.get('cardWidth')) || 152)),
      transition: ['none','fade','slide','scale','coverflow','flip','push','reveal','vertical'].includes(String(data.get('transition'))) ? String(data.get('transition')) : 'slide'
    };
    for (const dashboard of state.config.dashboards) {
      const iconName = String(data.get(`dashboardIcon:${dashboard.id}`) || 'dashboard').trim();
      dashboard.navIcon = chosenIconIsImage(iconName) || /^[a-z0-9_]+$/i.test(iconName) ? iconName : 'dashboard';
      const color = String(data.get(`dashboardColor:${dashboard.id}`) || '#d0d0d0');
      dashboard.navColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '#d0d0d0';
      dashboard.pinHint = String(data.get(`dashboardPinHint:${dashboard.id}`) || '').trim();
      dashboard.relockEnabled = data.get(`dashboardRelockEnabled:${dashboard.id}`) === 'on';
      dashboard.relockMinutes = Math.max(1, Math.min(1440, Number(data.get(`dashboardRelockMinutes:${dashboard.id}`)) || 5));
      const newPin = String(data.get(`dashboardPin:${dashboard.id}`) || '');
      if (newPin) { dashboard.pinHash = await hashPagePin(newPin); markDashboardLocked(dashboard); }
      if (dashboard.pinHash && dashboardIsUnlocked(dashboard, { schedule:false })) touchDashboardUnlock(dashboard);
    }
    state.modal = null;
    persistConfig();
    render();
  }

  if (event.target.matches('[data-statusbar-form]')) {
    const form = event.target;
    const data = new FormData(form);
    const requestedColumns = Math.max(1, Math.min(24, Number(data.get('layoutColumns')) || 1));
    const layoutItems = statusbarLayoutItemsFromForm(form).slice(0, 24);
    while (layoutItems.length < requestedColumns) layoutItems.push(normalizeStatusBarItem({ type:'empty' }, layoutItems.length));
    state.config.ui.statusBar = {
      visible: data.get('visible') === 'on', layoutColumns: requestedColumns, layoutItems, alignment: normalizeStatusBarAlignment(data.get('alignment')),
      showSeconds: data.get('showSeconds') === 'on', hour12: data.get('hour12') === 'on', timezone: String(data.get('timezone') || '').trim(), dateStyle: ['short','medium','long','full'].includes(String(data.get('dateStyle'))) ? String(data.get('dateStyle')) : 'long',
      profileText: String(data.get('profileText') || 'W').slice(0,2), indicatorStyle: data.get('indicatorStyle') === 'chips' ? 'chips' : 'plain', indicatorColor: String(data.get('indicatorColor') || '#d0d0d0'), profileBackground: String(data.get('profileBackground') || '#d0d0d0'), profileForeground: String(data.get('profileForeground') || '#000000'),
      height: Math.max(28, Math.min(96, Number(data.get('height')) || 40)), fontSize: Math.max(9, Math.min(28, Number(data.get('fontSize')) || 13)), fontWeight: Math.max(100, Math.min(900, Number(data.get('fontWeight')) || 550)), iconSize: Math.max(12, Math.min(36, Number(data.get('iconSize')) || 19)), horizontalPadding: Math.max(0, Math.min(40, Number(data.get('horizontalPadding')) || 0)), itemGap: Math.max(0, Math.min(24, Number(data.get('itemGap')) || 0)),
      radius: Math.max(0, Math.min(40, Number(data.get('radius')) || 0)), background: String(data.get('background') || '#000000'), foreground: String(data.get('foreground') || '#d0d0d0'), backgroundOpacity: Math.max(0, Math.min(100, Number(data.get('backgroundOpacity')) || 0)), blur: Math.max(0, Math.min(40, Number(data.get('blur')) || 0)), borderWidth: Math.max(0, Math.min(8, Number(data.get('borderWidth')) || 0)), borderColor: String(data.get('borderColor') || '#252525'), sticky: data.get('sticky') === 'on', shadow: data.get('shadow') === 'on', uppercase: data.get('uppercase') === 'on'
    };
    state.modal = null;
    persistConfig();
    render();
  }

  if (event.target.matches('[data-background-form]')) {
    const form = event.target;
    const data = new FormData(form);
    let background = backgroundFormValues(form);
    if (background.preset === 'custom' || background.preset.startsWith('saved:')) {
      try { background = { ...background, ...(await backgroundDefinitionWithUpload(form)) }; }
      catch (error) { toast(error.message || String(error), 'error'); return; }
    }
    currentDashboard().background = background;
    state.modal = null;
    persistConfig();
    render();
  }

  if (event.target.matches('[data-widget-settings-form]')) {
    const form = event.target;
    const saveButton = form.querySelector('[data-save-widget-button]');
    if (form.dataset.saving === 'true') return;
    form.dataset.saving = 'true';
    if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Saving…'; }
    const restoreSaveButton = () => { form.dataset.saving = 'false'; if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Save widget'; } };
    const { dashboard, item } = findDashboardItem(form.dataset.itemId);
    if (!item || !dashboard) { restoreSaveButton(); return; }
    const data = new FormData(form);
    let appearance;
    try { appearance = await widgetAppearanceFromForm(data, item.settings); }
    catch (error) { toast(error.message, 'error'); restoreSaveButton(); return; }
    if (item.kind === 'system') {
      const type = item.widgetType;
      const defaults = SYSTEM_WIDGETS[type]?.settings || {};
      const next = { ...defaults, ...item.settings };
      for (const key of Object.keys(defaults)) {
        if (key === 'items' || key === 'tabs' || key === 'activityConfigs' || key === 'activeTabId' || key === 'templateElements') continue;
        if (type === 'activity_launcher' && key === 'activityEntityIds') next[key] = data.getAll('activityEntityIds').join(',');
        else if (typeof defaults[key] === 'boolean') next[key] = data.get(key) === 'on';
        else next[key] = String(data.get(key) ?? defaults[key]);
      }
      if (type === 'activity_launcher') { next.activityConfigs = readActivityLauncherConfigs(data, item.settings?.activityConfigs); Object.assign(next, mediaBrowserModalSettingsFromForm(data)); }
      if (['conditional', 'carousel', 'entity_group'].includes(type)) next.items = updateGenericContainerFromForm(dashboard, item, data);
      if (CONTAINER_WIDGET_TYPES.has(type)) next.layoutLocked = data.get('layoutLocked') === 'on';
      if (type === 'tab_container') {
        updateTabContainerFromForm(dashboard, item, data);
        next.tabs = item.settings.tabs;
        next.activeTabId = item.settings.activeTabId;
      }
      if (type === 'media_browser' && next.mediaEntityId !== item.settings?.mediaEntityId) state.mediaBrowsers.delete(item.id);
      if (type === 'entity_group') {
        next.orientation = ['grid','horizontal','vertical'].includes(String(data.get('orientation'))) ? String(data.get('orientation')) : 'grid';
        next.wrap = data.get('wrap') === 'on';
        next.gap = String(Math.max(0, Math.min(48, Number(data.get('gap')) || 0)));
        next.padding = String(Math.max(0, Math.min(48, Number(data.get('padding')) || 0)));
      }
      if (type === 'scene_routine') next.routineActions = routineActionsFromForm(data, form);
      if (type === 'alert_center') next.alertRules = alertRulesFromForm(data, form);
      if (type === 'entity_template') {
        next.entityId = String(data.get('entityId') || '');
        next.templateColumns = String(Math.max(1, Math.min(6, Number(data.get('templateColumns')) || 2)));
        next.templateGap = String(Math.max(0, Math.min(32, Number(data.get('templateGap')) || 10)));
        next.templateElements = templateElementsFromForm(data, form, item.settings || {});
      }
      if (supportsWidgetContentAlignment(type)) next.contentAlignment = ['left','center','right'].includes(String(data.get('contentAlignment'))) ? String(data.get('contentAlignment')) : 'default';
      if (['entity_table','counter_statistics','room_summary','history_graph'].includes(type)) next.entityIds = data.getAll('entityIds').join(',');
      if (type === 'room_summary') next.warningEntityIds = data.getAll('warningEntityIds').join(',');
      Object.assign(next, appearance);
      next.actions = widgetActionsFromForm(data);
      next.conditions = conditionsFromForm(data, form);
      next.visibilityTransition = String(data.get('visibilityTransition') || 'fade');
      next.unavailableBehavior = String(data.get('unavailableBehavior') || 'dim');
      next.stateStyles = stateStylesFromForm(data, form);
      next.responsive = responsiveFromForm(data);
      next.fallback = fallbackFromForm(data);
      next.elementLayout = elementLayoutFromForm(data, item);
      if (type === 'timer_countdown') {
        const clearSound = data.get('clearFinishSound') === 'on';
        const soundFile = data.get('finishSoundFile');
        if (clearSound) { next.finishSound = ''; next.finishSoundName = ''; }
        else if (soundFile instanceof File && soundFile.size > 0) {
          if (soundFile.size > 5 * 1024 * 1024) { toast('Timer audio must be 5 MB or smaller', 'error'); restoreSaveButton(); return; }
          if (!String(soundFile.type || '').startsWith('audio/')) { toast('Choose an audio file for the timer', 'error'); restoreSaveButton(); return; }
          next.finishSound = await fileToDataUrl(soundFile);
          next.finishSoundName = String(soundFile.name || 'timer-audio').slice(0,120);
        } else {
          next.finishSound = String(data.get('finishSound') || item.settings?.finishSound || '');
          next.finishSoundName = String(data.get('finishSoundName') || item.settings?.finishSoundName || '');
        }
        next.playFinishSound = data.get('playFinishSound') === 'on';
      }
      item.settings = next;
      if (item.linkedMasterId) { const master=componentById(item.linkedMasterId); if(master){ master.template=widgetTemplate(item); master.updatedAt=Date.now(); synchronizeLinkedWidgets(); } }
    } else {
      const type = item.entityType || entityForItem(item).entity_type;
      const elements = {};
      for (const [key] of ELEMENT_OPTIONS[type] || []) elements[key] = data.get(`element:${key}`) === 'on';
      item.settings = {
        ...item.settings,
        customTitle: String(data.get('customTitle') || '').trim(),
        customSubtitle: String(data.get('customSubtitle') || '').trim(),
        mediaBrowserEntityId: type === 'activity' ? String(data.get('mediaBrowserEntityId') || '') : item.settings?.mediaBrowserEntityId || '',
        ...(['activity', 'media_player'].includes(type) ? mediaBrowserModalSettingsFromForm(data) : {}),
        elements,
        elementLayout: elementLayoutFromForm(data, item),
        entityGrid: entityGridLayoutFromForm(data, item),
        actions: widgetActionsFromForm(data),
        conditions: conditionsFromForm(data, form),
        visibilityTransition: String(data.get('visibilityTransition') || 'fade'),
        unavailableBehavior: String(data.get('unavailableBehavior') || 'dim'),
        stateStyles: stateStylesFromForm(data, form),
        responsive: responsiveFromForm(data),
        fallback: fallbackFromForm(data),
        ...appearance
      };
      if (item.linkedMasterId) { const master=componentById(item.linkedMasterId); if(master){ item.linkedOverrides={...(item.linkedOverrides||{}),entityId:item.entityId||'',settings:{...(item.linkedOverrides?.settings||{}),customTitle:item.settings.customTitle||'',customSubtitle:item.settings.customSubtitle||''}}; master.template=widgetTemplate(item); master.updatedAt=Date.now(); synchronizeLinkedWidgets(); } }
      if (data.get('saveTypeDefault') === 'on') state.config.widgetDefaults[type] = { ...elements };
      if (data.get('applyToType') === 'on') {
        for (const candidate of dashboard.items) if (candidate.kind !== 'system' && candidate.entityType === type) candidate.settings = { ...(candidate.settings || {}), elements: { ...elements } };
      }
    }
    state.modal = null;
    persistConfig();
    render();
  }
});

modalRoot.addEventListener('click', (event) => {
  const layoutElement = event.target.closest?.('[data-layout-element-key]');
  const form = layoutElement?.closest?.('[data-widget-settings-form]');
  if (!layoutElement || !form || form.dataset.editorStep !== 'layout') return;
  event.preventDefault();
  event.stopPropagation();
  selectLayoutEditorElement(form, layoutElement.dataset.layoutElementKey || '', { scroll:true });
});

app.addEventListener('error', (event) => {
  if (event.target.matches?.('[data-camera-video], [data-camera-image]')) event.target.closest('.camera-frame')?.classList.add('stream-error');
}, true);
app.addEventListener('loadeddata', (event) => {
  if (event.target.matches?.('[data-camera-video]')) event.target.closest('.camera-frame')?.classList.remove('stream-error');
}, true);
app.addEventListener('load', (event) => {
  if (event.target.matches?.('[data-camera-image]')) event.target.closest('.camera-frame')?.classList.remove('stream-error');
}, true);

document.addEventListener('pointerdown', beginMediaSwiperPointer, true);
document.addEventListener('pointerdown', startCustomColorInteraction, true);
window.addEventListener('pointerup', finishMediaSwiperPointer, true);
window.addEventListener('pointercancel', cancelMediaSwiperPointer, true);

app.addEventListener('pointerdown', (event) => {
  if (state.screensaverActive && !state.screensaverUnlockPrompt) {
    const interactiveTriggerControl = event.target.closest('.screensaver-trigger-panel button, .screensaver-trigger-panel input, .screensaver-trigger-panel select, .screensaver-trigger-panel textarea, .screensaver-trigger-panel a, .screensaver-trigger-panel swiper-container, .screensaver-trigger-panel [data-action], .screensaver-trigger-panel [data-command]');
    if (interactiveTriggerControl) { state.lastActivityAt = Date.now(); return; }
    event.preventDefault(); event.stopImmediatePropagation(); requestScreensaverWake(); return;
  }
  if (state.screensaverActive && state.screensaverUnlockPrompt) { state.lastActivityAt = Date.now(); return; }
  registerUserActivity({ wake: false });
  if (startLightColorInteraction(event)) return;
  if (state.pendingWidgetPlacement) return;
  if (event.target.closest('button,input,select,textarea,a,[data-action],[data-command]')) return;
  if (event.target.closest('[data-page-swipe]')) startPageSwipe(event);
  if (event.target.closest('[data-resize-handle]')) startPointerInteraction(event, 'resize');
  else if (event.target.closest('[data-widget]')) startPointerInteraction(event, 'move');
});
window.addEventListener('pointermove', (event) => { moveCustomColorInteraction(event); moveLightColorInteraction(event); updatePointerInteraction(event); updatePageSwipe(event); }, { passive: false });
window.addEventListener('pointerup', (event) => { endCustomColorInteraction(event); endLightColorInteraction(event); endPointerInteraction(event); endPageSwipe(event); });
window.addEventListener('pointercancel', (event) => { state.customColorDrag = null; state.lightColorDrag = null; endPointerInteraction(event); endPageSwipe(event); });
window.addEventListener('resize', () => {
  clearTimeout(state.viewportResizeTimer);
  state.viewportResizeTimer = setTimeout(() => {
    const columns = getColumns();
    if (columns !== state.lastColumns) render({ preserveModal: true });
    else { syncDashboardGridGeometry(app); applyWidgetElementLayouts(app); applyKioskScale(); app.querySelectorAll('swiper-container[data-widget-carousel]').forEach(scheduleWidgetCarouselGeometry); }
    fitWidgetEditorPreview(document.querySelector('[data-widget-settings-form]'));
  }, 120);
});
window.addEventListener('keydown', () => registerUserActivity());
// Escape closes the top-most layer (icon library, dialog, drawer, pending placement),
// matching what the close buttons do. Kiosk mode keeps its own locked-down behaviour.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented || state.kioskMode) return;
  const libraryClose = document.querySelector('[data-unfolded-tools-action="close"]');
  if (libraryClose) { event.preventDefault(); libraryClose.click(); return; }
  if (state.modal) {
    const closer = modalRoot.querySelector('.modal-head [data-action="close-modal"]') || modalRoot.querySelector('[data-action="close-modal"]');
    if (closer) { event.preventDefault(); closer.click(); }
    return;
  }
  if (state.drawerOpen) { event.preventDefault(); state.drawerOpen = false; syncDrawer(); return; }
  if (state.pendingWidgetPlacement) { event.preventDefault(); cancelWidgetPlacement(); }
});
window.addEventListener('wheel', () => registerUserActivity({ wake: false }), { passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) registerUserActivity(); });
window.addEventListener('beforeunload', () => { for (const timer of state.dashboardRelockTimers.values()) clearTimeout(timer); clearTimeout(state.screensaverTimer); clearTimeout(state.screensaverExitTimer); clearTimeout(state.screensaverTriggerTimer); cleanupCustomWidgetScripts(); state.eventSource?.close(); });

async function init() {
  try {
    const dictionaryResponse = await fetch('/locales/dashboard-values.json', { cache: 'force-cache' });
    if (dictionaryResponse.ok) state.defaultDictionaries = await dictionaryResponse.json();
  } catch { state.defaultDictionaries = {}; }
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Configuration request failed (${response.status})`);
    state.config = normalizeConfig(await response.json());
    restoreViewDashboard();
    initializeHistory();
    installDashboardLocalizationObserver();
  } catch (error) {
    state.config = normalizeConfig({ activeDashboardId: 'main', dashboards: [{ id: 'main', name: 'Living Room', items: [] }] });
    restoreViewDashboard();
    initializeHistory();
    installDashboardLocalizationObserver();
    toast(error.message, 'error');
  }

  try { await loadServerState(); }
  catch (error) { toast(error.message, 'error'); }
  render();
  subscribeEvents();
  if (!state.kioskMode && !state.settings.apiKeyConfigured) toast('Reconfigure the integration on the Remote to provision Core API access.');
}

init().catch((error) => {
  clearTimeout(window.__ucDashboardBootTimer);
  console.error(error);
  app.innerHTML = `<main class="compatibility-error"><h1>${escapeHtml(translateDashboardText('Dashboard could not start'))}</h1><p>${escapeHtml(translateDashboardText(error?.message || String(error)))}</p><button onclick="location.reload()">${escapeHtml(translateDashboardText('Reload'))}</button></main>`;
});
setInterval(updateLiveWidgets, 1000);
setInterval(() => { if (state.config) updateMarquees(); }, 15000);
