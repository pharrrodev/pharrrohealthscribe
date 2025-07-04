
export interface Demographics {
  name: string;
  dob: string;
  nhs_number: string;
}

export interface LabResult {
  test: string;
  value: string;
  status: string;
}

export interface MedicationChange {
  medication: string;
  dose: string;
  frequency: string;
  status: string;
}

export interface Patient {
  id: string;
  demographics: Demographics;
  admission_reason: string;
  clinical_notes: string;
  lab_results: LabResult[];
  medication_changes: MedicationChange[];
}

export type AuditLogStatus = 'pending' | 'in_progress' | 'completed' | 'error' | 'human_input';

export interface AuditLogEntry {
  step: string;
  status: AuditLogStatus;
  details: string;
  timestamp: string;
}

export type AgentStatus = 'idle' | 'running' | 'awaiting_approval' | 'editing' | 'finished' | 'error';

export interface AgentState {
  patientId: string | null;
  patientData: Patient | null;
  synthesizedNotes: string;
  draftSummary: string;
  finalSummary: string;
  auditLog: AuditLogEntry[];
  status: AgentStatus;
  error: string | null;
  editRequest: string;
}