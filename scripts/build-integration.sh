#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('${ROOT}/package.json').version")"
NAME="uc-dashboard-${VERSION}"
STAGE="${ROOT}/builds/${NAME}"
ARCHIVE="${ROOT}/builds/${NAME}.tar.gz"

rm -rf "${STAGE}" "${ARCHIVE}"
mkdir -p "${STAGE}/bin/public" "${STAGE}/config" "${STAGE}/data"
cp "${ROOT}/driver.json" "${STAGE}/driver.json"
cp "${ROOT}/driver.json" "${STAGE}/bin/driver.json"
cp "${ROOT}/uc-dashboard.png" "${STAGE}/uc-dashboard.png"
cp "${ROOT}/package.json" "${STAGE}/bin/package.json"
cp "${ROOT}/driver.js" "${ROOT}/core-client.js" "${ROOT}/dashboard-server.js" "${ROOT}/integration-server.js" "${ROOT}/core-auth.js" "${ROOT}/settings-manager.js" "${ROOT}/logger.js" "${ROOT}/simple-ws-server.js" "${STAGE}/bin/"
cp -R "${ROOT}/public/." "${STAGE}/bin/public/"

# Keep release metadata and frontend cache keys synchronized with package.json.
VERSION_ESCAPED="$(printf '%s' "${VERSION}" | sed 's/[.[\*^$()+?{|]/\\&/g')"
sed -E -i "s/version: '[0-9]+\.[0-9]+\.[0-9]+'/version: '${VERSION}'/" "${STAGE}/bin/driver.js"
sed -E -i "s/\?v=[0-9]+\.[0-9]+\.[0-9]+/?v=${VERSION}/g" "${STAGE}/bin/public/index.html"

# Stable-release packaging guard: fail instead of producing an incomplete archive.
REQUIRED_ASSETS=(
  "bin/logger.js"
  "bin/public/assets/fonts/material-symbols-rounded.woff2"
  "bin/public/assets/fonts/inter-latin-wght-normal.woff2"
  "bin/public/assets/fonts/roboto-latin-wght-normal.woff2"
  "bin/public/assets/fonts/fonts.css"
  "bin/public/material-symbols-catalog.js"
  "bin/public/locales/dashboard-values.json"
  "bin/public/uc-dashboard.png"
)
for asset in "${REQUIRED_ASSETS[@]}"; do
  if [[ ! -s "${STAGE}/${asset}" ]]; then
    printf 'Missing required packaged asset: %s\n' "${asset}" >&2
    exit 1
  fi
done
if [[ -e "${STAGE}/bin/public/local-icons.js" ]]; then
  printf 'Obsolete SVG icon runtime must not be packaged: bin/public/local-icons.js\n' >&2
  exit 1
fi
# Stable icon styling guard: all Material Symbols must explicitly use the thin weight-100 axis.
if ! grep -Fq '"wght" 100' "${STAGE}/bin/public/styles.css"; then
  printf 'Material Symbols weight-100 rule is missing from styles.css.\n' >&2
  exit 1
fi
if ! grep -Fq "createLogger('core-client')" "${STAGE}/bin/core-client.js"; then
  printf 'Structured Core client logging is missing from packaged runtime.\n' >&2
  exit 1
fi
for marker in dashboard_to_integration integration_to_dashboard integration_to_remote_api remote_api_to_integration; do
  if ! grep -R -Fq "${marker}" "${STAGE}/bin/dashboard-server.js" "${STAGE}/bin/core-client.js" "${STAGE}/bin/core-auth.js"; then
    printf 'Directional request logging marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
if ! grep -Fq "start: 'on'" "${STAGE}/bin/core-client.js" || ! grep -Fq "stop: 'off'" "${STAGE}/bin/core-client.js"; then
  printf 'Activity on/off command normalization is missing from packaged runtime.\n' >&2
  exit 1
fi
if grep -Fq "stop: 'activity.stop'" "${STAGE}/bin/core-client.js"; then
  printf 'Invalid activity.stop command mapping is still present.\n' >&2
  exit 1
