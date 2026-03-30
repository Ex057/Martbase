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
import { useEffect, useState, useCallback, useMemo } from 'react';
import { styled, SupersetClient, t } from '@superset-ui/core';
import Tabs from '@superset-ui/core/components/Tabs';
import { Loading, Typography } from '@superset-ui/core/components';
// eslint-disable-next-line no-restricted-imports
import { Select, Tag, Checkbox, Collapse, Badge, Button } from 'antd';
import type { CollapseProps } from 'antd';

const { Text } = Typography;

const Container = styled.div`
  ${({ theme }) => `
    border: 1px solid ${theme.colorBorder};
    border-radius: ${theme.borderRadius}px;
    background: ${theme.colorBgContainer};
  `}
`;

const TabContent = styled.div`
  ${({ theme }) => `
    padding: ${theme.sizeUnit * 2}px;
    min-height: 300px;
  `}
`;

const PeriodGrid = styled.div`
  ${({ theme }) => `
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: ${theme.sizeUnit}px;
    max-height: 250px;
    overflow-y: auto;
    padding: ${theme.sizeUnit}px;
    border: 1px solid ${theme.colorBorder};
    border-radius: ${theme.borderRadius}px;
    background: ${theme.colorBgContainer};
  `}
`;

const PeriodItem = styled.div<{ selected?: boolean }>`
  ${({ theme, selected }) => `
    padding: ${theme.sizeUnit}px ${theme.sizeUnit * 1.5}px;
    border: 1px solid ${selected ? theme.colorPrimary : theme.colorBorder};
    border-radius: ${theme.borderRadius}px;
    background: ${selected ? theme.colorPrimaryBg : theme.colorBgContainer};
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: ${theme.sizeUnit}px;
    font-size: 13px;
    
    &:hover {
      border-color: ${theme.colorPrimary};
      background: ${theme.colorPrimaryBg};
    }
  `}
`;

const RelativePeriodGrid = styled.div`
  ${({ theme }) => `
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: ${theme.sizeUnit}px;
  `}
`;

const SelectedSection = styled.div`
  ${({ theme }) => `
    padding: ${theme.sizeUnit * 2}px;
    border-top: 1px solid ${theme.colorBorder};
    background: ${theme.colorBgLayout};
    max-height: 120px;
    overflow-y: auto;
  `}
`;

const SelectedHeader = styled.div`
  ${({ theme }) => `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: ${theme.sizeUnit}px;
  `}
`;

const SelectedTags = styled.div`
  ${({ theme }) => `
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.sizeUnit}px;
  `}
`;

const YearSelector = styled.div`
  ${({ theme }) => `
    margin-bottom: ${theme.sizeUnit * 2}px;
    display: flex;
    align-items: center;
    gap: ${theme.sizeUnit * 2}px;
    flex-wrap: wrap;
  `}
`;

const NavigationButtons = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const LoadingContainer = styled.div`
  ${({ theme }) => `
    padding: ${theme.sizeUnit * 4}px;
    text-align: center;
  `}
`;

const EmptyMessage = styled.div`
  ${({ theme }) => `
    text-align: center;
    padding: ${theme.sizeUnit * 3}px;
    color: ${theme.colorTextSecondary};
  `}
`;

interface Period {
  id: string;
  displayName: string;
  type: string;
}

interface PeriodSelectorProps {
  databaseId: number;
  value: string[];
  onChange: (periods: string[]) => void;
}

