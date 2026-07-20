/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * Route the active "Pro Theme Preset" palette into actual chart SERIES colors.
 *
 * Chart series colors resolve through the categorical color scheme registry: a
 * chart with no explicit `color_scheme` uses the registry's default key
 * (`CategoricalColorNamespace.getScale` -> `getDefaultKey()`). So by registering
 * a single dynamic scheme built from the selected preset's `chartPalette` and
 * making it the default, every such chart recolors automatically — no per-chart
 * edits. Re-registering the same id just swaps the colors, so switching preset
 * or light/dark mode is cheap.
 *
 * Kept fully dynamic: the palette always comes from the selected
 * `ThemePreset.chartPalette`. Nothing here is hardcoded.
 */
import {
  CategoricalScheme,
  ColorSchemeGroup,
  getCategoricalSchemeRegistry,
} from '@superset-ui/core';
import { refreshLabelsColorMap, resetColors } from 'src/utils/colorScheme';

export const PRO_THEME_PRESET_SCHEME_ID = 'proThemePreset';

let lastAppliedPalette: string | null = null;

export interface ApplyChartPaletteOptions {
  /** Make this palette the registry default (so unscoped charts use it). */
  setAsDefault?: boolean;
  /** Clear cached label→color pairs and nudge mounted charts to repaint. */
  forceRecolor?: boolean;
}

export default function applyPresetChartPalette(
  palette: string[] | undefined | null,
  { setAsDefault = true, forceRecolor = false }: ApplyChartPaletteOptions = {},
): void {
  const colors = (palette || []).filter(Boolean);
  if (!colors.length) {
    return;
  }

  const registry = getCategoricalSchemeRegistry();
  // Registering the same id replaces its colors, so preset/mode swaps are cheap.
  registry.registerValue(
    PRO_THEME_PRESET_SCHEME_ID,
    new CategoricalScheme({
      id: PRO_THEME_PRESET_SCHEME_ID,
      label: 'Pro Theme Preset',
      colors,
      group: ColorSchemeGroup.Custom,
    }),
  );

  if (setAsDefault) {
    registry.setDefaultKey(PRO_THEME_PRESET_SCHEME_ID);
  }

  const key = colors.join(',');
  const changed = key !== lastAppliedPalette;
  lastAppliedPalette = key;

  if (forceRecolor && changed) {
    // Old label→color pairs are cached in the LabelsColorMap singleton; clear
    // them so charts adopt the new palette. Dashboards re-apply their custom
    // `label_colors` afterwards via their own labels-color effect.
    resetColors();
    refreshLabelsColorMap(undefined, PRO_THEME_PRESET_SCHEME_ID);
    // Nudge already-mounted echarts/SVG charts to repaint.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('resize'));
    }
  }
}
