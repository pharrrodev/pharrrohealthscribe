import React, { useState, useEffect, useCallback } from 'react';
import PatientSelector from './components/PatientSelector';
import WorkflowTracker from './components/WorkflowTracker';
import SummaryDisplay from './components/SummaryDisplay';
import { getPatientData } from './data/patientData';
import { synthesizeClinicalData, generateDraftSummary } from './services/geminiService';
import type { AgentState, AuditLogEntry, Patient } from './types';

const INITIAL_STATE: AgentState = {
  patientId: null,
  patientData: null,
  synthesizedNotes: '',
  draftSummary: '',
  finalSummary: '',
  auditLog: [],
  status: 'idle',
  error: null,
  editRequest: '',
};

const ALL_WORKFLOW_STEPS = [
    'Start Workflow',
    'Retrieve Patient Data',
    'Synthesize Clinical Notes',
    'Generate Draft Summary',
    'Human Review',
    'Finalize Summary',
    'Workflow Complete'
];

const App: React.FC = () => {
  const [state, setState] = useState<AgentState>(INITIAL_STATE);

  const addAuditLog = useCallback((step: string, details: string, status: AuditLogEntry['status'] = 'completed') => {
    setState(prevState => ({
      ...prevState,
      auditLog: [...prevState.auditLog, {
        step,
        details,
        status,
        timestamp: new Date().toLocaleTimeString()
      }]
    }));
  }, []);

  const updateAuditLogStatus = useCallback((stepName: string, status: AuditLogEntry['status'], details?: string) => {
    setState(prevState => ({
        ...prevState,
        auditLog: prevState.auditLog.map(log => 
            log.step === stepName ? { ...log, status, details: details || log.details } : log
        )
    }));
  }, []);

  const handlePatientSelect = (id: string) => {
    setState({
      ...INITIAL_STATE,
      patientId: id
    });
  }
  
  const handleReset = () => {
    setState(INITIAL_STATE);
  };

  const handleGenerate = () => {
    if (!state.patientId) return;
    setState(prevState => ({ 
        ...INITIAL_STATE,
        patientId: prevState.patientId,
        status: 'running' 
    }));
  };

  const handleApprove = () => {
    updateAuditLogStatus('Human Review', 'completed', 'Clinician approved the draft summary.');
    setState(prevState => ({ ...prevState, status: 'running' }));
  };

  const handleRequestEdits = (editRequest: string) => {
    // Find the original 'Human Review' log and update it.
    const editLogDetails = `Clinician requested edits: "${editRequest}"`;
    setState(prevState => ({
        ...prevState,
        auditLog: prevState.auditLog.map(log => log.step === 'Human Review' ? {...log, status: 'completed', details: editLogDetails} : log),
        status: 'editing', 
        editRequest
    }));
  };

  useEffect(() => {
    const runWorkflow = async () => {
      // Step 1: Start & Retrieve Data
      if (state.status === 'running' && state.auditLog.length === 0 && state.patientId) {
        addAuditLog('Start Workflow', `Initiating summary generation for patient: ${state.patientId}`, 'in_progress');
        await new Promise(res => setTimeout(res, 500));
        
        addAuditLog('Retrieve Patient Data', 'Fetching patient record from database.', 'in_progress');
        const data: Patient | null = getPatientData(state.patientId);
        await new Promise(res => setTimeout(res, 1000));

        if (data) {
          updateAuditLogStatus('Start Workflow', 'completed');
          updateAuditLogStatus('Retrieve Patient Data', 'completed', `Successfully fetched data for ${data.demographics.name}.`);
          setState(prevState => ({ ...prevState, patientData: data }));
        } else {
          const errorMsg = `Patient ID ${state.patientId} not found.`;
          updateAuditLogStatus('Retrieve Patient Data', 'error', errorMsg);
          setState(prevState => ({ ...prevState, status: 'error', error: errorMsg }));
        }
        return;
      }
      
      // Step 2: Synthesize Notes
      if (state.status === 'running' && state.patientData && !state.synthesizedNotes) {
        addAuditLog('Synthesize Clinical Notes', 'Using Gemini to synthesize patient data.', 'in_progress');
        try {
          const notes = await synthesizeClinicalData(state.patientData);
          updateAuditLogStatus('Synthesize Clinical Notes', 'completed', 'Synthesis complete.');
          setState(prevState => ({ ...prevState, synthesizedNotes: notes }));
        } catch (e: any) {
          updateAuditLogStatus('Synthesize Clinical Notes', 'error', e.message);
          setState(prevState => ({ ...prevState, status: 'error', error: e.message }));
        }
        return;
      }

      // Step 3: Generate or Regenerate Draft Summary
      if ((state.status === 'running' && state.synthesizedNotes && !state.draftSummary) || state.status === 'editing') {
          const isEditing = state.status === 'editing';
          const stepName = isEditing ? 'Regenerate Draft' : 'Generate Draft Summary';

          // Add a new log entry for regeneration
          if (isEditing) {
            addAuditLog(stepName, 'Applying requested edits and regenerating summary.', 'in_progress');
            setState(prevState => ({...prevState, status: 'running'}));
          } else {
            addAuditLog(stepName, 'Using Gemini to create draft summary.', 'in_progress');
          }
          
          try {
              const draft = await generateDraftSummary(state.synthesizedNotes, state.patientData!, state.editRequest);
              updateAuditLogStatus(stepName, 'completed', 'Draft generated. Awaiting human review.');
              addAuditLog('Human Review', 'Waiting for clinician approval.', 'human_input');
              setState(prevState => ({ ...prevState, draftSummary: draft, status: 'awaiting_approval', editRequest: '' }));
          } catch (e: any) {
              updateAuditLogStatus(stepName, 'error', e.message);
              setState(prevState => ({ ...prevState, status: 'error', error: e.message }));
          }
          return;
      }

      // Step 4: Finalize
      if (state.status === 'running' && state.draftSummary && !state.finalSummary) {
          addAuditLog('Finalize Summary', 'Finalizing the document.', 'in_progress');
          await new Promise(res => setTimeout(res, 500));
          updateAuditLogStatus('Finalize Summary', 'completed', 'Discharge summary is complete.');
          addAuditLog('Workflow Complete', 'Process finished successfully.', 'completed');
          setState(prevState => ({ ...prevState, finalSummary: prevState.draftSummary, status: 'finished' }));
      }
    };

    runWorkflow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.patientId, state.patientData, state.synthesizedNotes, state.draftSummary]);


  return (
    <main className="bg-slate-100 min-h-screen p-4 sm:p-6 lg:p-8 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900">Pharrro Health Scribe</h1>
          <p className="text-lg text-slate-600 mt-1">Simulated Agentic Workflow for Discharge Summaries</p>
        </header>
        <div className="space-y-8">
          <PatientSelector 
            selectedPatientId={state.patientId}
            onPatientSelect={handlePatientSelect}
            onGenerate={handleGenerate}
            onReset={handleReset}
            status={state.status}
          />
          {state.error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative" role="alert">
              <strong className="font-bold">Error: </strong>
              <span className="block sm:inline">{state.error}</span>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <WorkflowTracker auditLog={state.auditLog} allSteps={ALL_WORKFLOW_STEPS} />
            <SummaryDisplay 
              status={state.status}
              draftSummary={state.draftSummary}
              finalSummary={state.finalSummary}
              onApprove={handleApprove}
              onRequestEdits={handleRequestEdits}
            />
          </div>
        </div>
        <footer className="text-center mt-12 text-slate-500 text-sm">
          <p>Pharrro Health Scribe (Simulated MVP) v0.1 | Powered by Gemini API</p>
        </footer>
      </div>
    </main>
  );
};

export default App;