/* eslint-env jest */
/* eslint-disable no-restricted-globals */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, supersetTheme } from '@superset-ui/core';
import SummaryViz from './SummaryViz';

describe('SummaryViz', () => {
  test('renders summary items and header', () => {
    render(
      <ThemeProvider theme={supersetTheme}>
        <SummaryViz
          width={500}
          height={300}
          items={[
            {
              id: '1',
              label: 'Total Cases',
              formattedValue: '152,340',
              rawValue: 152340,
              formattedChange: '+12',
              changeValue: 12,
              trendDirection: 'up',
              colorState: 'positive',
            },
          ]}
          displayMode="metrics_as_items"
          layoutMode="vertical_list"
          density="compact"
          columnsCount={2}
          autoColumns
          itemAlignment="stretch"
          labelPosition="above"
          valuePosition="justified"
          showDividers
          cardMode
          shadedRows={false}
          labelFontSize={12}
          valueFontSize={28}
          secondaryFontSize={12}
          labelFontWeight="500"
          valueFontWeight="700"
          secondaryFontWeight="500"
          truncateLabel={false}
          wrapLabel
          microVisualType="none"
          microVisualPosition="right"
          deltaDisplay="value"
          higherIsBetter
          borderRadius={12}
          borderWidth={1}
          shadowSize="small"
          spacingScale={1}
          showGroupHeader
          groupHeaderText="Key Statistics"
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('Key Statistics')).toBeInTheDocument();
    expect(screen.getByText('Total Cases')).toBeInTheDocument();
    expect(screen.getByText('152,340')).toBeInTheDocument();
  });
});
