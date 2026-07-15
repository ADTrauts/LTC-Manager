export type TemplateItemView = {
  id: string;
  roleKey: string;
  roleLabel: string;
  unitId: string | null;
  unitName: string | null;
  startsAtLocal: string | null;
  endsAtLocal: string | null;
  requiredCount: number;
  sortOrder: number;
  notes: string | null;
};

export type TemplateView = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  departmentId: string;
  departmentKey: string;
  operationDefinitionId: string | null;
  operationLabel: string | null;
  workShiftId: string | null;
  workShiftName: string | null;
  items: TemplateItemView[];
  totalPositions: number;
};

export type TemplatePreviewPosition = {
  itemId: string;
  roleKey: string;
  roleLabel: string;
  unitId: string | null;
  unitName: string | null;
  startsAtLocal: string | null;
  endsAtLocal: string | null;
  notes: string | null;
  positionIndex: number;
  assignedEmployeeId: string | null;
  assignedEmployeeName: string | null;
  existingAssignmentId: string | null;
  suggestedEmployeeId: string | null;
  suggestedEmployeeName: string | null;
  suggestedReason: string | null;
};

export type TemplatePreview = {
  templateId: string;
  templateName: string;
  serviceDate: string;
  operationInstanceId: string | null;
  operationLabel: string | null;
  positions: TemplatePreviewPosition[];
  totalRequired: number;
  alreadyFilled: number;
  unfilled: number;
  warnings: string[];
};

export type ApplyTemplateResult = {
  created: number;
  skipped: number;
  warnings: string[];
};
