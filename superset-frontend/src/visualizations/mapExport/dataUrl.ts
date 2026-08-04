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

const DEFAULT_MEDIA_TYPE = 'application/octet-stream';

/**
 * Turn a `data:` URL into a Blob **without touching the network stack**.
 *
 * The obvious implementation — `await (await fetch(dataUrl)).blob()` — is
 * blocked here: `fetch` on a `data:` URL is governed by the CSP `connect-src`
 * directive, and this deployment's policy does not list `data:`. The browser
 * rejects it with an opaque "Failed to fetch". (`img-src` *does* allow `data:`,
 * which is why loading these same URLs into an <img> works.)
 *
 * Decoding in-process sidesteps the policy entirely and avoids widening CSP
 * application-wide for a single call site.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma === -1) {
    throw new Error('Not a data URL');
  }

  // Between "data:" and the comma, e.g. `image/svg+xml;charset=utf-8` or
  // `image/png;base64`.
  const header = dataUrl.slice('data:'.length, comma);
  const payload = dataUrl.slice(comma + 1);
  const parameters = header.split(';');
  const isBase64 = parameters[parameters.length - 1].toLowerCase() === 'base64';
  const mediaType = parameters[0] || DEFAULT_MEDIA_TYPE;

  if (!isBase64) {
    // `toSvg` produces a percent-encoded payload rather than base64.
    return new Blob([decodeURIComponent(payload)], { type: mediaType });
  }

  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mediaType });
}

export default dataUrlToBlob;