fi
if ! grep -Fq "Integration log level" "${STAGE}/bin/public/app.js"; then
  printf 'Log-level editor is missing from frontend bundle.\n' >&2
  exit 1
fi
if ! grep -Fq -- '--material-symbol-weight: 100' "${STAGE}/bin/public/assets/fonts/fonts.css"; then
  printf 'Material Symbols weight-100 default is missing from fonts.css.\n' >&2
  exit 1
fi

# v1.1 status-grid and dashboard-lock guards.
for marker in 'layoutColumns' 'layoutItems' 'statusbar-drag-handle' 'dashboardRelockTimers' 'relockAllDashboards' 'normalizeStatusBarAlignment' 'statusbar-column-inactive' 'status-column-divider'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/app.js"; then
    printf 'v1.1 frontend marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
if ! grep -Fq 'status-grid-layout' "${STAGE}/bin/public/styles.css"; then
  printf 'Free status-grid styling is missing from styles.css.\n' >&2
  exit 1
fi
for marker in 'status-align-left' 'status-align-center' 'status-align-right' 'status-column-divider' 'statusbar-column-inactive'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/styles.css"; then
    printf 'Status-bar alignment/divider styling is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
if grep -Fq 'name="verticalDividers"' "${STAGE}/bin/public/app.js"; then
  printf 'Obsolete global vertical-divider checkbox is still present.\n' >&2
  exit 1
fi
if grep -Fq 'statusbarLayoutItemsFromForm(form).slice(0, requestedColumns)' "${STAGE}/bin/public/app.js"; then
  printf 'Status-bar columns are still truncated when the visible count is reduced.\n' >&2
  exit 1
fi
if grep -Fq 'while (rows.length > columns) rows.pop()?.remove()' "${STAGE}/bin/public/app.js"; then
  printf 'Status-bar editor still deletes hidden configured columns.\n' >&2
  exit 1
fi

# v1.2 UI and notification guards.
for marker in 'statusbar-item-delete' 'deleteStatusbarEditorItem' 'notificationSettings' 'notificationAutoLowBattery' 'alert-overview-card' 'CONTENT_ALIGNMENT_WIDGET_TYPES' 'class="clock-time" data-clock-time' 'class="clock-date" data-clock-date'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/app.js"; then
    printf 'v1.2 frontend marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
for marker in '.alert-card-content' '.alert-overview-card' '.widget-content-align-center' '.widget-editor-preview-frame .remote-entity'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/styles.css"; then
    printf 'v1.2 style marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done

# v1.3 backgrounds, layout workflow, icon choices, transitions, editor overflow, and PIN guards.
for marker in 'backgroundPresets' 'normalizeSavedBackgroundPreset' 'save-background-preset' 'delete-background-preset' 'layout-element-selector' 'selectLayoutEditorElement' 'data-layout-element-key' 'data-generic-icon-upload' 'dashboardTransitionFrames' 'data-remove-dashboard-pin-form' 'scrollHost?.scrollTop'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/app.js"; then
    printf 'v1.3 frontend marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
for marker in '.layout-element-selected' '.media-browser-toolbar' 'grid-template-rows: 42px !important' '.transition-choice-grid input:checked + span' 'scrollbar-gutter: stable'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/styles.css"; then
    printf 'v1.3 style marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
if grep -Fq 'dashboardPinClear:' "${STAGE}/bin/public/app.js"; then
  printf 'Obsolete dashboard PIN-clear checkbox is still present.\n' >&2
  exit 1
fi
if [[ "$(grep -Fc "else if (action === 'clear-icon-choice')" "${STAGE}/bin/public/app.js")" -ne 1 ]]; then
  printf 'Reusable icon clear action must exist exactly once.\n' >&2
  exit 1
fi
if grep -Fq '?v=1.2.0' "${STAGE}/bin/public/index.html"; then
  printf 'Stale v1.2.0 frontend cache keys remain in index.html.\n' >&2
  exit 1
fi