// Relative periods organized by category (matching DHIS2 standard)
const RELATIVE_PERIODS = {
  days: [
    { id: 'TODAY', displayName: 'Today' },
    { id: 'YESTERDAY', displayName: 'Yesterday' },
    { id: 'LAST_3_DAYS', displayName: 'Last 3 days' },
    { id: 'LAST_7_DAYS', displayName: 'Last 7 days' },
    { id: 'LAST_14_DAYS', displayName: 'Last 14 days' },
    { id: 'LAST_30_DAYS', displayName: 'Last 30 days' },
    { id: 'LAST_60_DAYS', displayName: 'Last 60 days' },
    { id: 'LAST_90_DAYS', displayName: 'Last 90 days' },
    { id: 'LAST_180_DAYS', displayName: 'Last 180 days' },
  ],
  weeks: [
    { id: 'THIS_WEEK', displayName: 'This week' },
    { id: 'LAST_WEEK', displayName: 'Last week' },
    { id: 'LAST_4_WEEKS', displayName: 'Last 4 weeks' },
    { id: 'LAST_12_WEEKS', displayName: 'Last 12 weeks' },
    { id: 'LAST_52_WEEKS', displayName: 'Last 52 weeks' },
  ],
  biWeeks: [
    { id: 'THIS_BIWEEK', displayName: 'This bi-week' },
    { id: 'LAST_BIWEEK', displayName: 'Last bi-week' },
    { id: 'LAST_4_BIWEEKS', displayName: 'Last 4 bi-weeks' },
  ],
  months: [
    { id: 'THIS_MONTH', displayName: 'This month' },
    { id: 'LAST_MONTH', displayName: 'Last month' },
    { id: 'LAST_3_MONTHS', displayName: 'Last 3 months' },
    { id: 'LAST_6_MONTHS', displayName: 'Last 6 months' },
    { id: 'LAST_12_MONTHS', displayName: 'Last 12 months' },
    { id: 'MONTHS_THIS_YEAR', displayName: 'Months this year' },
  ],
  biMonths: [
    { id: 'THIS_BIMONTH', displayName: 'This bi-month' },
    { id: 'LAST_BIMONTH', displayName: 'Last bi-month' },
    { id: 'LAST_6_BIMONTHS', displayName: 'Last 6 bi-months' },
  ],
  quarters: [
    { id: 'THIS_QUARTER', displayName: 'This quarter' },
    { id: 'LAST_QUARTER', displayName: 'Last quarter' },
    { id: 'LAST_4_QUARTERS', displayName: 'Last 4 quarters' },
    { id: 'QUARTERS_THIS_YEAR', displayName: 'Quarters this year' },
  ],
  sixMonths: [
    { id: 'THIS_SIX_MONTH', displayName: 'This six-month' },
    { id: 'LAST_SIX_MONTH', displayName: 'Last six-month' },
    { id: 'LAST_2_SIXMONTHS', displayName: 'Last 2 six-months' },
  ],
  financialYears: [
    { id: 'THIS_FINANCIAL_YEAR', displayName: 'This financial year' },
    { id: 'LAST_FINANCIAL_YEAR', displayName: 'Last financial year' },
    { id: 'LAST_5_FINANCIAL_YEARS', displayName: 'Last 5 financial years' },
  ],
  years: [
    { id: 'THIS_YEAR', displayName: 'This year' },
    { id: 'LAST_YEAR', displayName: 'Last year' },
    { id: 'LAST_5_YEARS', displayName: 'Last 5 years' },
    { id: 'LAST_10_YEARS', displayName: 'Last 10 years' },
  ],
};

