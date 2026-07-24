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
import { render, screen, fireEvent, act } from 'spec/helpers/testing-library';
import PeriodDataZoom from './PeriodDataZoom';

const periods = ['202401', '202402', '202403', '202404', '202405'];

type ZoomProps = Partial<Parameters<typeof PeriodDataZoom>[0]>;

function renderZoom(props: ZoomProps = {}) {
  return render(
    <PeriodDataZoom
      periods={periods}
      value={[periods.length - 1, periods.length - 1]}
      onChange={jest.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

test('renders one clickable cell per period and the play button', () => {
  renderZoom();
  expect(screen.getByLabelText('Play')).toBeInTheDocument();
  // One cell button per period (+ the play button).
  const cells = screen.getAllByRole('button');
  // 5 period cells + 1 play button
  expect(cells.length).toBe(periods.length + 1);
});

test('renders nothing when there are fewer than two periods', () => {
  const { container } = renderZoom({ periods: ['202401'], value: [0, 0] });
  expect(container).toBeEmptyDOMElement();
});

test('shows the selected period in the floating label', () => {
  renderZoom({ value: [2, 2] });
  expect(screen.getByTestId('period-timeline-label')).toHaveTextContent(
    '202403',
  );
});

test('clicking a period selects exactly that single period', () => {
  const onChange = jest.fn();
  renderZoom({ onChange });
  // Click the second period's cell (index 1).
  const cell = screen.getByRole('button', { name: '202402' });
  fireEvent.click(cell);
  expect(onChange).toHaveBeenCalledWith([1, 1]);
});

test('starting play restarts from the first period and toggles to Pause', () => {
  const onChange = jest.fn();
  renderZoom({ onChange, value: [4, 4], playIntervalMs: 1000 });
  fireEvent.click(screen.getByLabelText('Play'));
  // Starting play jumps to the first period.
  expect(onChange).toHaveBeenLastCalledWith([0, 0]);
  expect(screen.getByLabelText('Pause')).toBeInTheDocument();
});

test('advances one period per tick while playing', () => {
  // value=[1,1] so the current period is index 1; a tick advances to index 2.
  const onChange = jest.fn();
  renderZoom({ onChange, value: [1, 1], playIntervalMs: 1000 });
  fireEvent.click(screen.getByLabelText('Play'));
  onChange.mockClear();
  act(() => {
    jest.advanceTimersByTime(1000);
  });
  expect(onChange).toHaveBeenLastCalledWith([2, 2]);
});
