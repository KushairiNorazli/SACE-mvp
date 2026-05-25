import React, { useState, useRef, useEffect } from 'react';
import AuditDashboard from './components/AuditDashboard';
import AuditWorkspace from './components/AuditWorkspace';
import LabTestExtractor from './components/LabTestExtractor';
import { ShieldCheck, LayoutDashboard, FileText, Settings, UploadCloud, CheckCircle, FileSpreadsheet, Database, Download, Search } from 'lucide-react';
import axios from 'axios';
import './index.css';
import { useSaceDatabase } from './hooks/useSaceDatabase';
import { db } from './lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

const API_BASE = 'http://localhost:8000';

function App() {
  const [activeTab, setActiveTab] = useState('docs');
  
  // SACE Database Service Subscriptions
  const { subscribeProducts, subscribeRegulationsByProduct, uploadFileToStorage } = useSaceDatabase();
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [regulations, setRegulations] = useState([]);
  const [successMsg, setSuccessMsg] = useState(null);

  const [selectedDocId, setSelectedDocId] = useState(null); // Backward compatibility
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Lifted Lab Test Extractor State
  const [labFile, setLabFile] = useState(null);
  const [labFilePreviewUrl, setLabFilePreviewUrl] = useState(null);
  const [labQueryIntent, setLabQueryIntent] = useState('');
  const [labExtractedData, setLabExtractedData] = useState(null);
  const [currentLabReportId, setCurrentLabReportId] = useState(null);
  const [labSuccessMsg, setLabSuccessMsg] = useState(null);
  const [labError, setLabError] = useState(null);

  const fileInputRef = useRef(null);

  // Reset active lab extractor when product selection changes
  useEffect(() => {
    setLabFile(null);
    if (labFilePreviewUrl) {
      try {
        URL.revokeObjectURL(labFilePreviewUrl);
      } catch (e) {
        console.warn("Failed to revoke URL:", e);
      }
    }
    setLabFilePreviewUrl(null);
    setLabExtractedData(null);
    setCurrentLabReportId(null);
    setLabSuccessMsg(null);
    setLabError(null);
  }, [selectedProductId]);

  // Subscribe to Products in real-time
  useEffect(() => {
    const unsubscribe = subscribeProducts((updatedProducts) => {
      setProducts(updatedProducts);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to Regulations filtered by selected product
  useEffect(() => {
    const unsubscribe = subscribeRegulationsByProduct(selectedProductId, (updatedRegs) => {
      setRegulations(updatedRegs);
      
      // Auto-set the first active regulation as active target for backwards compatibility
      if (updatedRegs.length > 0 && !selectedDocId) {
        // Find first saceDocId
        const firstWithSace = updatedRegs.find(r => r.saceDocId);
        if (firstWithSace) setSelectedDocId(firstWithSace.saceDocId);
      }
    });
    return () => unsubscribe();
  }, [selectedProductId, selectedDocId]);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!selectedProductId) {
      alert("Please select a Product Profile folder first!");
      event.target.value = null;
      return;
    }

    setUploading(true);
    setUploadError(null);
    setSuccessMsg(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // 1. Upload to SACE local /upload endpoint (for Qdrant visual indexing)
      let saceDocId = null;
      if (file.name.toLowerCase().endsWith('.pdf')) {
        try {
          const response = await axios.post(`${API_BASE}/upload`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          });
          if (response.data && response.data.document_id) {
            saceDocId = response.data.document_id;
          }
        } catch (saceErr) {
          console.warn("Local SACE ingestion bypassed (Qdrant/ColPali GPU server offline). Archiving in Firebase Storage.", saceErr);
        }
      }

      // 2. Upload PDF binary to permanent Firebase Storage
      const downloadUrl = await uploadFileToStorage('regulations', file);

      // 3. Save regulation entry reference in Firestore
      await addDoc(collection(db, 'regulations'), {
        productId: selectedProductId,
        documentType: "MDR Standard Reference",
        name: file.name,
        fileUrl: downloadUrl,
        saceDocId: saceDocId,
        createdAt: new Date().toISOString()
      });

      setSuccessMsg('Regulation Document successfully cataloged and indexed!');
      event.target.value = null; // reset
    } catch (err) {
      console.error(err);
      setUploadError(err.message || 'Failed to upload regulation document');
      event.target.value = null; // reset
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <header className="app-header bg-[#0b0f19] border-b border-slate-900 px-8 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="logo flex items-center gap-3 text-lg font-bold text-white tracking-wide">
          <div className="bg-blue-600/10 border border-blue-500/20 p-1.5 rounded-lg shadow-[0_0_10px_rgba(59,130,246,0.15)]">
            <ShieldCheck size={20} className="text-blue-500" />
          </div>
          <span className="flex items-center gap-1.5 font-sans">
            SACE <span className="text-blue-500 font-semibold">Engine</span>
          </span>
        </div>
        <div className="user-profile flex items-center gap-2">
          {/* Custom 3D Shaded Magnifying Glass Logo */}
          <div style={{ marginRight: '0.25rem', display: 'flex', alignItems: 'center' }}>
            <svg width="26" height="26" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                {/* Vibrant Gold Chrome Rim Gradient */}
                <linearGradient id="rimGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="30%" stopColor="#fef08a" />
                  <stop offset="70%" stopColor="#ca8a04" />
                  <stop offset="100%" stopColor="#713f12" />
                </linearGradient>
                
                {/* 3D Gold Bevel Extrusion Base */}
                <linearGradient id="bevelGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fef08a" />
                  <stop offset="50%" stopColor="#854d0e" />
                  <stop offset="100%" stopColor="#422006" />
                </linearGradient>
                
                {/* Cylindrical Gold Handle Gradient */}
                <linearGradient id="handleGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#854d0e" />
                  <stop offset="30%" stopColor="#eab308" />
                  <stop offset="50%" stopColor="#ffffff" />
                  <stop offset="70%" stopColor="#ca8a04" />
                  <stop offset="100%" stopColor="#422006" />
                </linearGradient>
                
                {/* High-Contrast Neon Cyan Glowing Lens */}
                <radialGradient id="lensGlass" cx="30%" cy="30%" r="70%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
                  <stop offset="35%" stopColor="#67e8f9" stopOpacity="0.6" />
                  <stop offset="70%" stopColor="#06b6d4" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#0891b2" stopOpacity="0.6" />
                </radialGradient>
              </defs>

              {/* 3D Drop Shadow */}
              <circle cx="28" cy="28" r="20" fill="black" opacity="0.35" style={{ filter: 'blur(2px)' }} transform="translate(3, 4)" />
              <rect x="39" y="39" width="6" height="20" rx="3" fill="black" opacity="0.4" style={{ filter: 'blur(2px)' }} transform="rotate(-45 39 39) translate(3, 4)" />

              {/* 3D Extrusion Bevel Ring */}
              <circle cx="28" cy="28" r="20" fill="url(#bevelGrad)" />
              
              {/* Main Beveled Rim */}
              <circle cx="28" cy="28" r="18" fill="url(#rimGrad)" />
              <circle cx="28" cy="28" r="14" fill="#0f172a" />

              {/* Glass Lens Core */}
              <circle cx="28" cy="28" r="14" fill="url(#lensGlass)" />

              {/* White Glare Arc */}
              <path d="M18 20 C20 15, 25 14, 29 16" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />

              {/* Handle Metal Bracket */}
              <path d="M38 38 L42 42" stroke="#eab308" strokeWidth="5" strokeLinecap="round" />

              {/* Cylindrical Extruded Handle */}
              <rect x="39" y="39" width="6" height="20" rx="3" fill="url(#handleGrad)" transform="rotate(-45 39 39)" />
            </svg>
          </div>
          <span className="text-xs font-semibold text-slate-400 font-sans tracking-wide">Compliance Officer Session</span>
        </div>
      </header>

      <div className="main-container flex flex-row min-h-[calc(100vh-69px)] bg-[#0b0f19]">
        <aside className="sidebar w-64 bg-[#0a0f1d]/40 border-r border-slate-900/60 p-4 flex flex-col gap-1.5 shrink-0">
          <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest px-3 mb-3">Main Menu</div>
          
          <button 
            onClick={() => setActiveTab('audit')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'audit' 
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.08)]' 
                : 'bg-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'
            }`}
          >
            <LayoutDashboard size={16} />
            <span>Audit Dashboard</span>
          </button>

          <button 
            onClick={() => setActiveTab('workspace')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'workspace' 
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.08)]' 
                : 'bg-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'
            }`}
          >
            <ShieldCheck size={16} />
            <span>Audit Workspace</span>
          </button>

          <button 
            onClick={() => setActiveTab('docs')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'docs' 
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.08)]' 
                : 'bg-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'
            }`}
          >
            <FileText size={16} />
            <span>Document Library</span>
          </button>

          <button 
            onClick={() => setActiveTab('lab')}
            className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'lab' 
                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.08)]' 
                : 'bg-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40 border border-transparent'
            }`}
          >
            <FileSpreadsheet size={16} />
            <span>Lab Test Extractor</span>
          </button>
          
          <div className="flex-1"></div>
          
          <button 
            className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold bg-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-900/40 border border-transparent transition-all"
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
        </aside>
        
        <main className="content-area flex-1 bg-[#0b0f19] p-8 overflow-y-auto">
          {activeTab === 'audit' && <AuditDashboard />}
          {activeTab === 'workspace' && (
            <AuditWorkspace 
              selectedProductId={selectedProductId}
              setSelectedProductId={setSelectedProductId}
            />
          )}
          {activeTab === 'lab' && (
            <LabTestExtractor 
              selectedProductId={selectedProductId}
              setSelectedProductId={setSelectedProductId}
              file={labFile}
              setFile={setLabFile}
              filePreviewUrl={labFilePreviewUrl}
              setFilePreviewUrl={setLabFilePreviewUrl}
              queryIntent={labQueryIntent}
              setQueryIntent={setLabQueryIntent}
              extractedData={labExtractedData}
              setExtractedData={setLabExtractedData}
              currentLabReportId={currentLabReportId}
              setCurrentLabReportId={setCurrentLabReportId}
              successMsg={labSuccessMsg}
              setSuccessMsg={setLabSuccessMsg}
              error={labError}
              setError={setLabError}
            />
          )}
          {activeTab === 'docs' && (
            <div className="animate-fade-in flex-col gap-4 flex">
              
              {/* Target Product Folder Selection */}
              <div className="card">
                <h3 className="text-md font-semibold text-white mb-2 flex items-center gap-1.5">
                  <Database size={16} className="text-blue-400" />
                  Select Target Product Folder
                </h3>
                <p className="text-xs text-secondary mb-3">
                  Upload regulation files to a specific product target directory to maintain separated, clean audit loops.
                </p>
                {products.length === 0 ? (
                  <div className="text-xs p-3 rounded bg-amber-950/20 border border-amber-800 text-amber-400">
                    No product profiles found. Please register a product profile in the <strong>Audit Dashboard</strong> first.
                  </div>
                ) : (
                  <select
                    value={selectedProductId}
                    onChange={(e) => {
                      setSelectedProductId(e.target.value);
                      setSelectedDocId(null);
                      setSuccessMsg(null);
                      setUploadError(null);
                    }}
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
                    <option value="">-- Choose Product Profile Folder --</option>
                    {products.map(prod => (
                      <option key={prod.id} value={prod.id}>{prod.name} ({prod.category})</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Ingestion zone */}
              <div className="card">
                <h2 className="text-xl mb-4">Document Library Ingestion</h2>
                <p className="text-secondary mb-4">Upload Public European Medical Device Regulation (MDR) and CER reference documents.</p>
                
                <div 
                  onClick={() => {
                    if (!selectedProductId) {
                      alert("Please select a Product Profile Folder first!");
                      return;
                    }
                    fileInputRef.current.click();
                  }}
                  style={{ 
                    border: '2px dashed var(--border-color)', 
                    borderRadius: '0.5rem', 
                    padding: '3rem', 
                    textAlign: 'center', 
                    backgroundColor: uploading ? 'rgba(0,0,0,0.2)' : 'transparent',
                    cursor: 'pointer',
                    opacity: selectedProductId ? 1 : 0.45
                  }}
                >
                  <input 
                    type="file" 
                    accept=".pdf" 
                    style={{display: 'none'}} 
                    ref={fileInputRef} 
                    onChange={handleFileUpload}
                  />
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2 text-secondary">
                       <UploadCloud size={48} className="animate-pulse" />
                       <p>Ingesting PDF, chunking images, and generating ColPali embeddings...</p>
                    </div>
                  ) : (
                    <>
                      <FileText size={48} color="var(--text-secondary)" style={{ margin: '0 auto 1rem auto' }} />
                      <p>Select PDF file for ingestion</p>
                      <button 
                        type="button" 
                        className="secondary mt-4"
                        style={{ pointerEvents: 'none' }}
                      >
                        Browse Files
                      </button>
                      {uploadError && <p style={{ color: 'var(--danger-color)', marginTop: '1rem' }}>{uploadError}</p>}
                      {successMsg && <p style={{ color: 'var(--success-color)', marginTop: '1rem' }}>{successMsg}</p>}
                    </>
                  )}
                </div>
              </div>

              {/* Regulations Document Grid filtered by selectedProduct */}
              {selectedProductId && regulations.length > 0 && (
                <div className="card">
                  <h3 className="text-lg mb-4">Ingested Regulation Documents</h3>
                  <div className="flex-col gap-2 flex">
                    {regulations.map(doc => (
                       <div key={doc.id} className="flex justify-between items-center p-3 rounded" style={{ backgroundColor: '#1f2937', border: '1px solid', borderColor: selectedDocId === doc.saceDocId ? 'var(--accent-color)' : 'transparent' }}>
                          <div>
                            <div style={{ fontWeight: 'bold' }}>{doc.name}</div>
                            <div className="text-xs text-secondary">{doc.documentType} • Ingested {new Date(doc.createdAt).toLocaleDateString()}</div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            {doc.fileUrl && (
                              <a 
                                href={doc.fileUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Download size={12} /> Download PDF
                              </a>
                            )}
                            
                            {doc.saceDocId ? (
                              selectedDocId === doc.saceDocId ? (
                                <span className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--success-color)' }}><CheckCircle size={14}/> Active Target</span>
                              ) : (
                                <button className="secondary text-xs" onClick={() => setSelectedDocId(doc.saceDocId)}>Set Active Target</button>
                              )
                            ) : (
                              <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700 font-bold uppercase">Storage Only</span>
                            )}
                          </div>
                       </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedProductId && regulations.length === 0 && (
                <div className="card text-center py-12 text-slate-500">
                  <FileText size={48} className="opacity-20 mb-3" style={{ margin: '0 auto' }} />
                  <h4 className="text-sm font-semibold text-slate-400">No Ingested Regulations</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm" style={{ margin: '0.25rem auto 0 auto' }}>
                    Upload reference standard PDFs to catalog them inside this product's secure directory partition.
                  </p>
                </div>
              )}

              {!selectedProductId && (
                <div className="card text-center py-12 text-slate-500">
                  <Database size={48} className="opacity-15 mb-3" style={{ margin: '0 auto' }} />
                  <h4 className="text-sm font-semibold text-slate-400">Folder Not Selected</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Select a product folder from the dropdown filter above to view and upload corresponding regulatory documents.
                  </p>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
}

export default App;
