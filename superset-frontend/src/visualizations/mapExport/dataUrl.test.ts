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

import { dataUrlToBlob } from './dataUrl';

// Smallest valid PNG — what `domToImage.toPng` produces, in miniature.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// jsdom's Response stringifies a Blob, so read it with FileReader instead.
const readBlob = (blob: Blob, as: 'buffer' | 'text'): Promise<any> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    if (as === 'buffer') reader.readAsArrayBuffer(blob);
    else reader.readAsText(blob);
  });

const bytesOf = async (blob: Blob) =>
  new Uint8Array(await readBlob(blob, 'buffer'));

const textOf = (blob: Blob): Promise<string> => readBlob(blob, 'text');

describe('dataUrlToBlob', () => {
  test('decodes a base64 image to the exact bytes', async () => {
    const blob = dataUrlToBlob(`data:image/png;base64,${PNG_BASE64}`);

    expect(blob.type).toBe('image/png');
    const bytes = await bytesOf(blob);
    expect(bytes.length).toBe(atob(PNG_BASE64).length);
    // PNG magic number — proves we wrote binary, not the base64 text.
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  test('never produces an empty blob for real image data', async () => {
    const blob = dataUrlToBlob(`data:image/png;base64,${PNG_BASE64}`);

    expect(blob.size).toBeGreaterThan(0);
  });

  test('decodes a percent-encoded SVG, as toSvg emits', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="1"/></svg>';
    const blob = dataUrlToBlob(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    );

    expect(await textOf(blob)).toBe(svg);
  });

  test('strips parameters off the media type', () => {
    const blob = dataUrlToBlob('data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E');

    expect(blob.type).toBe('image/svg+xml');
  });

  test('handles jpeg as well as png', () => {
    expect(dataUrlToBlob(`data:image/jpeg;base64,${PNG_BASE64}`).type).toBe(
      'image/jpeg',
    );
  });

  test('falls back to a generic media type when none is given', () => {
    expect(dataUrlToBlob('data:,hello').type).toBe('application/octet-stream');
  });

  test('rejects input that is not a data URL, rather than saving an empty file', () => {
    expect(() => dataUrlToBlob('https://example.com/a.png')).toThrow(
      'Not a data URL',
    );
    expect(() => dataUrlToBlob('data:image/png;base64')).toThrow(
      'Not a data URL',
    );
    expect(() => dataUrlToBlob('')).toThrow('Not a data URL');
  });
});
