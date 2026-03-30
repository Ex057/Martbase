import { useEffect, useMemo, useRef, useState } from 'react';
import { styled, t } from '@superset-ui/core';
import { Alert, Select, Tag, Typography } from '@superset-ui/core/components';

import type { DHIS2Instance } from 'src/features/dhis2/types';
import type {
  DHIS2WizardState,
  LevelMappingConfig,
} from 'src/features/datasets/AddDataset/DHIS2DatasetWizard';
import WizardStepOrgUnits, {
  OrgUnit,
  OrgUnitGroup,
  OrgUnitGroupSet,
  StepOrgUnitsMetadataPayload,
} from 'src/features/datasets/AddDataset/DHIS2DatasetWizard/steps/StepOrgUnits';
import type {
  DatabaseRepositoryEnabledDimensions,
  DatabaseObject,
  DatabaseRepositoryOrgUnitConfig,
  RepositoryDimensionSourceRef,
  RepositoryDataScope,
  RepositoryEnabledGroupDimension,
  RepositoryEnabledGroupSetDimension,
  RepositoryEnabledLevelDimension,
  RepositoryOrgUnitDetail,
  RepositoryOrgUnitRecord,
  RepositoryReportingUnitApproach,
  RepositorySeparateInstanceConfig,
} from '../types';
import { resolveRepositoryOrgUnits } from './repositoryOrgUnits';

const { Paragraph, Text } = Typography;

const DEFAULT_SCHEDULE = {
  preset: 'daily',
  cron: '0 5 * * *',
  timezone: 'UTC',
} as const;

const USER_SCOPE_IDS = new Set([
  'USER_ORGUNIT',
  'USER_ORGUNIT_CHILDREN',
  'USER_ORGUNIT_GRANDCHILDREN',
]);

const SELECT_DROPDOWN_STYLE = {
  maxHeight: 320,
  overflow: 'auto' as const,
};

const StepContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 28px;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
`;

const SectionBlock = styled.section`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const SummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 24px;
  row-gap: 20px;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`;

const SummaryItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`;

const InstanceSections = styled.div`
  display: flex;
  flex-direction: column;
  gap: 28px;
`;

const InstanceSection = styled.section`
  ${({ theme }) => `
    display: flex;
    flex-direction: column;
    gap: ${theme.sizeUnit * 2}px;

    & + & {
      padding-top: ${theme.sizeUnit * 4}px;
      border-top: 1px solid ${theme.colorBorderSecondary};
    }
  `}
`;

const InlineFieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
`;

const FieldStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 720px;

  > div {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
`;

const DimensionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;

  @media (max-width: 1100px) {
    grid-template-columns: 1fr;
  }
