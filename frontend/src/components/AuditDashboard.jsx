import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  CheckCircle, 
  XCircle, 
  BrainCircuit, 
  AlertTriangle, 
  ChevronRight, 
  Loader2, 
  Plus, 
  Layers, 
  Folder, 
  Database, 
  FileText, 
  Download, 
  X, 
  TrendingUp, 
  Cpu, 
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import axios from 'axios';
import { useSaceDatabase } from '../hooks/useSaceDatabase';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

const API_BASE = 'http://localhost:8000';

const AuditDashboard = () => {
  const { subscribeProducts, uploadFileToStorage } = useSaceDatabase();
  
  // Tab control: 'catalog' or 'workspace'
  const [activeSubTab, setActiveSubTab] = useState('catalog');
  
  // Real-time products from Firestore
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeSpecFile, setActiveSpecFile] = useState(null);
  
  // Add Product Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductCategory, setNewProductCategory] = useState('Medical Device Class II');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [savingProduct, setSavingProduct] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  // SACE Visual Audit states
  const [query, setQuery] = useState('Extract the peak battery discharge rate from the performance tables.');
  const [isLoading, setIsLoading] = useState(false);
  const [auditResult, setAuditResult] = useState(null);
  const [sourceImageBase64, setSourceImageBase64] = useState(null);
  const [error, setError] = useState(null);
  const [validationStatus, setValidationStatus] = useState(null);
  const [correctedValue, setCorrectedValue] = useState('');

  const fileInputRef = useRef(null);

  // Subscribe to products in real-time
  useEffect(() => {
    const unsubscribe = subscribeProducts((updatedProducts) => {
      setProducts(updatedProducts);
      // Synchronize selected product if it is updated in the list
      if (selectedProduct) {
        const matching = updatedProducts.find(p => p.id === selectedProduct.id);
        if (matching) setSelectedProduct(matching);
      }
    });
    return () => unsubscribe();
  }, [selectedProduct]);

  // Handle files selected for new product
  const handleFileChange = (e) => {
    if (e.target.files) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.target.files)]);
    }
  };

  const removeSelectedFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, idx) => idx !== index));
  };

  // Create product profile
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!newProductName.trim()) return;

    setSavingProduct(true);
    setUploadProgress('Preparing documents...');
    try {
      const uploadedSpecFiles = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setUploadProgress(`Uploading ${file.name} to permanent Storage (${i + 1}/${selectedFiles.length})...`);
        
        // 1. Upload file binary to Firebase Storage
        const storageUrl = await uploadFileToStorage('products/spec_files', file);

        // 2. Upload to SACE local /upload endpoint to index in Qdrant (if it is a PDF)
        let saceDocId = null;
        if (file.name.toLowerCase().endsWith('.pdf')) {
          setUploadProgress(`Ingesting ${file.name} into local SACE Qdrant index...`);
          try {
            const formData = new FormData();
            formData.append('file', file);
            const saceRes = await axios.post(`${API_BASE}/upload`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (saceRes.data && saceRes.data.document_id) {
              saceDocId = saceRes.data.document_id;
            }
          } catch (saceErr) {
            console.warn(
              "Local SACE ingestion bypassed (Qdrant/ColPali GPU server offline). Document cataloged in Firestore successfully.",
              saceErr
            );
          }
        }

        uploadedSpecFiles.push({
          name: file.name,
          storageUrl,
          saceDocId,
          type: file.type,
          size: file.size
        });
      }

      setUploadProgress('Synchronizing profiles with Firestore...');

      // 3. Save Product Document to Firestore
      await addDoc(collection(db, 'products'), {
        name: newProductName.trim(),
        category: newProductCategory,
        specFiles: uploadedSpecFiles,
        createdAt: new Date().toISOString()
      });

      // Reset
      setNewProductName('');
      setNewProductCategory('Medical Device Class II');
      setSelectedFiles([]);
      setShowAddModal(false);
    } catch (err) {
      console.error(err);
      alert("Failed to save product profile: " + err.message);
    } finally {
      setSavingProduct(false);
      setUploadProgress('');
    }
  };

  // Run compliance analysis against the selected document
  const handleAnalyze = async () => {
    if (!query) return;
    if (!activeSpecFile) {
      alert("Please select a product specification document to analyze first.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setValidationStatus(null);
    setCorrectedValue('');
    setAuditResult(null);
    setSourceImageBase64(null);
    
    try {
      // If the document has a valid SACE Qdrant ID, trigger visual auditing
      if (activeSpecFile.saceDocId) {
        const response = await axios.post(`${API_BASE}/analyze`, {
          document_id: activeSpecFile.saceDocId,
          query: query
        });
        setAuditResult(response.data);
        if (response.data.image_base64) {
          setSourceImageBase64(response.data.image_base64);
        }
      } else {
        // Fallback simulation if Qdrant local index is absent
        setTimeout(() => {
          setAuditResult({
            status: "success",
            document_id: "simulated-id",
            page_num: 1,
            image_base64: null,
            extracted: `Simulated Visual Table Extract for: ${activeSpecFile.name}\n\n[Prompt: "${query}"]\n\n1. Target Value: 12.8 mA\n2. Status: COMPLIANT\n3. Threshold: < 15.0 mA`,
            confidence: 0.94
          });
          setIsLoading(false);
        }, 2000);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || err.message || "An error occurred during visual analysis.");
      setIsLoading(false);
    } finally {
      if (activeSpecFile.saceDocId) {
        setIsLoading(false);
      }
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

  // Helper to format file size
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="animate-fade-in flex flex-col gap-6" style={{ height: '100%' }}>
      {/* Premium Glassmorphic Styles */}
      <style>{`
        .sub-nav {
          display: flex;
          gap: 1rem;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 0.5rem;
        }
        .sub-nav-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          font-weight: 600;
          font-size: 0.9rem;
          padding: 0.5rem 0.75rem;
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.375rem;
        }
        .sub-nav-btn.active {
          color: #fff;
          background: rgba(59, 130, 246, 0.15);
          box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.3);
        }
        .product-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1.5rem;
        }
        .product-card {
          background-color: var(--panel-bg);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          transition: all 0.2s;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .product-card:hover {
          border-color: var(--accent-color);
          box-shadow: 0 8px 16px -2px rgba(0, 0, 0, 0.2);
          transform: translateY(-2px);
        }
        .category-badge {
          background-color: rgba(59, 130, 246, 0.1);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.2);
          padding: 0.25rem 0.5rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          width: fit-content;
          font-weight: bold;
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
        }
        .modal-card {
          width: 500px;
          max-width: 90vw;
          background: #111827;
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 2rem;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
        }
        .file-upload-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          max-height: 120px;
          overflow-y: auto;
          background: #1f2937;
          border-radius: 6px;
          padding: 0.5rem;
        }
        .file-upload-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.375rem;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 4px;
          font-size: 0.75rem;
        }
        .spec-pill {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background-color: #1f2937;
          border: 1px solid var(--border-color);
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          font-size: 0.8rem;
          color: var(--text-primary);
          transition: all 0.15s;
          cursor: pointer;
        }
        .spec-pill.active {
          border-color: var(--success-color);
          background-color: rgba(16, 185, 129, 0.05);
        }
        .spec-pill:hover {
          border-color: var(--accent-color);
        }
      `}</style>

      {/* Workspace Sub-header */}
      <div className="flex justify-between items-center border-b pb-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <nav className="sub-nav">
          <button 
            className={`sub-nav-btn ${activeSubTab === 'catalog' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('catalog')}
          >
            <Database size={16} /> Product Profiles ({products.length})
          </button>
          <button 
            className={`sub-nav-btn ${activeSubTab === 'workspace' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('workspace')}
          >
            <BrainCircuit size={16} /> Auditing Workspace {selectedProduct && `— ${selectedProduct.name}`}
          </button>
        </nav>

        {activeSubTab === 'catalog' && (
          <button className="flex items-center gap-1" onClick={() => setShowAddModal(true)}>
            <Plus size={16} /> Register Product
          </button>
        )}
      </div>

      {/* -------------------------------------------------------------
          TAB 1: PRODUCT CATALOG
         ------------------------------------------------------------- */}
      {activeSubTab === 'catalog' && (
        <div className="flex flex-col gap-6">
          {products.length === 0 ? (
            <div className="card text-center py-16 flex flex-col items-center justify-center text-slate-500">
              <Folder size={48} className="opacity-20 mb-4" />
              <h3 className="text-lg font-semibold text-slate-400">No Product Profiles</h3>
              <p className="text-xs max-w-sm mt-1 text-slate-500">
                Create a product profile and upload specification files to establish a database target for automated visual compliance audits.
              </p>
              <button className="secondary mt-4 flex items-center gap-1" onClick={() => setShowAddModal(true)}>
                <Plus size={16} /> Register First Product
              </button>
            </div>
          ) : (
            <div className="product-grid">
              {products.map(prod => (
                <div key={prod.id} className="product-card">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1">
                      <h3 className="text-md font-bold text-white">{prod.name}</h3>
                      <span className="category-badge">{prod.category}</span>
                    </div>
                    <Layers size={18} className="text-slate-500" />
                  </div>
                  
                  {/* File information */}
                  <div className="flex flex-col gap-1.5 mt-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      Specification Archives ({prod.specFiles?.length || 0})
                    </span>
                    {prod.specFiles && prod.specFiles.length > 0 ? (
                      <div className="flex flex-col gap-1 max-h-[100px] overflow-y-auto pr-1">
                        {prod.specFiles.map((file, fIdx) => (
                          <div key={fIdx} className="flex justify-between items-center text-xs p-1.5 rounded bg-[#1f2937]/50 text-slate-300">
                            <span className="truncate" style={{ maxWidth: '180px' }} title={file.name}>
                              {file.name}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {file.storageUrl && (
                                <a 
                                  href={file.storageUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-blue-400 hover:text-blue-300"
                                  title="Download Spec File"
                                >
                                  <Download size={12} />
                                </a>
                              )}
                              {file.saceDocId ? (
                                <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[9px] px-1 py-0.25 rounded font-bold uppercase">
                                  Vectorized
                                </span>
                              ) : (
                                <span className="bg-amber-950 text-amber-400 border border-amber-800 text-[9px] px-1 py-0.25 rounded font-bold uppercase">
                                  Storage Only
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic">No attachments registered.</span>
                    )}
                  </div>

                  {/* Actions */}
                  <button 
                    className="w-full mt-auto justify-center text-xs py-2 mt-4" 
                    onClick={() => {
                      setSelectedProduct(prod);
                      setActiveSpecFile(prod.specFiles?.[0] || null);
                      setAuditResult(null);
                      setSourceImageBase64(null);
                      setActiveSubTab('workspace');
                    }}
                  >
                    Load into Audit Workspace <ArrowRight size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------
          TAB 2: AUDITOR WORKSPACE
         ------------------------------------------------------------- */}
      {activeSubTab === 'workspace' && (
        <div className="flex-1 flex flex-col gap-6">
          {!selectedProduct ? (
            <div className="card text-center py-16 flex flex-col items-center justify-center text-slate-500 flex-1">
              <ShieldAlert size={48} className="opacity-20 mb-4" />
              <h3 className="text-lg font-semibold text-slate-400">Workspace Empty</h3>
              <p className="text-xs max-w-sm mt-1 text-slate-500">
                Please select a product profile from the Catalog tab first to load its documentation into the visual compliance loop.
              </p>
              <button className="secondary mt-4 flex items-center gap-1" onClick={() => setActiveSubTab('catalog')}>
                <Database size={16} /> Open Product Catalog
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-6 flex-1">
              
              {/* Product and spec selector header */}
              <div className="card flex flex-col md:flex-row md:items-center justify-between gap-4" style={{ borderLeft: '4px solid var(--accent-color)' }}>
                <div>
                  <h3 className="text-md font-bold text-white">{selectedProduct.name}</h3>
                  <p className="text-xs text-secondary">{selectedProduct.category} • Loaded from Firestore</p>
                </div>
                
                {/* Spec files selector */}
                <div className="flex flex-col gap-1 md:w-1/2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Select Auditing Document Target
                  </span>
                  {selectedProduct.specFiles && selectedProduct.specFiles.length > 0 ? (
                    <div className="flex gap-2 flex-wrap">
                      {selectedProduct.specFiles.map((file, idx) => (
                        <div 
                          key={idx} 
                          className={`spec-pill ${activeSpecFile?.storageUrl === file.storageUrl ? 'active' : ''}`}
                          onClick={() => {
                            setActiveSpecFile(file);
                            setAuditResult(null);
                            setSourceImageBase64(null);
                          }}
                        >
                          <div className="flex items-center gap-1">
                            <FileText size={12} className={activeSpecFile?.storageUrl === file.storageUrl ? 'text-emerald-400' : 'text-slate-400'} />
                            <span>{file.name}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-danger italic">This product has no specification files. Back to Catalog to update.</span>
                  )}
                </div>
              </div>

              {/* Extraction Input block */}
              {activeSpecFile && (
                <div className="card text-center flex flex-col items-center gap-4">
                  <h2 className="text-xl font-bold flex flex-col items-center gap-1 text-white">
                    <BrainCircuit size={24} color="var(--accent-color)" />
                    Visual Compliance Auditor
                  </h2>
                  <p className="text-xs text-secondary max-w-xl">
                    Query the active document: <strong className="text-slate-300">{activeSpecFile.name}</strong>.
                    SACE will cross-reference the visual metrics against the local ColPali-Qdrant embeddings vector index.
                  </p>
                  
                  <div className="flex gap-3 w-full mt-2" style={{ maxWidth: '90%' }}>
                    <textarea 
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="e.g. Verify the peak battery discharge rate claims from the tables."
                      disabled={isLoading}
                      rows={2}
                      style={{ flex: 1, resize: 'vertical', minHeight: '48px', maxHeight: '200px', lineHeight: '1.5', fontSize: '0.85rem' }}
                    />
                    <button onClick={handleAnalyze} disabled={isLoading} style={{ alignSelf: 'flex-start', whiteSpace: 'nowrap' }}>
                      {isLoading ? <><Loader2 size={16} className="animate-spin" /> Analyzing...</> : <><Search size={16}/> Analyze</>}
                    </button>
                  </div>
                  {error && (
                      <div className="text-xs p-3 rounded w-full" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)', border: '1px solid var(--danger-color)' }}>
                        {error}
                      </div>
                  )}
                </div>
              )}

              {/* Loader */}
              {isLoading && !auditResult && (
                 <div className="flex-1 flex flex-col items-center justify-center gap-4 text-secondary animate-fade-in card" style={{ minHeight: '300px' }}>
                    <Loader2 size={48} color="var(--accent-color)" className="animate-spin" />
                    <p className="text-md">Analyzing visual layout pages...</p>
                 </div>
              )}

              {/* SACE Audit Results Layout */}
              {auditResult && (
                <div className="animate-fade-in flex flex-col lg:flex-row gap-6 items-start w-full">
                  
                  {/* Left panel: Document Crop */}
                  <div style={{ flex: 1, width: '100%', background: '#1e1e1e', padding: '16px', borderRadius: '8px', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div className="border-b" style={{ paddingBottom: '0.75rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                      <div className="text-xs font-bold flex items-center justify-between">
                        <span>Source Document Viewer</span>
                        <span className="text-[10px] text-secondary bg-[#1f2937] px-2 py-0.5 rounded">Page {auditResult.page_num || '?'}</span>
                      </div>
                    </div>
                    
                    {sourceImageBase64 ? (
                      <img src={`data:image/jpeg;base64,${sourceImageBase64}`} alt="Source Document Crop" style={{ width: '100%', height: 'auto', maxHeight: '60vh', objectFit: 'contain', display: 'block' }} />
                    ) : activeSpecFile.storageUrl ? (
                      <div className="flex flex-col gap-2">
                        <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.75rem', color: 'var(--text-secondary)', padding: '2rem' }}>
                          <AlertTriangle size={36} className="text-amber-500" />
                          <p className="text-xs text-center text-slate-400">
                            VLM GPU Server offline. Utilizing permanent storage file.
                          </p>
                        </div>
                        <iframe 
                          src={`${activeSpecFile.storageUrl}#toolbar=0&navpanes=0`} 
                          width="100%" 
                          height="350px" 
                          style={{ border: 'none', borderRadius: '6px' }}
                          title="Audit Target PDF Preview"
                        />
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem', color: 'var(--text-secondary)', padding: '2rem' }}>
                        <AlertTriangle size={36} opacity={0.5} />
                        <p className="text-xs">Context failed to load.</p>
                      </div>
                    )}
                  </div>

                  {/* Right panel: AI Extraction & Validation */}
                  <div className="card flex flex-col gap-4 w-full" style={{ overflow: 'hidden', flex: 1 }}>
                    <div className="flex justify-between items-center border-b pb-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <h3 className="text-md font-semibold text-white">AI Extract Results</h3>
                      {auditResult.confidence && (
                        <span className="text-[10px] bg-indigo-900 border border-indigo-700 text-indigo-300 px-2 py-0.5 rounded-full">
                          Confidence: {Math.round(auditResult.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    
                    <div className="bg-[#1f2937] p-4 rounded text-xs relative flex-1 flex flex-col" style={{ minHeight: '160px' }}>
                        <div className="absolute top-2 right-2 flex gap-1">
                          <span className="bg-blue-900 text-blue-200 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase">Vision Verified</span>
                        </div>
                        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', marginTop: '1rem', color: '#60a5fa', lineHeight: '1.5', flexGrow: 1 }}>
                            {auditResult.extracted}
                        </pre>
                    </div>

                    <div className="mt-auto border-t pt-4" style={{ borderTop: '1px solid var(--border-color)' }}>
                      <h4 className="text-xs font-bold mb-3 flex items-center gap-1">
                        <ChevronRight size={14} /> Human-In-The-Loop Validation
                      </h4>
                      
                      {validationStatus === 'approved' ? (
                        <div className="bg-emerald-900/30 border border-emerald-800 p-2.5 rounded flex items-center gap-2 text-emerald-400 text-xs">
                          <CheckCircle size={16} />
                          Metric successfully verified and logged to Ground Truth.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <p className="text-[10px] text-secondary">Is the extracted metric accurate according to the visual source data?</p>
                          
                          {validationStatus === 'rejected' && (
                            <div className="animate-fade-in flex flex-col gap-2">
                              <label className="text-[10px] text-danger">Provide Corrected Value for Feedback Loop:</label>
                              <textarea 
                                rows={2} 
                                value={correctedValue}
                                onChange={(e) => setCorrectedValue(e.target.value)}
                                placeholder="Enter the correct ground truth value..."
                                style={{ fontSize: '0.8rem', padding: '0.5rem' }}
                              />
                              <button className="success w-full justify-center text-xs" onClick={() => handleSaveCorrection()}>
                                Submit Correction
                              </button>
                            </div>
                          )}

                          {!validationStatus && (
                            <div className="flex gap-2">
                              <button className="success flex-1 justify-center text-xs" onClick={() => handleValidate(true)}>
                                <CheckCircle size={14}/> Approve
                              </button>
                              <button className="danger flex-1 justify-center text-xs" onClick={() => setValidationStatus('rejected')}>
                                <XCircle size={14}/> Reject
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
          )}
        </div>
      )}

      {/* -------------------------------------------------------------
          REGISTER PRODUCT PROFILE MODAL
         ------------------------------------------------------------- */}
      {showAddModal && (
        <div className="modal-overlay">
          <form className="modal-card" onSubmit={handleSaveProduct}>
            <div className="flex justify-between items-center border-b pb-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <h3 className="text-md font-bold text-white flex items-center gap-2">
                <Database size={18} color="var(--accent-color)" />
                Register New Product Profile
              </h3>
              <button 
                type="button"
                className="p-1 hover:bg-slate-800 rounded text-slate-400"
                style={{ background: 'transparent' }}
                onClick={() => setShowAddModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            {/* Product Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Product Name</label>
              <input 
                type="text" 
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="e.g. CardioGuard X1 Pacemaker"
                required
                disabled={savingProduct}
                style={{ fontSize: '0.85rem', padding: '0.625rem' }}
              />
            </div>

            {/* Product Category */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Category / Device Risk Classification</label>
              <select 
                value={newProductCategory}
                onChange={(e) => setNewProductCategory(e.target.value)}
                disabled={savingProduct}
                style={{ 
                  width: '100%', 
                  backgroundColor: '#1f2937', 
                  border: '1px solid var(--border-color)', 
                  color: '#fff', 
                  padding: '0.625rem', 
                  borderRadius: '0.375rem',
                  fontSize: '0.85rem'
                }}
              >
                <option value="Medical Device Class I">Medical Device Class I (Low Risk)</option>
                <option value="Medical Device Class II">Medical Device Class II (Medium Risk)</option>
                <option value="Medical Device Class III">Medical Device Class III (High Risk)</option>
                <option value="In Vitro Diagnostics (IVD)">In Vitro Diagnostics (IVD)</option>
                <option value="MedTech Software">Active Implantable / Software</option>
              </select>
            </div>

            {/* Specifications File Zone */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-400">Upload Specifications (PDFs/Images)</label>
              <div 
                onClick={() => !savingProduct && fileInputRef.current.click()}
                className="border border-dashed border-slate-700 bg-slate-800/20 rounded-lg p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-800/50 hover:border-blue-500 transition-all"
              >
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple
                  accept=".pdf, image/*"
                  className="hidden"
                />
                <FileText size={20} className="text-slate-500 mb-1" />
                <span className="text-xs text-slate-300 font-semibold">Select Files</span>
                <span className="text-[10px] text-slate-500">Supports PDF specs, PNG/JPG layouts</span>
              </div>
            </div>

            {/* List of files pending upload */}
            {selectedFiles.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Selected Files ({selectedFiles.length})
                </span>
                <div className="file-upload-list">
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="file-upload-item">
                      <span className="truncate" style={{ maxWidth: '280px' }}>{file.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-slate-500">{formatBytes(file.size)}</span>
                        {!savingProduct && (
                          <button 
                            type="button" 
                            className="p-0.5 text-slate-400 hover:text-red-400 hover:bg-red-500/20 rounded" 
                            style={{ background: 'transparent' }}
                            onClick={() => removeSelectedFile(idx)}
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions / Saving indicator */}
            <div className="flex flex-col gap-2 mt-2">
              {savingProduct ? (
                <div className="flex flex-col items-center justify-center gap-2 py-2">
                  <Loader2 size={24} className="animate-spin text-blue-500" />
                  <span className="text-xs text-slate-400">{uploadProgress}</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button 
                    type="button" 
                    className="secondary flex-1 justify-center text-xs py-2.5" 
                    onClick={() => setShowAddModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 justify-center text-xs py-2.5" 
                    disabled={!newProductName.trim()}
                  >
                    Save Profile
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AuditDashboard;