# v1.4 independent background presets, dedicated buttons, native coverflow preview, and tab guards.
for marker in 'save-background-preset' 'saveBackgroundPresetFromForm' 'backgroundDefinitionWithUpload' 'icon_button' 'text_button' 'icon_text_button' 'navigation-preview-stage' 'runCoverflowDashboardTransition'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/app.js"; then
    printf 'v1.4 frontend marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
for marker in '@keyframes nav-preview-coverflow-a' '.dashboard-coverflow-transition-layer' 'grid-auto-rows: minmax(108px,auto)' '.tab-container-tabs button'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/styles.css"; then
    printf 'v1.4 style marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
if grep -Eq 'Search 4,000\+ symbols|matching symbols|name="saveAsPreset"' "${STAGE}/bin/public/app.js"; then
  printf 'Obsolete v1.3 icon or background-preset copy remains.\n' >&2
  exit 1
fi
if grep -Fq '?v=1.3.0' "${STAGE}/bin/public/index.html"; then
  printf 'Stale v1.3.0 frontend cache keys remain in index.html.\n' >&2
  exit 1
fi

# v1.5 exact-preview, geometry-safe layout, icon sizing, and navigation preview guards.
for marker in 'widgetEditorPreviewDimensions' '_previewSourceId' 'widget-layout-control-shell' 'widget-layout-position-only' 'entityLayoutPresenceClasses' '--command-icon-size'; do
  if ! grep -Fq -- "${marker}" "${STAGE}/bin/public/app.js"; then
    printf 'v1.5 frontend marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
for marker in '.widget-layout-control-shell > :is(.remote-circle-command,.remote-power)' '.entity-layout.layout-lead-only' '.transition-choice-grid span > :is(.uc-icon,.chosen-icon-image,.widget-icon-image)' '.navigation-live-preview.mode-bottom_dock .navigation-preview-device' '.navigation-live-preview.mode-default .navigation-preview-swipe-title'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/styles.css"; then
    printf 'v1.5 style marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
if grep -Fq '?v=1.4.0' "${STAGE}/bin/public/index.html"; then
  printf 'Stale v1.4.0 frontend cache keys remain in index.html.\n' >&2
  exit 1
fi
PACKAGED_VERSION="$(node -p "require('${STAGE}/bin/package.json').version")"
if [[ "${PACKAGED_VERSION}" != "${VERSION}" ]]; then
  printf 'Packaged runtime version mismatch: expected %s, got %s.\n' "${VERSION}" "${PACKAGED_VERSION}" >&2
  exit 1
fi
if ! grep -Fq "version: '${VERSION}'" "${STAGE}/bin/driver.js"; then
  printf 'Driver startup metadata version mismatch: expected %s.\n' "${VERSION}" >&2
  exit 1
fi


# v1.6 localization, entity-access, entity-grid, timer, spacing, and migration guards.
for marker in 'translateDashboardValue' 'data-translation-dictionary' "id:'language',label:'Language'" 'entityAccessEditorPanel' "id:'entities',label:'Entities'" 'renderEntityGridLayout' 'entityGridLayoutFromForm' 'ENTITY_GRID_LAYOUT_TYPES' "item.widgetType === 'command_button') item.widgetType = 'icon_text_button'"; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/app.js"; then
    printf 'v1.6 frontend marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
for marker in 'getEntityCatalog()' 'dashboard_supported'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/core-client.js"; then
    printf 'v1.6 entity-catalog marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
for marker in '.entity-widget-grid-row' '.scene-routine-widget' '.counter-stat-widget' '.timer-widget' '.room-summary-widget' '.history-graph-widget' '.entity-access-list'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/styles.css"; then
    printf 'v1.6 style marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
if grep -Fq "command_button: {" "${STAGE}/bin/public/app.js"; then
  printf 'Legacy Command button remains registered in the system-widget catalog.\n' >&2
  exit 1
fi
if ! grep -Fq '"de"' "${STAGE}/bin/public/locales/dashboard-values.json"; then
  printf 'Bundled dashboard translation dictionaries are incomplete.\n' >&2
  exit 1