`;

const DimensionField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

type RepositorySummary = NonNullable<
  DatabaseObject['repository_org_unit_summary']
>;

const REPOSITORY_APPROACH_OPTIONS: Array<{
  value: RepositoryReportingUnitApproach;
  label: string;
  description: string;
}> = [
  {
    value: 'primary_instance',
    label: t('Use a primary instance'),
    description: t(
      'Use one configured DHIS2 instance as the repository hierarchy source.',
    ),
  },
  {
    value: 'map_merge',
    label: t('Map and merge reporting units'),
    description: t(
      'Map equivalent levels and merge them into one repository hierarchy.',
    ),
  },
  {
    value: 'auto_merge',
    label: t('Auto merge reporting units'),
    description: t(
      'Automatically merge compatible levels and keep exceptions available for review.',
    ),
  },
  {
    value: 'separate',
    label: t('Keep reporting units separate'),
    description: t(
      'Keep each instance hierarchy separate with source-specific lineage.',
    ),
  },
];

export interface RepositoryReportingUnitsStepValue {
  repository_reporting_unit_approach: RepositoryReportingUnitApproach | null;
  lowest_data_level_to_use: number | null;
  primary_instance_id: number | null;
  repository_data_scope: RepositoryDataScope | null;
  repository_org_unit_config: DatabaseRepositoryOrgUnitConfig | null;
  repository_org_units: RepositoryOrgUnitRecord[];
  repository_org_unit_summary: RepositorySummary;
  validationError: string | null;
}

interface DHIS2RepositoryReportingUnitsStepProps {
  databaseId?: number;
  instances: DHIS2Instance[];
  initialValue?: Partial<RepositoryReportingUnitsStepValue> | null;
  onChange: (value: RepositoryReportingUnitsStepValue) => void;
}

function getDefaultApproach(
  activeInstances: DHIS2Instance[],
): RepositoryReportingUnitApproach {
  return activeInstances.length <= 1 ? 'primary_instance' : 'auto_merge';
}

function resolveInitialApproach(
  activeInstances: DHIS2Instance[],
  initialValue?: Partial<RepositoryReportingUnitsStepValue> | null,
): RepositoryReportingUnitApproach {
  return (
    initialValue?.repository_reporting_unit_approach ||
    getDefaultApproach(activeInstances)
  );
}

function buildEmptyWizardState(
  selectedInstanceIds: number[],
): DHIS2WizardState {
  return {
    datasetName: '',
    description: '',
    selectedInstanceIds,
    orgUnitSourceMode:
      selectedInstanceIds.length > 1 ? 'repository' : 'primary',
    primaryOrgUnitInstanceId: selectedInstanceIds[0] ?? null,
    variableMappings: [],
    dataElements: [],
    periods: [],
    orgUnits: [],
    orgUnitsAutoDetect: false,
    selectedOrgUnitDetails: [],
    includeChildren: false,
    dataLevelScope: 'selected',
    maxOrgUnitLevel: null,
    columns: [],
    previewData: [],
    levelMapping: undefined,
    includeDisaggregationDimension: false,
    scheduleConfig: { ...DEFAULT_SCHEDULE },
  };
}

function sanitizeSelectionKeys(selectionKeys: string[] = []): string[] {
  return selectionKeys.filter(key => !USER_SCOPE_IDS.has(key));
}

function buildSharedWizardState(
  activeInstances: DHIS2Instance[],
  initialValue?: Partial<RepositoryReportingUnitsStepValue> | null,
): DHIS2WizardState {
  const selectedInstanceIds = activeInstances.map(instance => instance.id);
  const wizardState = buildEmptyWizardState(selectedInstanceIds);
  const config = initialValue?.repository_org_unit_config || null;
  const scope =
    initialValue?.repository_data_scope || ('selected' as RepositoryDataScope);
  const approach =
    initialValue?.repository_reporting_unit_approach ||
    getDefaultApproach(activeInstances);
  const effectiveScope = approach === 'map_merge' ? 'all_levels' : scope;

  return {
    ...wizardState,
    orgUnitSourceMode:
      approach === 'primary_instance' ? 'primary' : 'repository',
    primaryOrgUnitInstanceId:
      initialValue?.primary_instance_id ?? selectedInstanceIds[0] ?? null,
    orgUnits: sanitizeSelectionKeys(config?.selected_org_units || []),
    selectedOrgUnitDetails: (config?.selected_org_unit_details || []) as
      | DHIS2WizardState['selectedOrgUnitDetails']
      | undefined,
    dataLevelScope: effectiveScope,
    includeChildren: !['selected', 'ancestors'].includes(effectiveScope),
    maxOrgUnitLevel: initialValue?.lowest_data_level_to_use ?? null,
    levelMapping:
      (config?.level_mapping as LevelMappingConfig | null) || undefined,
  };
}

function buildSeparateWizardStates(
  activeInstances: DHIS2Instance[],
  initialValue?: Partial<RepositoryReportingUnitsStepValue> | null,
): Record<number, DHIS2WizardState> {
  const config = initialValue?.repository_org_unit_config || null;
  const separateConfigs = new Map(
    (config?.separate_instance_configs || []).map(item => [
      item.instance_id,
      item,
    ]),
  );

  return Object.fromEntries(
    activeInstances.map(instance => {
      const instanceConfig = separateConfigs.get(instance.id);
      const wizardState = buildEmptyWizardState([instance.id]);
      const scope =
        instanceConfig?.data_scope || ('selected' as RepositoryDataScope);
      return [
        instance.id,
        {
          ...wizardState,
          orgUnitSourceMode: 'primary',
          primaryOrgUnitInstanceId: instance.id,
          orgUnits: sanitizeSelectionKeys(
            instanceConfig?.selected_org_units || [],
          ),
          selectedOrgUnitDetails: (instanceConfig?.selected_org_unit_details ||
            []) as DHIS2WizardState['selectedOrgUnitDetails'] | undefined,
          dataLevelScope: scope,
          includeChildren: !['selected', 'ancestors'].includes(scope),
          maxOrgUnitLevel:
            instanceConfig?.lowest_data_level_to_use ??
            initialValue?.lowest_data_level_to_use ??
            null,
        },
      ] as const;
    }),
  );
}

function buildLineageSummary(
  repositoryOrgUnits: RepositoryOrgUnitRecord[],
): RepositorySummary {
  const sourceLineageCounts: Record<string, number> = {};

  repositoryOrgUnits.forEach(record => {
    const label =
      record.source_lineage_label ||
      Array.from(
        new Set(
          record.lineage
            .map(
              lineage =>
                lineage.source_instance_code ||
                (lineage.instance_id != null ? `I${lineage.instance_id}` : ''),
            )
            .filter(Boolean),
        ),
      )
        .sort()
        .join(',');
    if (!label) {
      return;
    }
    sourceLineageCounts[label] = (sourceLineageCounts[label] || 0) + 1;
  });

  return {
    total_repository_org_units: repositoryOrgUnits.length,
    source_lineage_counts: sourceLineageCounts,
    conflicted_count: repositoryOrgUnits.filter(record => record.is_conflicted)
      .length,
    unmatched_count: repositoryOrgUnits.filter(record => record.is_unmatched)
      .length,
  };
}

function formatApproachLabel(
  approach: RepositoryReportingUnitApproach | null | undefined,
): string {
  return (
    REPOSITORY_APPROACH_OPTIONS.find(option => option.value === approach)
      ?.label || t('Not configured')
  );
}

function getApproachDescription(
  approach: RepositoryReportingUnitApproach | null | undefined,
): string {
  return (
    REPOSITORY_APPROACH_OPTIONS.find(option => option.value === approach)
      ?.description ||
    t('Select how the repository reporting unit hierarchy should be built.')
  );
}

function getMappedLowestLevelOptions(
  levelMapping?: LevelMappingConfig | null,
): Array<{ value: string; label: string }> {
  if (!levelMapping?.enabled) {
    return [];
  }
  return levelMapping.rows
    .slice()
    .sort((left, right) => left.merged_level - right.merged_level)
    .map(row => ({
      value: String(row.merged_level),
      label: `${row.label} (Repository level ${row.merged_level})`,
    }))
    .filter(
      (option, index, array) =>
        array.findIndex(item => item.value === option.value) === index,
    );
}

function formatDataScopeLabel(
  scope: RepositoryDataScope | null | undefined,
): string {
  switch (scope) {
    case 'children':
      return t('Include children');
    case 'grandchildren':
      return t('Include grandchildren');
    case 'ancestors':
      return t('Include ancestors');
    case 'all_levels':
      return t('All levels');
    case 'selected':
      return t('Selected units only');
    default:
      return t('Not configured');
  }
}

type RepositoryDimensionOption<TPayload> = {
  key: string;
  label: string;
  value: string;
  payload: TPayload;
};

function normalizeSourceRefs(
  refs: RepositoryDimensionSourceRef[],
): RepositoryDimensionSourceRef[] {
  const merged = new Map<string, RepositoryDimensionSourceRef>();
  refs.forEach(ref => {
    if (typeof ref.instance_id !== 'number') {
      return;
    }
    const key = [
      ref.instance_id,
      ref.source_id || '',
      ref.source_level ?? '',
      (ref.source_group_ids || []).join(','),
    ].join('::');
    const current = merged.get(key);
    if (!current) {
      merged.set(key, {
        instance_id: ref.instance_id,
        source_instance_code: ref.source_instance_code || null,
        source_instance_name: ref.source_instance_name || null,
        source_id: ref.source_id || null,
        source_label: ref.source_label || null,
        source_level: ref.source_level ?? null,
        source_group_ids: Array.from(new Set(ref.source_group_ids || [])),
        source_group_labels: Array.from(new Set(ref.source_group_labels || [])),
      });
      return;
    }
    current.source_group_ids = Array.from(
      new Set([
        ...(current.source_group_ids || []),
        ...(ref.source_group_ids || []),
      ]),
    );
    current.source_group_labels = Array.from(
      new Set([
        ...(current.source_group_labels || []),
        ...(ref.source_group_labels || []),
      ]),
    );
  });
  return Array.from(merged.values()).sort(
    (left, right) => left.instance_id - right.instance_id,
  );
}

function buildLevelDimensionOptions(
  repositoryOrgUnits: RepositoryOrgUnitRecord[],
): RepositoryDimensionOption<RepositoryEnabledLevelDimension>[] {
  const options = new Map<string, RepositoryEnabledLevelDimension>();

  repositoryOrgUnits.forEach(record => {
    if (typeof record.level !== 'number') {
      return;
    }
    const key = `level:${record.level}`;
    const repositoryLevelName =
      (record.lineage || []).find(
        lineage =>
          typeof lineage?.provenance?.repositoryLevelName === 'string' &&
          String(lineage.provenance.repositoryLevelName).trim().length > 0,
      )?.provenance?.repositoryLevelName ||
      record.provenance?.repositoryLevelName;
    const label =
      typeof repositoryLevelName === 'string' && repositoryLevelName.trim()
        ? repositoryLevelName.trim()
        : t('Repository level %s', record.level);
    const refs = (record.lineage || []).map(
      lineage =>
        ({
          instance_id: lineage.instance_id,
          source_instance_code: lineage.source_instance_code || null,
          source_id: lineage.source_org_unit_uid,
          source_label: lineage.source_org_unit_name || null,
          source_level: lineage.source_level ?? null,
        }) satisfies RepositoryDimensionSourceRef,
    );

    const current = options.get(key);
    if (!current) {
      options.set(key, {
        key,
        label,
        repository_level: record.level,
        source_refs: normalizeSourceRefs(refs),
      });
      return;
    }
    current.source_refs = normalizeSourceRefs([
      ...current.source_refs,
      ...refs,
    ]);
  });

  return Array.from(options.values())
    .sort((left, right) => left.repository_level - right.repository_level)
    .map(item => ({
      key: item.key,
      value: item.key,
      label: item.label,
      payload: item,
    }));
}

function buildGroupDimensionOptions(
  metadataPayloads: Array<StepOrgUnitsMetadataPayload | null | undefined>,
): RepositoryDimensionOption<RepositoryEnabledGroupDimension>[] {
  const options = new Map<string, RepositoryEnabledGroupDimension>();

  metadataPayloads.forEach(metadata => {
    (metadata?.orgUnitGroups || []).forEach((group: OrgUnitGroup) => {
      const refs = (group.organisationUnits || []).flatMap(unit =>
        unit.sourceInstanceIds.map(
          instanceId =>
            ({
              instance_id: instanceId,
              source_instance_name:
                unit.sourceInstanceNames[
                  unit.sourceInstanceIds.indexOf(instanceId)
                ] || null,
              source_id: group.id,
              source_label: group.displayName,
            }) satisfies RepositoryDimensionSourceRef,
        ),
      );
      const current = options.get(group.id);
      if (!current) {
        options.set(group.id, {
          key: group.id,
          label: group.displayName,
          source_refs: normalizeSourceRefs(refs),
        });
        return;
      }
      current.source_refs = normalizeSourceRefs([
        ...current.source_refs,
        ...refs,
      ]);
    });
  });

  return Array.from(options.values())
    .sort((left, right) => left.label.localeCompare(right.label))
    .map(item => ({
      key: item.key,
      value: item.key,
      label: item.label,
      payload: item,
    }));
}

function buildGroupSetDimensionOptions(
  metadataPayloads: Array<StepOrgUnitsMetadataPayload | null | undefined>,
): RepositoryDimensionOption<RepositoryEnabledGroupSetDimension>[] {
  const options = new Map<string, RepositoryEnabledGroupSetDimension>();

  metadataPayloads.forEach(metadata => {
    (metadata?.orgUnitGroupSets || []).forEach((groupSet: OrgUnitGroupSet) => {
      const refs = (groupSet.sourceInstanceIds || []).map(
        (instanceId, index) =>
          ({
            instance_id: instanceId,
            source_instance_name: groupSet.sourceInstanceNames?.[index] || null,
            source_id: groupSet.id,
            source_label: groupSet.displayName,
            source_group_ids: (groupSet.organisationUnitGroups || []).map(
              member => member.id,
            ),
            source_group_labels: (groupSet.organisationUnitGroups || []).map(
              member => member.displayName,
            ),
          }) satisfies RepositoryDimensionSourceRef,
      );
      const current = options.get(groupSet.id);
      if (!current) {
        options.set(groupSet.id, {
          key: groupSet.id,
          label: groupSet.displayName,
          member_group_keys: (groupSet.organisationUnitGroups || []).map(
            member => member.id,
          ),
          member_group_labels: (groupSet.organisationUnitGroups || []).map(
            member => member.displayName,
          ),
          source_refs: normalizeSourceRefs(refs),
        });
        return;
      }
      current.member_group_keys = Array.from(
        new Set([
          ...(current.member_group_keys || []),
          ...(groupSet.organisationUnitGroups || []).map(member => member.id),
        ]),
      );
      current.member_group_labels = Array.from(
        new Set([
          ...(current.member_group_labels || []),
          ...(groupSet.organisationUnitGroups || []).map(
            member => member.displayName,
          ),
        ]),
      );
      current.source_refs = normalizeSourceRefs([
        ...current.source_refs,
        ...refs,
      ]);
    });
  });

  return Array.from(options.values())
    .sort((left, right) => left.label.localeCompare(right.label))
    .map(item => ({
      key: item.key,
      value: item.key,
      label: item.label,
      payload: item,
    }));
}

function extractSelectedDimensionKeys<TItem extends { key: string }>(
  items: TItem[] | null | undefined,
): string[] {
  return Array.isArray(items)
    ? items
        .map(item => item?.key)
        .filter(
          (value): value is string =>
            typeof value === 'string' && value.length > 0,
        )
    : [];
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function resolveSelectedDimensions<TItem extends { key: string }>(
  selectedKeys: string[],
  options: RepositoryDimensionOption<TItem>[],
  savedItems: TItem[] | null | undefined,
): TItem[] {
  const optionMap = new Map(
    options.map(option => [option.key, option.payload]),
  );
  const savedMap = new Map(
    (savedItems || []).map(item => [item.key, item] as const),
  );
  return selectedKeys
    .map(key => optionMap.get(key) || savedMap.get(key))
    .filter((value): value is TItem => !!value);
}

function mergePersistedDimensionOptions<
  TItem extends { key: string; label: string },
>(
  options: RepositoryDimensionOption<TItem>[],
  savedItems: TItem[] | null | undefined,
): RepositoryDimensionOption<TItem>[] {
  const merged = new Map<string, RepositoryDimensionOption<TItem>>();
  options.forEach(option => {
    merged.set(option.key, option);
  });
  (savedItems || []).forEach(item => {
    if (!item.key || merged.has(item.key)) {
      return;
    }
    merged.set(item.key, {
      key: item.key,
      value: item.key,
      label: item.label,
      payload: item,
    });
  });
  return Array.from(merged.values());
}

function getRepositoryLevelSortValue(
  option: RepositoryDimensionOption<RepositoryEnabledLevelDimension>,
): number {
  if (typeof option.payload.repository_level === 'number') {
    return option.payload.repository_level;
  }
  const match = option.key.match(/^level:(\d+)$/i);
  return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

function sortLevelDimensionOptionsAscending(
  options: RepositoryDimensionOption<RepositoryEnabledLevelDimension>[],
): RepositoryDimensionOption<RepositoryEnabledLevelDimension>[] {
  return options.slice().sort((left, right) => {
    const leftLevel = getRepositoryLevelSortValue(left);
    const rightLevel = getRepositoryLevelSortValue(right);
    if (leftLevel !== rightLevel) {
      return leftLevel - rightLevel;
    }
    return left.label.localeCompare(right.label);
  });
}

function buildOrgUnitLookup(orgUnits: OrgUnit[]): Map<string, OrgUnit> {
  return new Map(orgUnits.map(unit => [unit.selectionKey, unit] as const));
}

function getScopeDepth(scope: RepositoryDataScope): number | null {
  switch (scope) {
    case 'children':
      return 1;
    case 'grandchildren':
      return 2;
    case 'all_levels':
      return null;
    default:
      return 0;
  }
}

function getAncestorSelectionKeys(
  selectionKey: string,
  lookup: Map<string, OrgUnit>,
): string[] {
  const keys: string[] = [];
  const visited = new Set<string>();
  let current = lookup.get(selectionKey);

  while (current?.parentId && !visited.has(current.parentId)) {
    keys.push(current.parentId);
    visited.add(current.parentId);
    current = lookup.get(current.parentId);
  }

  return keys;
}

function getOrgUnitRelativeDepth(
  ancestor: OrgUnit,
  descendant: OrgUnit,
): number | null {
  if (
    typeof ancestor.level === 'number' &&
    typeof descendant.level === 'number'
  ) {
    return descendant.level - ancestor.level;
  }

  if (!ancestor.path || !descendant.path) {
    return null;
  }

  const ancestorPath = ancestor.path
    .split('/')
    .filter((part: string) => part.length > 0);
  const descendantPath = descendant.path
    .split('/')
    .filter((part: string) => part.length > 0);

  if (descendantPath.length < ancestorPath.length) {
    return null;
  }

  const isAncestorPath = ancestorPath.every(
    (part: string, index: number) => descendantPath[index] === part,
  );

  return isAncestorPath ? descendantPath.length - ancestorPath.length : null;
}

function pruneScopedSelectionKeys(
  selectionKeys: string[],
  orgUnits: OrgUnit[],
  scope: RepositoryDataScope,
): string[] {
  const lookup = buildOrgUnitLookup(orgUnits);
  const uniqueKeys = Array.from(new Set(selectionKeys)).filter(key =>
    lookup.has(key),
  );

  if (!['children', 'grandchildren', 'all_levels'].includes(scope)) {
    return uniqueKeys;
  }

  const maxDepth = getScopeDepth(scope);
  const originalOrder = new Map(uniqueKeys.map((key, index) => [key, index]));
  const kept = new Set<string>();

  uniqueKeys
    .slice()
    .sort((left, right) => {
      const leftUnit = lookup.get(left);
      const rightUnit = lookup.get(right);
      const leftLevel = leftUnit?.level ?? Number.MAX_SAFE_INTEGER;
      const rightLevel = rightUnit?.level ?? Number.MAX_SAFE_INTEGER;

      if (leftLevel !== rightLevel) {
        return leftLevel - rightLevel;
      }

      return (originalOrder.get(left) ?? 0) - (originalOrder.get(right) ?? 0);
    })
    .forEach(selectionKey => {
      const selectedAncestorKey = getAncestorSelectionKeys(
        selectionKey,
        lookup,
      ).find(ancestorKey => kept.has(ancestorKey));

      if (!selectedAncestorKey) {
        kept.add(selectionKey);
        return;
      }

      const ancestorNode = lookup.get(selectedAncestorKey);
      const currentNode = lookup.get(selectionKey);
      const relativeDepth =
        ancestorNode && currentNode
          ? getOrgUnitRelativeDepth(ancestorNode, currentNode)
          : null;

      if (
        maxDepth !== null &&
        relativeDepth !== null &&
        relativeDepth > maxDepth
      ) {
        kept.add(selectionKey);
      }
    });

  return uniqueKeys.filter(key => kept.has(key));
}

function buildRepositorySelectionDetail(
  unit: OrgUnit,
): RepositoryOrgUnitDetail {
  return {
    id: unit.id,
    selectionKey: unit.selectionKey,
    sourceOrgUnitId: unit.sourceOrgUnitId,
    displayName: unit.displayName,
    parentId: unit.parentId,
    level: unit.level,
    path: unit.path,
    sourceInstanceIds: unit.sourceInstanceIds,
    sourceInstanceNames: unit.sourceInstanceNames,
    repositoryLevel: unit.repositoryLevel,
    repositoryLevelName: unit.repositoryLevelName,
    repositoryKey: unit.repositoryKey,
    sourceLineageLabel: unit.sourceLineageLabel,
    strategy: unit.strategy,
    lineage: unit.lineage,
    provenance: unit.provenance,
  };
}

function filterPersistedSelectionDetails(
  selectionKeys: string[],
  details: RepositoryOrgUnitDetail[] | null | undefined,
): RepositoryOrgUnitDetail[] {
  if (!Array.isArray(details) || selectionKeys.length === 0) {
    return [];
  }

  const detailMap = new Map(
    details
      .filter(
        (detail): detail is RepositoryOrgUnitDetail =>
          !!detail &&
          typeof detail === 'object' &&
          typeof detail.id === 'string',
      )
      .map(
        detail =>
          [
            detail.selectionKey || detail.sourceOrgUnitId || detail.id,
            detail,
          ] as const,
      ),
  );

  return selectionKeys
    .map(selectionKey => detailMap.get(selectionKey))
    .filter(
      (detail): detail is RepositoryOrgUnitDetail => detail !== undefined,
    );
}

function normalizeScopedSelections(params: {
  selectionKeys: string[];
  orgUnits: OrgUnit[];
  scope: RepositoryDataScope;
  details?: RepositoryOrgUnitDetail[] | null;
}): {
  selectionKeys: string[];
  details: RepositoryOrgUnitDetail[];
} {
  const { selectionKeys, orgUnits, scope, details } = params;
  const uniqueKeys = Array.from(new Set(selectionKeys));

  if (orgUnits.length === 0) {
    return {
      selectionKeys: uniqueKeys,
      details: filterPersistedSelectionDetails(uniqueKeys, details),
    };
  }

  const prunedSelectionKeys = pruneScopedSelectionKeys(
    uniqueKeys,
    orgUnits,
    scope,
  );
  const lookup = buildOrgUnitLookup(orgUnits);
  const normalizedDetails = prunedSelectionKeys
    .map(selectionKey => lookup.get(selectionKey))
    .filter((unit): unit is OrgUnit => unit !== undefined)
    .map(buildRepositorySelectionDetail);

  return {
    selectionKeys: prunedSelectionKeys,
    details:
      normalizedDetails.length > 0
        ? normalizedDetails
        : filterPersistedSelectionDetails(prunedSelectionKeys, details),
  };
}

function buildStepValue(params: {
  approach: RepositoryReportingUnitApproach;
  sharedWizardState: DHIS2WizardState;
  separateWizardStates: Record<number, DHIS2WizardState>;
  sharedMetadata?: StepOrgUnitsMetadataPayload | null;
  separateMetadata: Record<number, StepOrgUnitsMetadataPayload>;
  autoMerge: NonNullable<DatabaseRepositoryOrgUnitConfig['auto_merge']>;
  enabledDimensions: DatabaseRepositoryEnabledDimensions;
  activeInstances: DHIS2Instance[];
  suppressMissingInstancesValidation?: boolean;
}): RepositoryReportingUnitsStepValue {
  const {
    approach,
    sharedWizardState,
    separateWizardStates,
    sharedMetadata,
    separateMetadata,
    autoMerge,
    enabledDimensions,
    activeInstances,
    suppressMissingInstancesValidation = false,
  } = params;

  const activeInstanceIds = activeInstances.map(instance => instance.id);
  const rawSharedSelectedOrgUnits = sanitizeSelectionKeys(
    sharedWizardState.orgUnits,
  );
  const sharedDataScope =
    (sharedWizardState.dataLevelScope as RepositoryDataScope | undefined) ||
    'selected';
  const effectiveSharedDataScope =
    approach === 'map_merge' ? 'all_levels' : sharedDataScope;
  const primaryInstanceId =
    approach === 'primary_instance'
      ? (sharedWizardState.primaryOrgUnitInstanceId ?? null)
      : null;
  const sharedSelection = normalizeScopedSelections({
    selectionKeys: rawSharedSelectedOrgUnits,
    orgUnits: sharedMetadata?.orgUnits || [],
    scope: effectiveSharedDataScope,
    details: sharedWizardState.selectedOrgUnitDetails as
      | RepositoryOrgUnitDetail[]
      | undefined,
  });
  const sharedSelectedOrgUnits = sharedSelection.selectionKeys;
  const sharedSelectedOrgUnitDetails = sharedSelection.details;

  const separateInstanceConfigs: RepositorySeparateInstanceConfig[] =
    approach === 'separate'
      ? activeInstanceIds.map(instanceId => {
          const state =
            separateWizardStates[instanceId] ||
            buildEmptyWizardState([instanceId]);
          const scopedSelection = normalizeScopedSelections({
            selectionKeys: sanitizeSelectionKeys(state.orgUnits),
            orgUnits: separateMetadata[instanceId]?.orgUnits || [],
            scope:
              (state.dataLevelScope as RepositoryDataScope | undefined) ||
              'selected',
            details: state.selectedOrgUnitDetails as
              | RepositoryOrgUnitDetail[]
              | undefined,
          });
          return {
            instance_id: instanceId,
            data_scope:
              (state.dataLevelScope as RepositoryDataScope | undefined) ||
              'selected',
            lowest_data_level_to_use: state.maxOrgUnitLevel ?? null,
            selected_org_units: scopedSelection.selectionKeys,
            selected_org_unit_details: scopedSelection.details,
          };
        })
      : [];

  const repositoryOrgUnits = resolveRepositoryOrgUnits({
    approach,
    dataScope: effectiveSharedDataScope,
    lowestDataLevelToUse: sharedWizardState.maxOrgUnitLevel ?? null,
    primaryInstanceId,
    sharedSelectedOrgUnits,
    sharedSelectedOrgUnitDetails,
    sharedMetadata: sharedMetadata?.orgUnits || [],
    levelMapping:
      (sharedWizardState.levelMapping as DatabaseRepositoryOrgUnitConfig['level_mapping']) ||
      null,
    autoMerge,
    separateInstanceConfigs,
    separateMetadata: Object.fromEntries(
      Object.entries(separateMetadata).map(([instanceId, metadata]) => [
        Number(instanceId),
        metadata.orgUnits,
      ]),
    ),
  });

  const validationError =
    !suppressMissingInstancesValidation && activeInstances.length === 0
      ? t(
          'Add and activate at least one DHIS2 instance before managing repository reporting units.',
        )
      : approach === 'primary_instance' && primaryInstanceId == null
        ? t(
            'Choose the primary DHIS2 instance that will define the repository hierarchy.',
          )
        : repositoryOrgUnits.length === 0
          ? t(
              'Select reporting units to build the repository hierarchy before continuing.',
            )
          : null;

  const repositoryOrgUnitConfig: DatabaseRepositoryOrgUnitConfig = {
    selected_org_units: sharedSelectedOrgUnits,
    selected_org_unit_details: sharedSelectedOrgUnitDetails,
    level_mapping:
      approach === 'map_merge' || approach === 'auto_merge'
        ? (sharedWizardState.levelMapping as DatabaseRepositoryOrgUnitConfig['level_mapping']) ||
          null
        : null,
    filters: {
      active_instance_ids: activeInstanceIds,
    },
    auto_merge: approach === 'auto_merge' ? autoMerge : null,
    separate_instance_configs:
      approach === 'separate' ? separateInstanceConfigs : [],
    enabled_dimensions: enabledDimensions,
    repository_org_units: repositoryOrgUnits,
  };

  const summary = {
    approach,
    lowest_data_level_to_use:
      approach === 'separate'
        ? null
        : (sharedWizardState.maxOrgUnitLevel ?? null),
    primary_instance_id: primaryInstanceId,
    data_scope: approach === 'separate' ? null : effectiveSharedDataScope,
    enabled_level_dimensions: enabledDimensions.levels?.length || 0,
    enabled_group_dimensions: enabledDimensions.groups?.length || 0,
    enabled_group_set_dimensions: enabledDimensions.group_sets?.length || 0,
    ...buildLineageSummary(repositoryOrgUnits),
  };

  return {
    repository_reporting_unit_approach: approach,
    lowest_data_level_to_use:
      approach === 'separate'
        ? null
        : (sharedWizardState.maxOrgUnitLevel ?? null),
    primary_instance_id: primaryInstanceId,
    repository_data_scope:
      approach === 'separate' ? null : effectiveSharedDataScope,
    repository_org_unit_config: repositoryOrgUnitConfig,
    repository_org_units: repositoryOrgUnits,
    repository_org_unit_summary: summary,
    validationError,
  };
}

export function renderRepositorySummaryLines(
  value: RepositoryReportingUnitsStepValue,
  instances: DHIS2Instance[],
): Array<{ label: string; value: string }> {
  const primaryInstanceName =
    value.primary_instance_id != null
      ? instances.find(instance => instance.id === value.primary_instance_id)
          ?.name || t('Configured connection %s', value.primary_instance_id)
      : t('Not applicable');
  const lineageSummary = Object.entries(
    value.repository_org_unit_summary.source_lineage_counts || {},
  )
    .map(([label, count]) => `${label}: ${count}`)
    .join(' · ');

  return [
    {
      label: t('Repository reporting unit approach'),
      value: formatApproachLabel(value.repository_reporting_unit_approach),
    },
    {
      label: t('Lowest data level to use'),
      value:
        value.lowest_data_level_to_use != null
          ? String(value.lowest_data_level_to_use)
          : value.repository_reporting_unit_approach === 'separate'
            ? t('Configured per instance')
            : t('All available levels'),
    },
    {
      label: t('Primary DHIS2 instance'),
      value: primaryInstanceName,
    },
    {
      label: t('Selected data scope'),
      value:
        value.repository_reporting_unit_approach === 'separate'
          ? t('Configured per instance')
          : value.repository_reporting_unit_approach === 'map_merge'
            ? t('Automatic from mapped hierarchy')
            : formatDataScopeLabel(value.repository_data_scope),
    },
    {
      label: t('Total repository reporting units to store'),
      value: String(
        value.repository_org_unit_summary.total_repository_org_units || 0,
      ),
    },
    {
      label: t('Enabled hierarchy levels'),
      value: String(
        value.repository_org_unit_summary.enabled_level_dimensions || 0,
      ),
    },
    {
      label: t('Enabled org unit groups'),
      value: String(
        value.repository_org_unit_summary.enabled_group_dimensions || 0,
      ),
    },
    {
      label: t('Enabled org unit group sets'),
      value: String(
        value.repository_org_unit_summary.enabled_group_set_dimensions || 0,
      ),
    },
    {
      label: t('Source lineage summary'),
      value: lineageSummary || t('No lineage summary available'),
    },
  ];
}

function buildSelectionDetailFingerprint(
  details: RepositoryOrgUnitDetail[] | null | undefined,
): string[] {
  return (details || []).map(detail =>
    [
      detail.selectionKey || detail.sourceOrgUnitId || detail.id,
      detail.parentId || '',
      detail.level ?? '',
      detail.path || '',
    ].join('::'),
  );
}

function buildEnabledDimensionFingerprint(
  enabledDimensions: DatabaseRepositoryEnabledDimensions | null | undefined,
): {
  levels: string[];
  groups: string[];
  groupSets: string[];
} {
  return {
    levels: (enabledDimensions?.levels || []).map(item => item.key),
    groups: (enabledDimensions?.groups || []).map(item => item.key),
    groupSets: (enabledDimensions?.group_sets || []).map(item => item.key),
  };
}

function buildInitializationFingerprint(params: {
  databaseId?: number;
  activeInstanceIds: number[];
  initialValue?: Partial<RepositoryReportingUnitsStepValue> | null;
}): string {
  const { databaseId, activeInstanceIds, initialValue } = params;
  const config = initialValue?.repository_org_unit_config || null;

  return JSON.stringify({
    databaseId: databaseId || null,
    activeInstanceIds,
    repository_reporting_unit_approach:
      initialValue?.repository_reporting_unit_approach || null,
    lowest_data_level_to_use: initialValue?.lowest_data_level_to_use ?? null,
    primary_instance_id: initialValue?.primary_instance_id ?? null,
    repository_data_scope: initialValue?.repository_data_scope || null,
    selected_org_units: config?.selected_org_units || [],
    selected_org_unit_details: buildSelectionDetailFingerprint(
      config?.selected_org_unit_details as
        | RepositoryOrgUnitDetail[]
        | undefined,
    ),
    level_mapping: config?.level_mapping || null,
    auto_merge: config?.auto_merge || null,
    enabled_dimensions: buildEnabledDimensionFingerprint(
      config?.enabled_dimensions || null,
    ),
    separate_instance_configs: (config?.separate_instance_configs || []).map(
      item => ({
        instance_id: item.instance_id,
        data_scope: item.data_scope,
        lowest_data_level_to_use: item.lowest_data_level_to_use ?? null,
        selected_org_units: item.selected_org_units,
        selected_org_unit_details: buildSelectionDetailFingerprint(
          item.selected_org_unit_details,
        ),
      }),
    ),
  });
}

function areMetadataPayloadsEqual(
  left: StepOrgUnitsMetadataPayload | null | undefined,
  right: StepOrgUnitsMetadataPayload | null | undefined,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.orgUnits === right.orgUnits &&
    left.orgUnitLevels === right.orgUnitLevels &&
    left.orgUnitGroups === right.orgUnitGroups &&
    left.orgUnitGroupSets === right.orgUnitGroupSets &&
    left.instances === right.instances &&
    left.repositoryConfig === right.repositoryConfig &&
    left.repositoryEnabledDimensions === right.repositoryEnabledDimensions &&
    left.repositoryApproach === right.repositoryApproach &&
    left.repositoryDataScope === right.repositoryDataScope &&
    left.repositoryLowestDataLevelToUse === right.repositoryLowestDataLevelToUse
  );
}

export default function DHIS2RepositoryReportingUnitsStep({
  databaseId,
  instances,
  initialValue,
  onChange,
}: DHIS2RepositoryReportingUnitsStepProps) {
  const activeInstances = useMemo(
    () => instances.filter(instance => instance.is_active),
    [instances],
  );
  const waitingForPersistedInstances =
    !!databaseId &&
    instances.length === 0 &&
    !!initialValue?.repository_org_unit_config;
  const [approach, setApproach] = useState<RepositoryReportingUnitApproach>(
    () => resolveInitialApproach(activeInstances, initialValue),
  );
  const [sharedWizardState, setSharedWizardState] = useState<DHIS2WizardState>(
    () => buildSharedWizardState(activeInstances, initialValue),
  );
  const [separateWizardStates, setSeparateWizardStates] = useState<
    Record<number, DHIS2WizardState>
  >(() => buildSeparateWizardStates(activeInstances, initialValue));
  const [sharedMetadata, setSharedMetadata] =
    useState<StepOrgUnitsMetadataPayload | null>(null);
  const [separateMetadata, setSeparateMetadata] = useState<
    Record<number, StepOrgUnitsMetadataPayload>
  >({});
  const [autoMerge, setAutoMerge] = useState<
    NonNullable<DatabaseRepositoryOrgUnitConfig['auto_merge']>
  >(() => ({
    fallback_behavior: 'preserve_unmatched',
    unresolved_conflicts: 'preserve_for_review',
    ...(initialValue?.repository_org_unit_config?.auto_merge || {}),
  }));
  const [enabledLevelKeys, setEnabledLevelKeys] = useState<string[]>(() =>
    extractSelectedDimensionKeys(
      initialValue?.repository_org_unit_config?.enabled_dimensions?.levels,
    ),
  );
  const [enabledGroupKeys, setEnabledGroupKeys] = useState<string[]>(() =>
    extractSelectedDimensionKeys(
      initialValue?.repository_org_unit_config?.enabled_dimensions?.groups,
    ),
  );
  const [enabledGroupSetKeys, setEnabledGroupSetKeys] = useState<string[]>(() =>
    extractSelectedDimensionKeys(
      initialValue?.repository_org_unit_config?.enabled_dimensions?.group_sets,
    ),
  );
  const lastAppliedInitializationRef = useRef<string>('');
  const lastEmittedStepValueRef =
    useRef<RepositoryReportingUnitsStepValue | null>(null);
  const hasPersistedLevelDimensions = Array.isArray(
    initialValue?.repository_org_unit_config?.enabled_dimensions?.levels,
  );
  const hasPersistedGroupDimensions = Array.isArray(
    initialValue?.repository_org_unit_config?.enabled_dimensions?.groups,
  );
  const hasPersistedGroupSetDimensions = Array.isArray(
    initialValue?.repository_org_unit_config?.enabled_dimensions?.group_sets,
  );
  const savedEnabledDimensions =
    initialValue?.repository_org_unit_config?.enabled_dimensions || null;

  const initializationFingerprint = useMemo(
    () =>
      buildInitializationFingerprint({
        databaseId,
        activeInstanceIds: activeInstances.map(instance => instance.id),
        initialValue,
      }),
    [activeInstances, databaseId, initialValue],
  );

  useEffect(() => {
    if (initialValue && initialValue === lastEmittedStepValueRef.current) {
      return;
    }
    if (lastAppliedInitializationRef.current === initializationFingerprint) {
      return;
    }
    lastAppliedInitializationRef.current = initializationFingerprint;
    const nextApproach = resolveInitialApproach(activeInstances, initialValue);
    setApproach(nextApproach);
    setSharedWizardState(buildSharedWizardState(activeInstances, initialValue));
    setSeparateWizardStates(
      buildSeparateWizardStates(activeInstances, initialValue),
    );
    setSharedMetadata(null);
    setSeparateMetadata({});
    setAutoMerge({
      fallback_behavior: 'preserve_unmatched',
      unresolved_conflicts: 'preserve_for_review',
      ...(initialValue?.repository_org_unit_config?.auto_merge || {}),
    });
    setEnabledLevelKeys(
      extractSelectedDimensionKeys(
        initialValue?.repository_org_unit_config?.enabled_dimensions?.levels,
      ),
    );
    setEnabledGroupKeys(
      extractSelectedDimensionKeys(
        initialValue?.repository_org_unit_config?.enabled_dimensions?.groups,
      ),
    );
    setEnabledGroupSetKeys(
      extractSelectedDimensionKeys(
        initialValue?.repository_org_unit_config?.enabled_dimensions
          ?.group_sets,
      ),
    );
  }, [activeInstances, initialValue, initializationFingerprint]);

  useEffect(() => {
    if (waitingForPersistedInstances) {
      return;
    }
    const activeInstanceIds = activeInstances.map(instance => instance.id);
    setSharedWizardState(current => ({
      ...current,
      selectedInstanceIds: activeInstanceIds,
      orgUnitSourceMode:
        approach === 'primary_instance' ? 'primary' : 'repository',
      primaryOrgUnitInstanceId:
        current.primaryOrgUnitInstanceId &&
        activeInstanceIds.includes(current.primaryOrgUnitInstanceId)
          ? current.primaryOrgUnitInstanceId
          : (activeInstanceIds[0] ?? null),
    }));
    setSeparateWizardStates(current =>
      Object.fromEntries(
        activeInstances.map(instance => [
          instance.id,
          {
            ...(current[instance.id] || buildEmptyWizardState([instance.id])),
            selectedInstanceIds: [instance.id],
            orgUnitSourceMode: 'primary',
            primaryOrgUnitInstanceId: instance.id,
          },
        ]),
      ),
    );
  }, [activeInstances, approach, waitingForPersistedInstances]);

  const handleSharedMetadataLoaded = useMemo(
    () => (nextMetadata: StepOrgUnitsMetadataPayload) => {
      setSharedMetadata(current =>
        areMetadataPayloadsEqual(current, nextMetadata)
          ? current
          : nextMetadata,
      );
    },
    [],
  );

  const separateMetadataLoadHandlers = useMemo(
    () =>
      Object.fromEntries(
        activeInstances.map(instance => [
          instance.id,
          (nextMetadata: StepOrgUnitsMetadataPayload) => {
            setSeparateMetadata(current => {
              const existing = current[instance.id];
              if (areMetadataPayloadsEqual(existing, nextMetadata)) {
                return current;
              }
              return {
                ...current,
                [instance.id]: nextMetadata,
              };
            });
          },
        ]),
      ) as Record<number, (nextMetadata: StepOrgUnitsMetadataPayload) => void>,
    [activeInstances],
  );

  const allMetadataPayloads = useMemo(
    () => [sharedMetadata, ...Object.values(separateMetadata)],
    [separateMetadata, sharedMetadata],
  );
  const levelDimensionOptions = useMemo(
    () =>
      buildLevelDimensionOptions(
        resolveRepositoryOrgUnits({
          approach,
          dataScope:
            approach === 'map_merge'
              ? 'all_levels'
              : (sharedWizardState.dataLevelScope as
                  | RepositoryDataScope
                  | undefined) || 'selected',
          lowestDataLevelToUse:
            approach === 'separate'
              ? null
              : (sharedWizardState.maxOrgUnitLevel ?? null),
          primaryInstanceId:
            approach === 'primary_instance'
              ? (sharedWizardState.primaryOrgUnitInstanceId ?? null)
              : null,
          sharedSelectedOrgUnits: sanitizeSelectionKeys(
            sharedWizardState.orgUnits,
          ),
          sharedSelectedOrgUnitDetails:
            sharedWizardState.selectedOrgUnitDetails as DatabaseRepositoryOrgUnitConfig['selected_org_unit_details'],
          sharedMetadata: sharedMetadata?.orgUnits || [],
          levelMapping:
            (sharedWizardState.levelMapping as DatabaseRepositoryOrgUnitConfig['level_mapping']) ||
            null,
          autoMerge,
          separateInstanceConfigs:
            approach === 'separate'
              ? activeInstances.map(instance => {
                  const state =
                    separateWizardStates[instance.id] ||
                    buildEmptyWizardState([instance.id]);
                  return {
                    instance_id: instance.id,
                    data_scope:
                      (state.dataLevelScope as
                        | RepositoryDataScope
                        | undefined) || 'selected',
                    lowest_data_level_to_use: state.maxOrgUnitLevel ?? null,
                    selected_org_units: sanitizeSelectionKeys(state.orgUnits),
                    selected_org_unit_details:
                      (state.selectedOrgUnitDetails as RepositorySeparateInstanceConfig['selected_org_unit_details']) ||
                      [],
                  };
                })
              : [],
          separateMetadata: Object.fromEntries(
            Object.entries(separateMetadata).map(([instanceId, metadata]) => [
              Number(instanceId),
              metadata.orgUnits,
            ]),
          ),
        }),
      ),
    [
      activeInstances,
      approach,
      autoMerge,
      separateMetadata,
      separateWizardStates,
      sharedMetadata,
      sharedWizardState.dataLevelScope,
      sharedWizardState.levelMapping,
      sharedWizardState.maxOrgUnitLevel,
      sharedWizardState.orgUnits,
      sharedWizardState.primaryOrgUnitInstanceId,
      sharedWizardState.selectedOrgUnitDetails,
    ],
  );
  const groupDimensionOptions = useMemo(
    () => buildGroupDimensionOptions(allMetadataPayloads),
    [allMetadataPayloads],
  );
  const groupSetDimensionOptions = useMemo(
    () => buildGroupSetDimensionOptions(allMetadataPayloads),
    [allMetadataPayloads],
  );
  const displayLevelDimensionOptions = useMemo(
    () =>
      sortLevelDimensionOptionsAscending(
        mergePersistedDimensionOptions(
          levelDimensionOptions,
          savedEnabledDimensions?.levels,
        ),
      ),
    [levelDimensionOptions, savedEnabledDimensions?.levels],
  );
  const displayGroupDimensionOptions = useMemo(
    () =>
      mergePersistedDimensionOptions(
        groupDimensionOptions,
        savedEnabledDimensions?.groups,
      ),
    [groupDimensionOptions, savedEnabledDimensions?.groups],
  );
  const displayGroupSetDimensionOptions = useMemo(
    () =>
      mergePersistedDimensionOptions(
        groupSetDimensionOptions,
        savedEnabledDimensions?.group_sets,
      ),
    [groupSetDimensionOptions, savedEnabledDimensions?.group_sets],
  );

  useEffect(() => {
    if (hasPersistedLevelDimensions || levelDimensionOptions.length === 0) {
      return;
    }
    setEnabledLevelKeys(current => {
      const validCurrent = current.filter(key =>
        levelDimensionOptions.some(option => option.key === key),
      );
      const nextKeys =
        validCurrent.length > 0
          ? validCurrent
          : levelDimensionOptions.map(option => option.key);
      return areStringArraysEqual(current, nextKeys) ? current : nextKeys;
    });
  }, [hasPersistedLevelDimensions, levelDimensionOptions]);

  useEffect(() => {
    if (groupDimensionOptions.length === 0) {
      return;
    }
    setEnabledGroupKeys(current => {
      const validCurrent = current.filter(key =>
        groupDimensionOptions.some(option => option.key === key),
      );
      if (hasPersistedGroupDimensions) {
        return areStringArraysEqual(current, validCurrent)
          ? current
          : validCurrent;
      }
      const nextKeys =
        validCurrent.length > 0
          ? validCurrent
          : groupDimensionOptions.map(option => option.key);
      return areStringArraysEqual(current, nextKeys) ? current : nextKeys;
    });
  }, [groupDimensionOptions, hasPersistedGroupDimensions]);

  useEffect(() => {
    if (groupSetDimensionOptions.length === 0) {
      return;
    }
    setEnabledGroupSetKeys(current => {
      const validCurrent = current.filter(key =>
        groupSetDimensionOptions.some(option => option.key === key),
      );
      if (hasPersistedGroupSetDimensions) {
        return areStringArraysEqual(current, validCurrent)
          ? current
          : validCurrent;
      }
      const nextKeys =
        validCurrent.length > 0
          ? validCurrent
          : groupSetDimensionOptions.map(option => option.key);
      return areStringArraysEqual(current, nextKeys) ? current : nextKeys;
    });
  }, [groupSetDimensionOptions, hasPersistedGroupSetDimensions]);

  const enabledDimensions = useMemo<DatabaseRepositoryEnabledDimensions>(
    () => ({
      levels: resolveSelectedDimensions(
        enabledLevelKeys,
        displayLevelDimensionOptions,
        savedEnabledDimensions?.levels,
      ),
      groups: resolveSelectedDimensions(
        enabledGroupKeys,
        displayGroupDimensionOptions,
        savedEnabledDimensions?.groups,
      ),
      group_sets: resolveSelectedDimensions(
        enabledGroupSetKeys,
        displayGroupSetDimensionOptions,
        savedEnabledDimensions?.group_sets,
      ),
    }),
    [
      displayGroupDimensionOptions,
      displayGroupSetDimensionOptions,
      displayLevelDimensionOptions,
      enabledGroupKeys,
      enabledGroupSetKeys,
      enabledLevelKeys,
      savedEnabledDimensions?.group_sets,
      savedEnabledDimensions?.groups,
      savedEnabledDimensions?.levels,
    ],
  );

  const stepValue = useMemo(
    () =>
      buildStepValue({
        approach,
        sharedWizardState,
        separateWizardStates,
        sharedMetadata,
        separateMetadata,
        autoMerge,
        enabledDimensions,
        activeInstances,
        suppressMissingInstancesValidation: waitingForPersistedInstances,
      }),
    [
      activeInstances,
      approach,
      autoMerge,
      enabledDimensions,
      waitingForPersistedInstances,
      separateMetadata,
      separateWizardStates,
      sharedMetadata,
      sharedWizardState,
    ],
  );

  useEffect(() => {
    if (waitingForPersistedInstances) {
      return;
    }
    lastEmittedStepValueRef.current = stepValue;
    onChange(stepValue);
  }, [onChange, stepValue, waitingForPersistedInstances]);

  const summaryLines = useMemo(
    () => renderRepositorySummaryLines(stepValue, activeInstances),
    [activeInstances, stepValue],
  );
  const mappedLowestLevelOptions = useMemo(
    () => getMappedLowestLevelOptions(sharedWizardState.levelMapping),
    [sharedWizardState.levelMapping],
  );
  const mappedLowestLevelValues = useMemo(
    () =>
      mappedLowestLevelOptions.map(option => Number.parseInt(option.value, 10)),
    [mappedLowestLevelOptions],
  );
  const selectedApproachDescription = useMemo(
    () => getApproachDescription(approach),
    [approach],
  );

  useEffect(() => {
    if (approach !== 'map_merge') {
      return;
    }

    const deepestMappedLevel =
      mappedLowestLevelValues.length > 0
        ? Math.max(...mappedLowestLevelValues)
        : null;
    const shouldResetLowestLevel =
      sharedWizardState.maxOrgUnitLevel != null &&
      mappedLowestLevelValues.length > 0 &&
      !mappedLowestLevelValues.includes(sharedWizardState.maxOrgUnitLevel);

    if (
      sharedWizardState.dataLevelScope !== 'all_levels' ||
      sharedWizardState.includeChildren !== true ||
      shouldResetLowestLevel
    ) {
      setSharedWizardState(current => ({
        ...current,
        dataLevelScope: 'all_levels',
        includeChildren: true,
        maxOrgUnitLevel: shouldResetLowestLevel
          ? deepestMappedLevel
          : current.maxOrgUnitLevel,
      }));
    }
  }, [
    approach,
    mappedLowestLevelValues,
    sharedWizardState.dataLevelScope,
    sharedWizardState.includeChildren,
    sharedWizardState.maxOrgUnitLevel,
  ]);

  return (
    <StepContainer>
      <SectionBlock>
        <FieldStack>
          <div>
            <Text strong>
              {t(
                'Choose how the repository reporting unit hierarchy should be built',
              )}
            </Text>
            <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
              {t(
                'Choose the repository reporting unit strategy and the hierarchy that will be stored for reporting.',
              )}
            </Paragraph>
          </div>
          <div>
            <Text strong>{t('Repository reporting unit approach')}</Text>
            <Select
              virtual={false}
              value={approach}
              onChange={value =>
                setApproach(value as RepositoryReportingUnitApproach)
              }
              options={REPOSITORY_APPROACH_OPTIONS.map(option => ({
                value: option.value,
                label: option.label,
              }))}
              styles={{ root: { width: '100%', marginTop: 8 } }}
            />
          </div>
          <Alert
            type="info"
            showIcon
            message={formatApproachLabel(approach)}
            description={selectedApproachDescription}
          />
        </FieldStack>
      </SectionBlock>

      {approach === 'auto_merge' ? (
        <SectionBlock>
          <Text strong>{t('Auto merge review rules')}</Text>
          <Paragraph style={{ marginTop: 8 }}>
            {t(
              'Choose how unmatched units and unresolved conflicts should be handled.',
            )}
          </Paragraph>
          <InlineFieldGrid>
            <div>
              <Text strong>{t('Fallback behavior for unmatched units')}</Text>
              <Select
                virtual={false}
                options={[
                  {
                    value: 'preserve_unmatched',
                    label: t('Preserve unmatched units'),
                  },
                  {
                    value: 'drop_unmatched',
                    label: t('Drop unmatched units'),
                  },
                ]}
                value={autoMerge.fallback_behavior}
                onChange={value =>
                  setAutoMerge(current => ({
                    ...current,
                    fallback_behavior: value as
                      | 'preserve_unmatched'
                      | 'drop_unmatched',
                  }))
                }
                styles={{ root: { width: '100%', marginTop: 8 } }}
              />
            </div>
            <div>
              <Text strong>
                {t('Fallback behavior for unresolved conflicts')}
              </Text>
              <Select
                virtual={false}
                options={[
                  {
                    value: 'preserve_for_review',
                    label: t('Preserve for review'),
                  },
                  {
                    value: 'drop',
                    label: t('Drop unresolved conflicts'),
                  },
                ]}
                value={autoMerge.unresolved_conflicts}
                onChange={value =>
                  setAutoMerge(current => ({
                    ...current,
                    unresolved_conflicts: value as
                      | 'preserve_for_review'
                      | 'drop',
                  }))
                }
                styles={{ root: { width: '100%', marginTop: 8 } }}
              />
            </div>
          </InlineFieldGrid>
        </SectionBlock>
      ) : null}

      {approach === 'separate' ? (
        <InstanceSections>
          <Alert
            type="info"
            showIcon
            message={t(
              'Each configured DHIS2 instance is managed independently',
            )}
            description={t(
              'Configure reporting units for each instance separately. Stored repository units remain source-specific.',
            )}
          />
          {activeInstances.map(instance => (
            <InstanceSection key={instance.id}>
              <Text strong>{instance.name}</Text>
              <Paragraph style={{ marginTop: 8 }}>
                {t(
                  'Choose the reporting units and hierarchy settings for this instance.',
                )}
              </Paragraph>
              <WizardStepOrgUnits
                wizardState={
                  separateWizardStates[instance.id] ||
                  buildEmptyWizardState([instance.id])
                }
                updateState={updates =>
                  setSeparateWizardStates(current => ({
                    ...current,
                    [instance.id]: {
                      ...(current[instance.id] ||
                        buildEmptyWizardState([instance.id])),
                      ...updates,
                    },
                  }))
                }
                errors={{}}
                databaseId={databaseId}
                instances={[instance]}
                hideSourceModeSelector
                forceSourceMode="primary"
                hideAutoDetect
                hideUserScopeOptions
                includeAncestorsScope
                flatSections
                labels={{
                  title: t('Repository reporting units for %s', instance.name),
                  description: t(
                    'Filter and select the reporting units that should remain source-specific for this instance.',
                  ),
                  dataScopeDescription: t(
                    'Choose how far the hierarchy expands from the selected units.',
                  ),
                  lowestDataLevelTitle: t('Lowest data level to use'),
                }}
                onMetadataLoaded={separateMetadataLoadHandlers[instance.id]}
              />
            </InstanceSection>
          ))}
        </InstanceSections>
      ) : (
        <SectionBlock>
          <WizardStepOrgUnits
            wizardState={sharedWizardState}
            updateState={updates =>
              setSharedWizardState(current => ({
                ...current,
                ...updates,
              }))
            }
            errors={{}}
            databaseId={databaseId}
            instances={activeInstances}
            hideSourceModeSelector
            forceSourceMode={
              approach === 'primary_instance' ? 'primary' : 'repository'
            }
            hideAutoDetect
            hideUserScopeOptions
            includeAncestorsScope
            flatSections
            labels={{
              title: t('Repository org unit builder'),
              description:
                approach === 'primary_instance'
                  ? t(
                      'Select the primary DHIS2 instance, then choose the reporting units that define the repository hierarchy.',
                    )
                  : approach === 'map_merge'
                    ? t(
                        'Choose reporting units from the connected instances, then reuse the mapping table to align the merged hierarchy.',
                      )
                    : t(
                        'Choose reporting units from the connected instances, then review the inferred mapping before saving.',
                      ),
              sourcePolicyTitle:
                approach === 'primary_instance'
                  ? t('Primary instance repository builder')
                  : t('Repository org unit builder'),
              sourcePolicyDescription:
                approach === 'primary_instance'
                  ? t(
                      'The selected primary instance defines the repository hierarchy. Source lineage is retained on every saved repository unit.',
                    )
                  : t(
                      'Use the repository mapping controls to review how hierarchy levels align before saving.',
                    ),
              lowestDataLevelTitle: t('Lowest data level to use'),
              dataScopeDescription:
                approach === 'map_merge'
                  ? t(
                      'The mapped hierarchy determines how repository descendants are included.',
                    )
                  : t(
                      'Choose how far the hierarchy expands from the selected units.',
                    ),
              lowestDataLevelDescription:
                approach === 'map_merge'
                  ? t(
                      'Choose the deepest mapped repository level to include. The mapped hierarchy drives descendant inclusion automatically for repository merge mode.',
                    )
                  : undefined,
            }}
            lockedDataScope={approach === 'map_merge' ? 'all_levels' : null}
            dataScopeLockedMessage={
              approach === 'map_merge'
                ? t(
                    'Map and merge follows the mapped hierarchy automatically. Only the lowest data level to use remains editable.',
                  )
                : null
            }
            lowestDataLevelOptions={
              approach === 'map_merge' ? mappedLowestLevelOptions : undefined
            }
            onMetadataLoaded={handleSharedMetadataLoaded}
          />
        </SectionBlock>
      )}

      <SectionBlock>
        <Text strong>{t('Repository data dimensions')}</Text>
        <Paragraph style={{ marginTop: 8, marginBottom: 0 }}>
          {t(
            'Choose which repository levels, org unit groups, and group sets should be exposed as analysis dimensions.',
          )}
        </Paragraph>
        <DimensionGrid>
          <DimensionField>
            <Text strong>{t('Enabled hierarchy levels')}</Text>
            <Select
              mode="multiple"
              virtual={false}
              placeholder={t('Select repository levels')}
              value={enabledLevelKeys}
              onChange={values =>
                setEnabledLevelKeys((values as string[]) || [])
              }
              options={displayLevelDimensionOptions.map(option => ({
                value: option.value,
                label: option.label,
              }))}
              optionFilterProps={['label']}
              dropdownStyle={SELECT_DROPDOWN_STYLE}
              styles={{ root: { width: '100%' } }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(enabledDimensions.levels || []).map(item => (
                <Tag key={item.key} color="blue">
                  {item.label}
                </Tag>
              ))}
            </div>
          </DimensionField>
          <DimensionField>
            <Text strong>{t('Enabled org unit group sets')}</Text>
            <Select
              mode="multiple"
              virtual={false}
              placeholder={t('Select org unit group sets')}
              value={enabledGroupSetKeys}
              onChange={values =>
                setEnabledGroupSetKeys((values as string[]) || [])
              }
              options={displayGroupSetDimensionOptions.map(option => ({
                value: option.value,
                label: option.label,
              }))}
              optionFilterProps={['label']}
              dropdownStyle={SELECT_DROPDOWN_STYLE}
              styles={{ root: { width: '100%' } }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(enabledDimensions.group_sets || []).map(item => (
                <Tag key={item.key} color="gold">
                  {item.label}
                </Tag>
              ))}
            </div>
          </DimensionField>
          <DimensionField>
            <Text strong>{t('Enabled org unit groups')}</Text>
            <Select
              mode="multiple"
              virtual={false}
              placeholder={t('Select org unit groups')}
              value={enabledGroupKeys}
              onChange={values =>
                setEnabledGroupKeys((values as string[]) || [])
              }
              options={displayGroupDimensionOptions.map(option => ({
                value: option.value,
                label: option.label,
              }))}
              optionFilterProps={['label']}
              dropdownStyle={SELECT_DROPDOWN_STYLE}
              styles={{ root: { width: '100%' } }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(enabledDimensions.groups || []).map(item => (
                <Tag key={item.key} color="green">
                  {item.label}
                </Tag>
              ))}
            </div>
          </DimensionField>
        </DimensionGrid>
      </SectionBlock>

      {stepValue.validationError ? (
        <Alert
          type="warning"
          showIcon
          message={t('Repository reporting unit setup needs attention')}
          description={stepValue.validationError}
        />
      ) : null}

      <SectionBlock>
        <Text strong>{t('Repository reporting unit summary')}</Text>
        <Paragraph style={{ marginTop: 8 }}>
          {t(
            'Review the stored hierarchy and source-lineage summary before saving.',
          )}
        </Paragraph>
        <SummaryGrid>
          {summaryLines.map(item => (
            <SummaryItem key={item.label}>
              <Text type="secondary">{item.label}</Text>
              <div style={{ marginTop: 8 }}>
                <Text strong>{item.value}</Text>
              </div>
            </SummaryItem>
          ))}
        </SummaryGrid>
        <div
          style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}
        >
          <Tag color="blue">
            {t(
              'Conflicted repository units: %s',
              stepValue.repository_org_unit_summary.conflicted_count || 0,
            )}
          </Tag>
          <Tag color="gold">
            {t(
              'Unmatched repository units: %s',
              stepValue.repository_org_unit_summary.unmatched_count || 0,
            )}
          </Tag>
        </div>
      </SectionBlock>
    </StepContainer>
  );
}