// Fixed period types
const FIXED_PERIOD_TYPES = [
  { value: 'YEARLY', label: 'Yearly' },
  { value: 'FINANCIAL_YEAR_JULY', label: 'Financial year (July)' },
  { value: 'FINANCIAL_YEAR_APRIL', label: 'Financial year (April)' },
  { value: 'FINANCIAL_YEAR_OCT', label: 'Financial year (October)' },
  { value: 'SIX_MONTHLY', label: 'Six-monthly' },
  { value: 'SIX_MONTHLY_APRIL', label: 'Six-monthly (April)' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'BI_MONTHLY', label: 'Bi-monthly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'DAILY', label: 'Daily' },
];

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const QUARTER_NAMES = ['Q1', 'Q2', 'Q3', 'Q4'];

/**
 * Generate fixed periods based on type and year (client-side)
 * Following DHIS2 standard period formats:
 * https://docs.dhis2.org/archive/en/2.25/developer/html/webapi_date_perid_format.html
 *
 * Format Examples:
 * - Daily: yyyyMMdd (20111231)
 * - Weekly: yyyyWn (2011W1, 2011W52)
 * - Monthly: yyyyMM (201101)
 * - Bi-monthly: yyyyMMB (201101B for Jan-Feb)
 * - Quarterly: yyyyQn (2011Q1)
 * - Six-monthly: yyyySn (2011S1)
 * - Six-monthly April: yyyyAprilSn (2011AprilS1)
 * - Yearly: yyyy (2011)
 * - Financial Year April: yyyyApril (2011April)
 * - Financial Year July: yyyyJuly (2011July)
 * - Financial Year Oct: yyyyOct (2011Oct)
 */
function generateFixedPeriods(periodType: string, year: number): Period[] {
  const periods: Period[] = [];

  switch (periodType) {
    case 'YEARLY':
      // Format: yyyy (e.g., 2011)
      for (let y = year - 4; y <= year + 5; y += 1) {
        periods.push({ id: String(y), displayName: String(y), type: 'YEARLY' });
      }
      break;

    case 'MONTHLY':
      // Format: yyyyMM (e.g., 201101 for January 2011)
      for (let m = 1; m <= 12; m += 1) {
        const monthStr = String(m).padStart(2, '0');
        periods.push({
          id: `${year}${monthStr}`,
          displayName: `${MONTH_NAMES[m - 1]} ${year}`,
          type: 'MONTHLY',
        });
      }
      break;

    case 'QUARTERLY':
      // Format: yyyyQn (e.g., 2011Q1)
      for (let q = 1; q <= 4; q += 1) {
        periods.push({
          id: `${year}Q${q}`,
          displayName: `${year} ${QUARTER_NAMES[q - 1]}`,
          type: 'QUARTERLY',
        });
      }
      break;

    case 'SIX_MONTHLY':
      // Format: yyyySn (e.g., 2011S1 for Jan-Jun, 2011S2 for Jul-Dec)
      periods.push({
        id: `${year}S1`,
        displayName: `January - June ${year}`,
        type: 'SIX_MONTHLY',
      });
      periods.push({
        id: `${year}S2`,
        displayName: `July - December ${year}`,
        type: 'SIX_MONTHLY',
      });
      break;

    case 'SIX_MONTHLY_APRIL':
      // Format: yyyyAprilSn (e.g., 2011AprilS1 for Apr-Sep)
      periods.push({
        id: `${year}AprilS1`,
        displayName: `April - September ${year}`,
        type: 'SIX_MONTHLY_APRIL',
      });
      periods.push({
        id: `${year}AprilS2`,
        displayName: `October ${year} - March ${year + 1}`,
        type: 'SIX_MONTHLY_APRIL',
      });
      break;

    case 'BI_MONTHLY': {
      // Format: yyyyMMB where MM is the starting month (e.g., 201101B for Jan-Feb)
      const biMonthlyInfo = [
        { startMonth: '01', name: 'January - February' },
        { startMonth: '03', name: 'March - April' },
        { startMonth: '05', name: 'May - June' },
        { startMonth: '07', name: 'July - August' },
        { startMonth: '09', name: 'September - October' },
        { startMonth: '11', name: 'November - December' },
      ];
      for (let bm = 0; bm < 6; bm += 1) {
        periods.push({
          id: `${year}${biMonthlyInfo[bm].startMonth}B`,
          displayName: `${biMonthlyInfo[bm].name} ${year}`,
          type: 'BI_MONTHLY',
        });
      }
      break;
    }

    case 'WEEKLY':
      // Format: yyyyWn (e.g., 2011W1, 2011W52)
      // Note: Week numbers are NOT zero-padded in DHIS2 standard format
      for (let w = 1; w <= 52; w += 1) {
        periods.push({
          id: `${year}W${w}`,
          displayName: `${year} Week ${w}`,
          type: 'WEEKLY',
        });
      }
      break;

    case 'FINANCIAL_YEAR_JULY':
      // Format: yyyyJuly (e.g., 2011July for July 2011 - June 2012)
      for (let y = year - 4; y <= year + 5; y += 1) {
        periods.push({
          id: `${y}July`,
          displayName: `July ${y} - June ${y + 1}`,
          type: 'FINANCIAL_YEAR_JULY',
        });
      }
      break;

    case 'FINANCIAL_YEAR_APRIL':
      // Format: yyyyApril (e.g., 2011April for April 2011 - March 2012)
      for (let y = year - 4; y <= year + 5; y += 1) {
        periods.push({
          id: `${y}April`,
          displayName: `April ${y} - March ${y + 1}`,
          type: 'FINANCIAL_YEAR_APRIL',
        });
      }
      break;

    case 'FINANCIAL_YEAR_OCT':
      // Format: yyyyOct (e.g., 2011Oct for October 2011 - September 2012)
      for (let y = year - 4; y <= year + 5; y += 1) {
        periods.push({
          id: `${y}Oct`,
          displayName: `October ${y} - September ${y + 1}`,
          type: 'FINANCIAL_YEAR_OCT',
        });
      }
      break;

    case 'DAILY':
      // Format: yyyyMMdd (e.g., 20110101)
      // Generate all days for January of selected year
      for (let d = 1; d <= 31; d += 1) {
        const dayStr = String(d).padStart(2, '0');
        periods.push({
          id: `${year}01${dayStr}`,
          displayName: `January ${d}, ${year}`,
          type: 'DAILY',
        });
      }
      break;

    default:
      break;
  }

  return periods;
}

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  databaseId,
  value = [],
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState<string>('relative');
  const [loading, setLoading] = useState(false);

  // Fixed periods state
  const [fixedPeriodType, setFixedPeriodType] = useState<string>('YEARLY');
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear(),
  );
  const [fixedPeriods, setFixedPeriods] = useState<Period[]>([]);

  // Generate years for selector (last 20 years)
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 20 }, (_, i) => currentYear - i);
  }, []);

  // Fetch fixed periods from backend or generate client-side
  const fetchFixedPeriods = useCallback(async () => {
    setLoading(true);

    // Try to fetch from backend first
    if (databaseId) {
      try {
        const response = await SupersetClient.get({
          endpoint: `/api/v1/database/${databaseId}/dhis2_metadata/?type=periods&periodType=${fixedPeriodType}`,
        });

        if (response.json?.result && response.json.result.length > 0) {
          let periods = response.json.result;
          // Filter by selected year for non-yearly period types
          if (
            ![
              'YEARLY',
              'FINANCIAL_YEAR_JULY',
              'FINANCIAL_YEAR_APRIL',
              'FINANCIAL_YEAR_OCT',
            ].includes(fixedPeriodType)
          ) {
            periods = periods.filter((p: Period) =>
              p.id.startsWith(String(selectedYear)),
            );
          }
          setFixedPeriods(periods);
          setLoading(false);
          return;
        }
      } catch {
        // Fall through to client-side generation
      }
    }

    // Generate periods client-side as fallback
    const generatedPeriods = generateFixedPeriods(
      fixedPeriodType,
      selectedYear,
    );
    setFixedPeriods(generatedPeriods);
    setLoading(false);
  }, [databaseId, fixedPeriodType, selectedYear]);

  // Fetch fixed periods when type or year changes
  useEffect(() => {
    if (activeTab === 'fixed') {
      fetchFixedPeriods();
    }
  }, [activeTab, fixedPeriodType, selectedYear, fetchFixedPeriods]);

  // Toggle period selection
  const handlePeriodToggle = (periodId: string) => {
    if (value.includes(periodId)) {
      onChange(value.filter(p => p !== periodId));
    } else {
      onChange([...value, periodId]);
    }
  };

  // Remove selected period
  const handleRemoveSelected = (periodId: string) => {
    onChange(value.filter(p => p !== periodId));
  };

  // Clear all selections
  const handleClearAll = () => {
    onChange([]);
  };

  // Get display name for a period ID
  const getDisplayName = (periodId: string): string => {
    // Check fixed periods
    const fixedPeriod = fixedPeriods.find(p => p.id === periodId);
    if (fixedPeriod) return fixedPeriod.displayName;

    // Check relative periods
    for (const category of Object.values(RELATIVE_PERIODS)) {
      const relativePeriod = category.find(p => p.id === periodId);
      if (relativePeriod) return relativePeriod.displayName;
    }

    return periodId;
  };

  // Count selections in relative periods
  const getRelativeCount = (): number => {
    const allRelative = Object.values(RELATIVE_PERIODS).flat();
    return value.filter(id => allRelative.some(p => p.id === id)).length;
  };

  // Count selections in fixed periods
  const getFixedCount = (): number =>
    value.filter(id => fixedPeriods.some(p => p.id === id)).length;

  // Helper to render period grid for a category
  const renderPeriodCategory = (
    periods: Array<{ id: string; displayName: string }>,
  ) => (
    <RelativePeriodGrid>
      {periods.map(period => (
        <PeriodItem
          key={period.id}
          selected={value.includes(period.id)}
          onClick={() => handlePeriodToggle(period.id)}
        >
          <Checkbox checked={value.includes(period.id)} />
          {period.displayName}
        </PeriodItem>
      ))}
    </RelativePeriodGrid>
  );

  // Collapse items for antd 5
  const collapseItems: CollapseProps['items'] = [
    {
      key: 'days',
      label: t('Days'),
      children: renderPeriodCategory(RELATIVE_PERIODS.days),
    },
    {
      key: 'weeks',
      label: t('Weeks'),
      children: renderPeriodCategory(RELATIVE_PERIODS.weeks),
    },
    {
      key: 'biWeeks',
      label: t('Bi-weeks'),
      children: renderPeriodCategory(RELATIVE_PERIODS.biWeeks),
    },
    {
      key: 'months',
      label: t('Months'),
      children: renderPeriodCategory(RELATIVE_PERIODS.months),
    },
    {
      key: 'biMonths',
      label: t('Bi-months'),
      children: renderPeriodCategory(RELATIVE_PERIODS.biMonths),
    },
    {
      key: 'quarters',
      label: t('Quarters'),
      children: renderPeriodCategory(RELATIVE_PERIODS.quarters),
    },
    {
      key: 'sixMonths',
      label: t('Six-months'),
      children: renderPeriodCategory(RELATIVE_PERIODS.sixMonths),
    },
    {
      key: 'financialYears',
      label: t('Financial Years'),
      children: renderPeriodCategory(RELATIVE_PERIODS.financialYears),
    },
    {
      key: 'years',
      label: t('Years'),
      children: renderPeriodCategory(RELATIVE_PERIODS.years),
    },
  ];

  // Render relative periods tab content
  const renderRelativePeriods = () => (
    <TabContent>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {t(
          'Select relative periods that automatically adjust based on the current date.',
        )}
      </Text>
      <Collapse
        defaultActiveKey={['months', 'quarters', 'years']}
        items={collapseItems}
      />
    </TabContent>
  );

  // Render fixed periods tab content
  const renderFixedPeriods = () => (
    <TabContent>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {t('Select specific fixed periods by type and year.')}
      </Text>

      <YearSelector>
        <Text strong>{t('Period Type:')}</Text>
        <Select
          style={{ width: 200 }}
          value={fixedPeriodType}
          onChange={(val: string) => setFixedPeriodType(val)}
          options={FIXED_PERIOD_TYPES}
        />

        {![
          'YEARLY',
          'FINANCIAL_YEAR_JULY',
          'FINANCIAL_YEAR_APRIL',
          'FINANCIAL_YEAR_OCT',
        ].includes(fixedPeriodType) && (
          <>
            <Text strong>{t('Year:')}</Text>
            <NavigationButtons>
              <Button
                size="small"
                onClick={() => setSelectedYear(y => y - 1)}
                disabled={selectedYear <= new Date().getFullYear() - 20}
              >
                ← {t('Prev')}
              </Button>
              <Select
                style={{ width: 100 }}
                value={selectedYear}
                onChange={(val: number) => setSelectedYear(val)}
                options={years.map(y => ({ value: y, label: String(y) }))}
              />
              <Button
                size="small"
                onClick={() => setSelectedYear(y => y + 1)}
                disabled={selectedYear >= new Date().getFullYear() + 5}
              >
                {t('Next')} →
              </Button>
            </NavigationButtons>
          </>
        )}
      </YearSelector>

      {loading ? (
        <LoadingContainer>
          <Loading />
          <div style={{ marginTop: 8 }}>{t('Loading periods...')}</div>
        </LoadingContainer>
      ) : fixedPeriods.length === 0 ? (
        <EmptyMessage>
          {t('No periods available for this type and year')}
        </EmptyMessage>
      ) : (
        <PeriodGrid>
          {fixedPeriods.map(period => (
            <PeriodItem
              key={period.id}
              selected={value.includes(period.id)}
              onClick={() => handlePeriodToggle(period.id)}
            >
              <Checkbox checked={value.includes(period.id)} />
              {period.displayName}
            </PeriodItem>
          ))}
        </PeriodGrid>
      )}
    </TabContent>
  );

  const tabItems = [
    {
      key: 'relative',
      label: (
        <Badge count={getRelativeCount()} size="small" offset={[8, 0]}>
          <span style={{ paddingRight: 12 }}>{t('Relative Periods')}</span>
        </Badge>
      ),
      children: renderRelativePeriods(),
    },
    {
      key: 'fixed',
      label: (
        <Badge count={getFixedCount()} size="small" offset={[8, 0]}>
          <span style={{ paddingRight: 12 }}>{t('Fixed Periods')}</span>
        </Badge>
      ),
      children: renderFixedPeriods(),
    },
  ];

  return (
    <Container>
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      {/* Selected periods section */}
      {value.length > 0 && (
        <SelectedSection>
          <SelectedHeader>
            <Text strong>
              {t('Selected')} ({value.length})
            </Text>
            <Tag
              style={{ cursor: 'pointer' }}
              onClick={handleClearAll}
              color="error"
            >
              {t('Clear All')}
            </Tag>
          </SelectedHeader>
          <SelectedTags>
            {value.map(periodId => (
              <Tag
                key={periodId}
                closable
                onClose={() => handleRemoveSelected(periodId)}
              >
                📅 {getDisplayName(periodId)}
              </Tag>
            ))}
          </SelectedTags>
        </SelectedSection>
      )}
    </Container>
  );
};

export default PeriodSelector;