fi
if ! grep -Fq '{ offset:1, opacity:0, transform:outgoingTransform' "${STAGE}/bin/public/app.js"; then
  printf 'Coverflow outgoing fade is missing.\n' >&2
  exit 1
fi
if grep -Fq '?v=1.5.0' "${STAGE}/bin/public/index.html"; then
  printf 'Stale v1.5.0 frontend cache keys remain in index.html.\n' >&2
  exit 1
fi

# v1.7 settings stability, entity templates, text placeholders, and timer audio guards.
for marker in 'entity_template' 'renderEntityTemplateWidget' 'catalogEntitySelect' 'renderTextTemplate' '{entity.value-xy}' 'finishSoundFile' 'playTimerFinishSound' 'data-countdown-only'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/app.js"; then
    printf 'v1.7 frontend marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
for marker in '.settings-flow-modal.main-settings-flow .widget-editor-flow' 'grid-template-columns: repeat(4, minmax(0, 1fr))' '.entity-template-widget' '[data-countdown-only][hidden]'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/styles.css"; then
    printf 'v1.7 style marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
ENTITY_CATALOG_HANDLER="$(sed -n "/source.addEventListener('entity_catalog'/,/source.addEventListener('entity_change'/p" "${STAGE}/bin/public/app.js")"
if grep -Fq 'renderModalRoot()' <<< "${ENTITY_CATALOG_HANDLER}"; then
  printf 'Entity catalog updates still reset the open Settings form.\n' >&2
  exit 1
fi
if ! grep -Fq "timer.mode!=='stopwatch'" "${STAGE}/bin/public/app.js"; then
  printf 'Stopwatch mode still exposes countdown presets.\n' >&2
  exit 1
fi
if grep -Fq '?v=1.6.0' "${STAGE}/bin/public/index.html"; then
  printf 'Stale v1.6.0 frontend cache keys remain in index.html.\n' >&2
  exit 1
fi

# v1.8 unified custom code, arbitrary entity templates, and geometry guards.
if grep -Fq 'Catalog updated without resetting this form' "${STAGE}/bin/public/app.js"; then
  printf 'Development-only catalog feedback remains in the packaged UI.\n' >&2
  exit 1
fi
if grep -Eq '^  custom_(html|css|js):' "${STAGE}/bin/public/app.js"; then
  printf 'Legacy custom HTML/CSS/JavaScript widgets remain registered.\n' >&2
  exit 1
fi
for marker in 'custom_code' 'customCodeGlobal' 'customCodeScope' 'scopeWidgetCss' 'data-custom-code-scope' 'TEMPLATE_ELEMENT_TYPES' 'templateElementsFromForm' 'executeTemplateElementCommand' 'template-element-add' 'template-toggle-control' 'data-template-slider-control'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/app.js"; then
    printf 'v1.8 frontend marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
for marker in '.entity-template-elements' '.entity-template-control' '.template-element-editor[data-template-element-type="toggle"]' 'aspect-ratio: 1 / 1 !important' '.toast-region { right:100px' 'grid-template-rows:26px auto minmax(0,1fr)!important'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/styles.css"; then
    printf 'v1.8 style marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
if ! grep -Fq 'normalized.version = 37' "${STAGE}/bin/public/app.js" || ! grep -Fq 'version: 37' "${STAGE}/bin/dashboard-server.js"; then
  printf 'v1.9 dashboard schema version 37 is missing.\n' >&2
  exit 1
fi
if ! grep -Fq "?v=${VERSION}" "${STAGE}/bin/public/index.html"; then
  printf 'Frontend cache keys for version %s are missing.\n' "${VERSION}" >&2
  exit 1
fi

# Alert-center stable-release guards.
if grep -Eq 'Open doors and windows|Leaks and moisture|Smoke and gas' "${STAGE}/bin/public/app.bundle.js"; then
  printf 'Removed automatic alert categories are still present in the frontend bundle.\n' >&2
  exit 1
fi
if ! grep -Fq '.remote-entity>.alert-center-widget{padding:var(--active-responsive-padding,14px 16px)}' "${STAGE}/bin/public/styles.css"; then
  printf 'Alert-center default spacing fallback is missing from styles.css.\n' >&2
  exit 1
fi


# v1.9 edit-grid placement, carousel ordering, camera isolation, layout sizing/hiding and variants guards.
for marker in 'pendingWidgetPlacement' 'placementCandidateFromPointer' 'widget-placement-ghost' 'beginWidgetPlacement' 'commitWidgetPlacement' 'carouselOrderEditor' 'patchCameraSafeContainer' 'definition.hidden' 'definition.scale' 'data-widget-editor-step="variants"'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/app.js"; then
    printf 'v1.9 frontend marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
for marker in 'body.editing .remote-entity-grid' '.widget-placement-ghost' '.carousel-card-order-list' '.entity-widget-grid-element-inner' '--dashboard-grid-row-size'; do
  if ! grep -Fq -- "${marker}" "${STAGE}/bin/public/styles.css"; then
    printf 'v1.9 style marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
for marker in 'disconnectGraceTimer' "sourceBuffer.addEventListener('error'" 'this.lastEngine'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/camera-player.js"; then
    printf 'v1.9 camera reliability marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
if grep -Fq "const steps = ['content','behavior','appearance','layout','advanced'];" "${STAGE}/bin/public/app.js"; then
  printf 'Widget editor previous/next controls still skip the Variants tab.\n' >&2
  exit 1
fi


# v1.10 square 24-column grid, restored native go2rtc player, and full dashboard localization guards.
for marker in 'const DASHBOARD_GRID_COLUMNS = 24' 'const migrateDashboardGrid = sourceVersion < 37' 'function syncDashboardGridGeometry' 'grid.dataset.gridCellSize = String(cell)' 'function localizedDashboardMarkup' 'setLocalizedDashboardHtml(app, dashboardMarkup)' 'function freezeActiveDashboardShell' 'function restoreFrozenDashboardShell' 'function renderBackgroundSettingsEditor' 'const STATUS_BAR_ITEM_ALIASES' ".replace(/_+/g, '_')" "const blocked = 'script,style,code,pre" 'data-camera-native-frame' 'go2rtcPlayerUrl(settings)'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/app.js"; then
    printf 'v1.10 frontend marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
for marker in '--grid-columns: 24' 'repeat(var(--grid-columns), minmax(0, 1fr)) !important' '#frozen-dashboard-root' 'contain: strict' 'background-editor-live-preview' 'square 24-column dashboard grid'; do
  if ! grep -Fq -- "${marker}" "${STAGE}/bin/public/styles.css"; then
    printf 'v1.10 style marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
if grep -Fq 'engine="go2rtc"' "${STAGE}/bin/public/app.js"; then
  printf 'The broken direct go2rtc WebSocket player remains enabled.\n' >&2
  exit 1
fi
if ! grep -Fq '"driver_id": "uc_dashboard"' "${STAGE}/driver.json"; then
  printf 'Driver ID is not uc_dashboard.\n' >&2
  exit 1
fi
if ! grep -Fq "href=\"/uc-dashboard.png?v=${VERSION}\"" "${STAGE}/bin/public/index.html"; then
  printf 'Dashboard favicon cache key for version %s is missing from index.html.\n' "${VERSION}" >&2
  exit 1
fi
for marker in "stage.style.overflowY = 'auto'" 'function runtimeWidgetSignature' 'node.dataset.runtimeSignature === signature' 'scrolling="no"'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/app.js"; then
    printf 'Display-stability frontend marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
for marker in 'display stability follow-up' 'contain: layout paint size'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/styles.css"; then
    printf 'Display-stability style marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
# v1.11 final backup import/export guards.
for marker in 'function backupEditorPanel' 'exportDashboardBackup' 'importDashboardBackup' 'data-backup-import-confirm'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/app.js"; then
    printf 'Backup frontend marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
for marker in "pathname === '/api/backup'" "pathname === '/api/backup/import'" 'createBackupPayload' 'pre-import-' 'backupForExport()'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/dashboard-server.js"; then
    printf 'Backup server marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
for marker in '.backup-current-summary' '.backup-import-preview' '.backup-import-button'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/styles.css"; then
    printf 'Backup style marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done

# v1.11 unfolded.tools icon-library integration guards.
for marker in 'unfoldedToolsPicker' 'open-unfolded-tools-picker' 'iconLibrarySettingsPanel' 'unfoldedToolsIconUrl' 'data-unfolded-tools-action="select"' 'iconAssets'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/app.js"; then
    printf 'unfolded.tools frontend marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
for marker in "pathname === '/api/unfolded-tools/icons'" "pathname === '/api/unfolded-tools/cache'" "pathname === '/api/unfolded-tools/countries'" '#collectBackupIconAssets' '#restoreBackupIconAssets' "'x-api-key': key"; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/dashboard-server.js"; then
    printf 'unfolded.tools backend marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
for marker in 'unfoldedToolsApiKey' 'unfoldedToolsCacheSelected' 'unfoldedToolsIncludeInBackup'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/settings-manager.js"; then
    printf 'unfolded.tools settings marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done
for marker in '.unfolded-tools-library-dialog' '.unfolded-tools-icon-grid' '.unfolded-tools-icon-card'; do
  if ! grep -Fq "${marker}" "${STAGE}/bin/public/styles.css"; then
    printf 'unfolded.tools style marker is missing: %s\n' "${marker}" >&2
    exit 1
  fi
done

node --input-type=module - "${STAGE}/bin/public/locales/dashboard-values.json" <<'NODE'
import fs from 'node:fs';
const file = process.argv[2];
const dictionaries = JSON.parse(fs.readFileSync(file, 'utf8'));
const languages = ['en', 'de', 'fr', 'es', 'it', 'nl'];
const required = ['dashboard_menu', 'add_widget', 'lock_dashboard', 'unlock_dashboard', 'connected', 'disconnected', 'weather', 'humidity', 'wind', 'timer_finished', 'open', 'closed', 'on', 'off', 'choose_a_starting_point', 'color_and_image', 'overlay_save', 'apply_background', 'alert_sources_and_thresholds_are_configured_only_in_settings_notifications', 'unfolded_tools_icon_library', 'connect_unfolded_tools_first', 'cached_icon_count'];
const baseline = Object.keys(dictionaries.en || {}).sort();
if (baseline.length < 400) throw new Error(`Expected at least 400 English dashboard translations, found ${baseline.length}`);
for (const language of languages) {
  const dictionary = dictionaries[language];
  if (!dictionary) throw new Error(`Missing dashboard dictionary: ${language}`);
  const keys = Object.keys(dictionary).sort();
  if (JSON.stringify(keys) !== JSON.stringify(baseline)) throw new Error(`Dictionary key mismatch: ${language}`);
  for (const key of required) {
    if (typeof dictionary[key] !== 'string' || !dictionary[key].trim()) throw new Error(`Missing ${language}.${key}`);
  }
}
NODE

tar -czf "${ARCHIVE}" -C "${STAGE}" .

# Verify the archive itself, not only the staging directory.
ARCHIVE_LIST="$(tar -tzf "${ARCHIVE}")"
for asset in "${REQUIRED_ASSETS[@]}"; do
  if ! grep -Fxq "./${asset}" <<< "${ARCHIVE_LIST}"; then
    printf 'Archive verification failed for: %s\n' "${asset}" >&2
    exit 1
  fi
done
if grep -Fxq './bin/public/local-icons.js' <<< "${ARCHIVE_LIST}"; then
  printf 'Archive contains obsolete SVG icon runtime.\n' >&2
  exit 1
fi
rm -rf "${STAGE}"
(cd "${ROOT}/builds" && sha256sum "${NAME}.tar.gz" > "${NAME}.tar.gz.sha256")
printf 'Created %s\n' "${ARCHIVE}"