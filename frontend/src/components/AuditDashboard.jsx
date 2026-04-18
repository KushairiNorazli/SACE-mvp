import React, { useState } from 'react';
import { Search, CheckCircle, XCircle, BrainCircuit, AlertTriangle, ChevronRight, Loader2 } from 'lucide-react';
import axios from 'axios';

const API_BASE = 'http://localhost:8000';

const AuditDashboard = ({ selectedDocId, documents }) => {
  const [query, setQuery] = useState('Extract the peak battery discharge rate from the performance tables.');
  const [isLoading, setIsLoading] = useState(false);
  const [auditResult, setAuditResult] = useState(null);
  const [sourceImageBase64, setSourceImageBase64] = useState(null);
  const [error, setError] = useState(null);
  
  const [validationStatus, setValidationStatus] = useState(null);
  const [correctedValue, setCorrectedValue] = useState('');

  const handleAnalyze = async () => {
    if (!query) return;
    setIsLoading(true);
    setError(null);
    setValidationStatus(null);
    setCorrectedValue('');
    setAuditResult(null);
    setSourceImageBase64(null);
    
    try {
      if (!selectedDocId) {
        alert("Please set an active document in the Document Library first before analyzing.");
        setIsLoading(false);
        return;
      }
      const response = await axios.post(`${API_BASE}/analyze`, {
        document_id: selectedDocId,
        query: query
      });
      setAuditResult(response.data);
      if (response.data.image_base64) {
        setSourceImageBase64(response.data.image_base64);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || err.message || "An error occurred during analysis.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleValidate = async (isCorrect) => {
    setValidationStatus(isCorrect ? 'approved' : 'rejected');
    if (isCorrect && auditResult?.extracted) {
        setCorrectedValue(auditResult.extracted);
    }
    
    try {
      await axios.post(`${API_BASE}/validate`, {
        document_id: auditResult?.document_id,
        query: query,
        extracted_metric: auditResult?.extracted,
        is_correct: isCorrect,
        corrected_metric: isCorrect ? auditResult?.extracted : correctedValue
      });
    } catch (e) {
      console.log('Validation logged offline');
    }
  };

  return (
    <div className="animate-fade-in flex-col gap-4 flex" style={{ height: '100%' }}>
      <div className="card text-center flex flex-col items-center gap-4">
        <h2 className="text-2xl font-bold flex flex-col items-center gap-2">
          <BrainCircuit size={32} color="var(--accent-color)" />
          Sovereign Agentic Extraction
        </h2>
        <p className="text-secondary max-w-2xl">
          Enter a compliance metric to extract. The Gemma 4 Auditor will cross-reference claims against embedded visual data (ColPali).
        </p>
        
        <div className="flex gap-3 w-full mt-4" style={{ maxWidth: '90%' }}>
          <textarea 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Verify the peak discharge rate claims against the oscilloscope charts."
            disabled={isLoading}
            rows={2}
            style={{ flex: 1, resize: 'vertical', minHeight: '48px', maxHeight: '200px', lineHeight: '1.5' }}
          />
          <button onClick={handleAnalyze} disabled={isLoading} style={{ alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>
            {isLoading ? <><Loader2 size={18} className="animate-spin" style={{ animation: 'spin 2s linear infinite' }} /> Analyzing...</> : <><Search size={18}/> Analyze</>}
          </button>
        </div>
        {error && (
            <div className="text-sm p-3 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)', border: '1px solid var(--danger-color)' }}>
              {error}
            </div>
        )}
      </div>

      {isLoading && !auditResult && (
         <div className="flex-1 flex flex-col items-center justify-center gap-4 text-secondary animate-fade-in card" style={{ minHeight: '400px' }}>
            <Loader2 size={64} color="var(--accent-color)" style={{ animation: 'spin 2s linear infinite' }} />
            <p className="text-lg">Gemma 4 is reading the visual data...</p>
         </div>
      )}

      {auditResult && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'row', gap: '24px', alignItems: 'flex-start', width: '100%' }}>
          
          {/* Left panel: Document Crop */}
          <div style={{ flex: 1, maxWidth: '50%', minWidth: '40%', background: '#1e1e1e', padding: '16px', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="border-b" style={{ paddingBottom: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
              <div className="text-sm font-bold flex items-center justify-between">
                <span>Source Document Viewer</span>
                <span className="text-xs text-secondary bg-[#1f2937] px-2 py-1 rounded">Page {auditResult.page_num || '?'}</span>
              </div>
            </div>
            {sourceImageBase64 ? (
              <img src={`data:image/jpeg;base64,${sourceImageBase64}`} alt="Source Document Crop" style={{ width: '100%', height: 'auto', maxHeight: '75vh', objectFit: 'contain', display: 'block' }} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', color: 'var(--text-secondary)', padding: '2rem' }}>
                <AlertTriangle size={48} opacity={0.5} />
                <p>Visual context failed to render.</p>
              </div>
            )}
          </div>

          {/* Right panel: AI Extraction & Validation */}
          <div className="card flex flex-col gap-4" style={{ overflow: 'hidden', flex: 1 }}>
            <div className="flex justify-between items-center border-b pb-2" style={{ borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
              <h3 className="text-xl">Gemma 4 Auditor Extract</h3>
              {auditResult.confidence && (
                <span className="text-xs bg-indigo-900 border border-indigo-700 text-indigo-300 px-2 py-1 rounded-full whitespace-nowrap">
                  Confidence: {Math.round(auditResult.confidence * 100)}%
                </span>
              )}
            </div>
            
            <div className="bg-[#1f2937] p-6 rounded text-sm relative flex-1 flex flex-col" style={{ overflowY: 'auto', minHeight: '0' }}>
                <div className="absolute top-2 right-2 flex gap-1">
                  <span className="bg-blue-900 text-blue-200 text-xs px-2 py-1 rounded-full">Vision Verified</span>
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', marginTop: '1rem', color: '#60a5fa', lineHeight: '1.6', flexGrow: 1 }}>
                    {auditResult.extracted}
                </pre>
            </div>

            <div className="mt-auto border-t pt-4" style={{ borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
              <h4 className="text-sm font-bold mb-4 flex items-center gap-2">
                <ChevronRight size={16} /> Human-In-The-Loop Validation
              </h4>
              
              {validationStatus === 'approved' ? (
                <div className="bg-emerald-900/30 border border-emerald-800 p-3 rounded flex items-center gap-2 text-emerald-400">
                  <CheckCircle size={18} />
                  Metric successfully verified and logged to Ground Truth.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-secondary">Is the extracted metric accurate according to the visual source data?</p>
                  
                  {validationStatus === 'rejected' && (
                    <div className="animate-fade-in flex flex-col gap-2">
                      <label className="text-xs text-danger">Provide Corrected Value for Feedback Loop:</label>
                      <textarea 
                        rows={2} 
                        value={correctedValue}
                        onChange={(e) => setCorrectedValue(e.target.value)}
                        placeholder="Enter the correct ground truth value..."
                      />
                      <button className="success w-full justify-center mt-2" onClick={() => handleValidate(true)}>
                        Submit Correction
                      </button>
                    </div>
                  )}

                  {!validationStatus && (
                    <div className="flex gap-2">
                      <button className="success flex-1 justify-center" onClick={() => handleValidate(true)}>
                        <CheckCircle size={18}/> Approve
                      </button>
                      <button className="danger flex-1 justify-center" onClick={() => setValidationStatus('rejected')}>
                        <XCircle size={18}/> Reject
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditDashboard;
