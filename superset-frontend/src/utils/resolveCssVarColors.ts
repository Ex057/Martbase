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
 * Resolve CSS custom-property colours (`var(--x, #fallback)`) to concrete values.
 *
 * ECharts renders to a `<canvas>`, and a canvas 2D context CANNOT parse
 * `var(...)` — it silently drops the value and the element paints black. So any
 * chart that builds its ECharts option with `var(--pro-*)` colour strings must
 * resolve them to real colours first. Run the finished option through this just
 * before `setOption`.
 *
 * Resolution reads the LIVE custom property from the DOM, so the colours follow
 * the active light/dark theme (the values are set globally in AppGlobalStyles).
 * When a property isn't defined (e.g. jsdom in tests) the `var()` fallback is
 * used, and nested fallbacks that are themselves `var()` are followed.
 *
 * Pass the chart's own element as `el` so the lookup happens inside the theme
 * scope; it defaults to `document.documentElement`.
 */
export function resolveCssVarColors<T>(option: T, el?: Element | null): T {
  if (typeof document === 'undefined') return option;
  const root = el ?? document.documentElement;
  const style = getComputedStyle(root);

  const resolveString = (value: string): string => {
    const match = value
      .trim()
      .match(/^var\(\s*(--[A-Za-z0-9-]+)\s*(?:,\s*([\s\S]+))?\)$/);
    if (!match) return value;
    const live = style.getPropertyValue(match[1]).trim();
    if (live) return resolveString(live);
    return match[2] ? resolveString(match[2].trim()) : value;
  };

  // Clone-on-write: return the SAME node when nothing beneath it changed, so a
  // large ECharts option (series[].data arrays with no colours) is not deep-
  // copied on every setOption/resize — only the branches holding var() are.
  const walk = (node: any): any => {
    if (typeof node === 'string') {
      return node.includes('var(') ? resolveString(node) : node;
    }
    if (Array.isArray(node)) {
      // Allocate a copy only once a child actually changes, so a big data array
      // with no var() (the common case) is scanned but never copied.
      let next: any[] | undefined;
      for (let i = 0; i < node.length; i += 1) {
        const resolved = walk(node[i]);
        if (resolved !== node[i]) {
          next = next ?? node.slice();
          next[i] = resolved;
        }
      }
      return next ?? node;
    }
    if (node && typeof node === 'object') {
      const entries = Object.keys(node).map(
        key => [key, walk(node[key])] as const,
      );
      // Only allocate a copy when a value actually changed.
      if (entries.every(([key, resolved]) => resolved === node[key])) {
        return node;
      }
      const out: Record<string, any> = { ...node };
      entries.forEach(([key, resolved]) => {
        out[key] = resolved;
      });
      return out;
    }
    return node;
  };

  return walk(option);
}

export default resolveCssVarColors;
