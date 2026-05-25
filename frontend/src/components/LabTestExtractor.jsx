import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Brain, 
  Download, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  Plus, 
  Trash2, 
  FileText, 
  HelpCircle,
  Database,
  Save,
  ChevronDown
} from 'lucide-react';
import { useSaceDatabase } from '../hooks/useSaceDatabase';

const API_BASE = 'http://localhost:8000';

const LabTestExtractor = ({
  selectedProductId,
  setSelectedProductId,
  file,
  setFile,
  filePreviewUrl,
  setFilePreviewUrl,
  queryIntent,
  setQueryIntent,
  extractedData,
  setExtractedData,
  currentLabReportId,
  setCurrentLabReportId,
  successMsg,
  setSuccessMsg,
  error,
  setError
}) => {
  const { subscribeProducts, createLabReport, updateLabReport } = useSaceDatabase();

  // Firestore Products List & Selected Profile
  const [products, setProducts] = useState([]);
  const [savingToDb, setSavingToDb] = useState(false);

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const fileInputRef = useRef(null);

  // Subscribe to Firestore Products in real-time
  useEffect(() => {
    const unsubscribe = subscribeProducts((updatedProducts) => {
      setProducts(updatedProducts);
    });
    return () => unsubscribe();
  }, []);

  const handleFileChange = (e) => {
    if (!selectedProductId) return;
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      
      // Create local URL for previewing PDF or image
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
      setFilePreviewUrl(URL.createObjectURL(selectedFile));
      setExtractedData(null);
      setError(null);
      setSuccessMsg(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (!selectedProductId) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selectedFile = e.dataTransfer.files[0];
      setFile(selectedFile);
      
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
      setFilePreviewUrl(URL.createObjectURL(selectedFile));
      setExtractedData(null);
      setError(null);
      setSuccessMsg(null);
    }
  };

  const handleUploadZoneClick = () => {
    if (!selectedProductId) return;
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleExtract = async () => {
    if (!file || !selectedProductId) return;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    setStatusMessage('Ingesting document and sending to Gemini parsing pipeline...');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('query', queryIntent);

    try {
      const response = await axios.post(`${API_BASE}/api/extract-lab-table`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data && response.data.data) {
        setExtractedData(response.data.data);
        setSuccessMsg('Successfully extracted structured data from lab report!');
      } else {
        throw new Error('AI pipeline returned invalid or empty response');
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || err.message || 'Failed to extract lab report standard values.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToDb = async () => {
    if (!extractedData || !selectedProductId) return;
    setSavingToDb(true);
    setError(null);
    setSuccessMsg(null);
    setStatusMessage('Syncing interactive spreadsheet edits to secure Firestore...');
    try {
      if (currentLabReportId) {
        // Update existing report
        await updateLabReport(currentLabReportId, { extractedData });
        setSuccessMsg('Spreadsheet changes successfully updated in Firestore!');
      } else {
        // Create new report
        const newReport = await createLabReport(selectedProductId, extractedData, file);
        setCurrentLabReportId(newReport.id);
        setSuccessMsg('Successfully cataloged new lab report and spreadsheet in Firestore!');
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to save spreadsheet data to database.');
    } finally {
      setSavingToDb(false);
    }
  };

  const addColumn = () => {
    if (!extractedData) return;
    const colName = prompt("Enter new column name:");
    if (!colName) return;
    if (extractedData.headers.includes(colName)) {
      alert("Column already exists!");
      return;
    }
    const updatedHeaders = [...extractedData.headers, colName];
    const updatedRows = extractedData.rows.map(row => ({
      ...row,
      [colName]: ''
    }));
    setExtractedData({
      ...extractedData,
      headers: updatedHeaders,
      rows: updatedRows
    });
  };

  const addRow = () => {
    if (!extractedData) return;
    const newRow = {};
    extractedData.headers.forEach(header => {
      newRow[header] = '';
    });
    setExtractedData({
      ...extractedData,
      rows: [...extractedData.rows, newRow]
    });
  };

  const deleteColumn = (colName) => {
    if (!extractedData) return;
    if (!confirm(`Are you sure you want to delete column "${colName}"?`)) return;
    const updatedHeaders = extractedData.headers.filter(h => h !== colName);
    const updatedRows = extractedData.rows.map(row => {
      const newRow = { ...row };
      delete newRow[colName];
      return newRow;
    });
    setExtractedData({
      ...extractedData,
      headers: updatedHeaders,
      rows: updatedRows
    });
  };

  const deleteRow = (rIdx) => {
    if (!extractedData) return;
    if (!confirm("Are you sure you want to delete this row?")) return;
    const updatedRows = extractedData.rows.filter((_, idx) => idx !== rIdx);
    setExtractedData({
      ...extractedData,
      rows: updatedRows
    });
  };

  const handleHeaderChange = (hIdx, newVal) => {
    if (!extractedData) return;
    const oldVal = extractedData.headers[hIdx];
    if (oldVal === newVal) return;
    
    const updatedHeaders = [...extractedData.headers];
    updatedHeaders[hIdx] = newVal;
    
    const updatedRows = extractedData.rows.map(row => {
      const newRow = { ...row };
      newRow[newVal] = newRow[oldVal];
      delete newRow[oldVal];
      return newRow;
    });
    
    setExtractedData({
      ...extractedData,
      headers: updatedHeaders,
      rows: updatedRows
    });
  };

  const handleCellChange = (rIdx, header, newVal) => {
    if (!extractedData) return;
    const updatedRows = [...extractedData.rows];
    updatedRows[rIdx] = {
      ...updatedRows[rIdx],
      [header]: newVal
    };
    setExtractedData({
      ...extractedData,
      rows: updatedRows
    });
  };

  const exportToCSV = () => {
    if (!extractedData || extractedData.rows.length === 0) return;
    const headers = extractedData.headers;
    const csvContent = [
      headers.join(','),
      ...extractedData.rows.map(row => 
        headers.map(header => {
          const val = row[header] || '';
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${extractedData.table_title || 'lab_report_data'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToJSON = () => {
    if (!extractedData) return;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(extractedData, null, 2)
    )}`;
    const link = document.createElement("a");
    link.setAttribute("href", jsonString);
    link.setAttribute("download", `${extractedData.table_title || 'lab_report_data'}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="animate-fade-in flex flex-col gap-6" style={{ minHeight: '105%', paddingBottom: '2rem' }}>
      {/* Title block */}
      <div className="card text-center flex flex-col items-center gap-2" style={{ borderLeft: '4px solid var(--accent-color)' }}>
        <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
          <FileSpreadsheet size={28} color="var(--accent-color)" />
          Lab Test Result Table Extractor
        </h2>
        <p className="text-secondary max-w-2xl text-sm">
          Upload any unstructured PDF or Image lab test report, specify the target table or test results to extract, and edit and export the visual data in an interactive spreadsheet format.
        </p>
      </div>

      {/* Main interactive grid - styled with guaranteed inline flex row layout */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: '1.5rem', alignItems: 'stretch', width: '100%' }}>
        
        {/* Left Column: Upload & Options (38% width) */}
        <div className="card" style={{ flex: '0 0 38%', display: 'flex', flexDirection: 'column', gap: '1.5rem', background: '#111827' }}>
          <h3 className="text-lg font-semibold text-white border-b pb-2 border-slate-800">
            Document Ingestion & Guides
          </h3>

          {/* Product Profile Dropdown Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-400 flex items-center gap-1">
              <Database size={14} className="text-blue-400" />
              Select Associated Product Profile
            </label>
            {products.length === 0 ? (
              <div className="text-xs p-3 rounded bg-amber-950/20 border border-amber-800 text-amber-400">
                No product profiles found. Please register a product profile in the <strong>Audit Dashboard</strong> first.
              </div>
            ) : (
              <select
                value={selectedProductId}
                onChange={(e) => {
                  setSelectedProductId(e.target.value);
                  setFile(null);
                  setFilePreviewUrl(null);
                  setExtractedData(null);
                  setError(null);
                  setSuccessMsg(null);
                }}
                disabled={loading || savingToDb}
                style={{
                  width: '100%',
                  backgroundColor: '#1f2937',
                  border: '1px solid var(--border-color)',
                  color: '#fff',
                  padding: '0.75rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.85rem'
                }}
              >
                <option value="">-- Choose Product Profile --</option>
                {products.map(prod => (
                  <option key={prod.id} value={prod.id}>{prod.name} ({prod.category})</option>
                ))}
              </select>
            )}
          </div>

          {/* File Upload Zone */}
          <div 
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={handleUploadZoneClick}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all group relative ${
              selectedProductId 
                ? 'border-slate-700 bg-slate-800/40 hover:bg-slate-800/80 hover:border-blue-500 cursor-pointer' 
                : 'border-slate-800 bg-slate-900/20 opacity-40 cursor-not-allowed'
            }`}
            style={{ minHeight: '160px' }}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange}
              accept=".pdf, image/png, image/jpeg, image/jpg"
              style={{ display: 'none' }} 
            />
            <div className="bg-slate-700/50 p-3 rounded-full mb-3 group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-colors">
              <UploadCloud size={24} className="text-slate-400 group-hover:text-blue-400" />
            </div>
            <span className="text-slate-200 font-medium text-sm break-all max-w-full px-2">
              {file ? file.name : 'Upload Lab Document (PDF or Images)'}
            </span>
            <span className="text-slate-500 text-xs mt-1">
              {selectedProductId ? 'Drag & drop or click to browse' : 'Choose a product profile first'}
            </span>
            <button 
              type="button" 
              className="secondary text-xs mt-3"
              style={{ padding: '0.375rem 0.75rem', pointerEvents: 'none' }}
            >
              Browse Files
            </button>
          </div>

          {/* Extraction Guide Input */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-400 flex items-center gap-1">
              <HelpCircle size={14} className="text-slate-500" title="Instruct Gemini to search for a specific table name, section, or set of lab metrics." />
              Extraction Guide / Intent (Optional)
            </label>
            <textarea 
              value={queryIntent}
              onChange={(e) => setQueryIntent(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-shadow"
              rows={3}
              placeholder="e.g. Extract 'Clinical Blood Chemistry' or 'Hemoglobin level and min burst pressure'."
              disabled={!selectedProductId || loading || savingToDb}
            />
          </div>

          {/* Action trigger button */}
          <button 
            onClick={handleExtract}
            disabled={loading || savingToDb || !file || !selectedProductId}
            className={`w-full text-white font-medium py-3 rounded-lg shadow-md transition-all flex items-center justify-center gap-2 ${
              loading || savingToDb 
                ? 'bg-blue-800 cursor-not-allowed' 
                : (file && selectedProductId)
                  ? 'bg-blue-600 hover:bg-blue-500 cursor-pointer active:scale-[0.98]' 
                  : 'bg-slate-700 cursor-not-allowed opacity-50'
            }`}
          >
            {loading || savingToDb ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <Brain size={18} />
                <span>AI STRUCTURED EXTRACT</span>
              </>
            )}
          </button>

          {/* Document Preview block */}
          {filePreviewUrl && (
            <div className="flex flex-col gap-2 mt-2">
              <label className="text-xs font-semibold text-slate-400">Document Live Preview</label>
              <div className="rounded-lg border border-slate-800 bg-[#0b0f19] overflow-hidden flex items-center justify-center" style={{ height: '320px' }}>
                {file.type === 'application/pdf' ? (
                  <iframe 
                    src={`${filePreviewUrl}#toolbar=0&navpanes=0`} 
                    width="100%" 
                    height="100%" 
                    style={{ border: 'none' }}
                    title="PDF Preview"
                  />
                ) : (
                  <img 
                    src={filePreviewUrl} 
                    alt="Ingested Upload Preview" 
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Interactive Spreadsheet (62% width) */}
        <div className="card" style={{ flex: '1 1 0%', display: 'flex', flexDirection: 'column', gap: '1.5rem', background: '#111827', minHeight: '500px', minWidth: 0 }}>
          <div className="border-b border-slate-800 pb-3 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <FileSpreadsheet size={20} className="text-emerald-400" />
              Interactive AI Sheet View
            </h3>
            {extractedData && (
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold self-start sm:self-auto ${
                extractedData.confidence_score >= 0.9 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
                Extraction Confidence: {Math.round(extractedData.confidence_score * 100)}%
              </span>
            )}
          </div>

          {/* Feedback messaging */}
          {error && (
            <div className="p-3 bg-red-950/20 border border-red-800 rounded-lg text-red-400 text-sm flex items-center gap-2 mb-4 animate-fade-in animate-pulse">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-950/20 border border-emerald-800 rounded-lg text-emerald-400 text-sm flex items-center gap-2 mb-4 animate-fade-in">
              <CheckCircle size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Progress / Loading panel */}
          {(loading || savingToDb) && (
            <div className="flex-grow flex flex-col items-center justify-center gap-4 text-secondary py-16 animate-fade-in">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin"></div>
                <Brain className="text-blue-400 animate-pulse" size={24} />
              </div>
              <p className="text-sm font-medium text-slate-300 mt-2">{statusMessage}</p>
              <p className="text-xs text-slate-500">Gemini is dynamically formatting unstructured pixels into a structured schema...</p>
            </div>
          )}

          {/* Empty state when no data exists */}
          {!loading && !savingToDb && !extractedData && !error && (
            <div className="flex-grow flex flex-col items-center justify-center text-center text-slate-500 py-16">
              <FileText size={48} className="opacity-20 mb-4" />
              <p className="font-semibold text-slate-400">No Structured Data Yet</p>
              <p className="text-xs max-w-sm mt-1 text-slate-500">
                Select a product, upload a lab report document, and run the AI Structured Extract to see and edit the interactive spreadsheet.
              </p>
            </div>
          )}

          {/* Structured table display */}
          {!loading && !savingToDb && extractedData && (
            <div className="flex-grow flex flex-col gap-4 animate-fade-in">
              
              {/* Sheet Title / Controls bar */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <input
                  type="text"
                  value={extractedData.table_title}
                  onChange={(e) => setExtractedData({ ...extractedData, table_title: e.target.value })}
                  className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-blue-500 font-bold text-white text-md px-1 py-0.5 focus:outline-none w-full md:w-auto"
                  title="Click to edit sheet title"
                />
                
                {/* HITL structural tools */}
                <div className="flex items-center gap-2 flex-wrap font-sans">
                  <button onClick={addColumn} className="secondary spreadsheet-action-btn flex items-center gap-1 text-[11px] py-1 px-2.5">
                    <Plus size={12} /> Add Col
                  </button>
                  <button onClick={addRow} className="secondary spreadsheet-action-btn flex items-center gap-1 text-[11px] py-1 px-2.5">
                    <Plus size={12} /> Add Row
                  </button>
                  <button 
                    onClick={handleSaveToDb} 
                    disabled={savingToDb || loading}
                    className="spreadsheet-action-btn flex items-center gap-1 text-[11px] py-1 px-2.5"
                    style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none' }}
                  >
                    <Save size={12} /> Save Changes
                  </button>
                  <div className="w-px h-5 bg-slate-800 mx-1"></div>
                  <button onClick={exportToCSV} className="success spreadsheet-action-btn flex items-center gap-1 text-[11px] py-1 px-2.5">
                    <Download size={12} /> Export CSV
                  </button>
                  <button onClick={exportToJSON} className="spreadsheet-action-btn flex items-center gap-1 text-[11px] py-1 px-2.5">
                    <Download size={12} /> Export JSON
                  </button>
                </div>
              </div>

              {/* Editable Sheet Table */}
              <div className="spreadsheet-container max-h-[350px] overflow-y-auto">
                <table className="spreadsheet-table">
                  <thead>
                    <tr>
                      {extractedData.headers.map((header, hIdx) => (
                        <th key={hIdx} style={{ position: 'relative' }}>
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              value={header}
                              onChange={(e) => handleHeaderChange(hIdx, e.target.value)}
                              className="bg-transparent border-none text-xs font-semibold text-slate-300 w-full focus:outline-none focus:bg-slate-700 rounded px-1 py-0.5"
                              style={{ width: 'calc(100% - 20px)' }}
                            />
                            <button 
                              onClick={() => deleteColumn(header)} 
                              className="text-slate-500 hover:text-red-400 p-0.5 rounded cursor-pointer transition-colors" 
                              title="Delete column"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </th>
                      ))}
                      <th style={{ width: '40px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractedData.rows.length === 0 ? (
                      <tr>
                        <td colSpan={extractedData.headers.length + 1} className="p-8 text-center text-slate-500 italic text-xs">
                          No rows exist. Click 'Add Row' above to create cells.
                        </td>
                      </tr>
                    ) : (
                      extractedData.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-800/30 transition-colors">
                          {extractedData.headers.map((header, cIdx) => (
                            <td key={cIdx}>
                              <input
                                type="text"
                                value={row[header] || ''}
                                onChange={(e) => handleCellChange(rIdx, header, e.target.value)}
                                className="table-cell-input"
                              />
                            </td>
                          ))}
                          <td style={{ textAlign: 'center' }}>
                            <button 
                              onClick={() => deleteRow(rIdx)} 
                              className="p-1 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition-all cursor-pointer inline-flex justify-center" 
                              style={{ background: 'transparent' }}
                              title="Delete row"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Dynamic Insights Card */}
              {extractedData.summary && (
                <div className="mt-4 p-4 rounded-xl border border-slate-800 bg-[#1e293b]/20 flex gap-3">
                  <div className="bg-blue-900/40 p-2.5 rounded-lg text-blue-400 self-start">
                    <Brain size={20} />
                  </div>
                  <div>
                    <h4 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-1">
                      AI Analytical Insights
                    </h4>
                    <p className="text-slate-300 text-xs leading-relaxed font-semibold">
                      {extractedData.summary}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LabTestExtractor;
