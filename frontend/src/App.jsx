import React, { useState, useRef } from 'react';
import AuditDashboard from './components/AuditDashboard';
import { ShieldCheck, LayoutDashboard, FileText, Settings, UploadCloud, CheckCircle } from 'lucide-react';
import axios from 'axios';
import './index.css';

const API_BASE = 'http://localhost:8000';

function App() {
  const [activeTab, setActiveTab] = useState('docs');
  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(null);
  
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const fileInputRef = useRef(null);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_BASE}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      if (response.data.error) {
        throw new Error(response.data.error);
      }
      
      const newDoc = {
        id: response.data.document_id,
        name: file.name,
        pages: response.data.pages,
        date: new Date().toLocaleString()
      };
      
      setDocuments(prev => [...prev, newDoc]);
      setSelectedDocId(newDoc.id);
      setUploading(false);
      event.target.value = null; // reset
    } catch (err) {
      console.error(err);
      setUploadError(err.response?.data?.error || err.message || 'Failed to upload document');
      setUploading(false);
      event.target.value = null; // reset
    }
  };

  return (
    <>
      <header className="app-header">
        <div className="logo">
          <ShieldCheck size={28} color="var(--accent-color)" />
          SACE <span>Engine</span>
        </div>
        <div className="user-profile">
          <div className="text-sm text-secondary">Compliance Officer Session</div>
        </div>
      </header>

      <div className="main-container">
        <aside className="sidebar p-4 gap-2">
          <div className="text-xs text-secondary mb-4" style={{textTransform: 'uppercase', letterSpacing: '1px'}}>Main Menu</div>
          <button 
            className={activeTab === 'audit' ? '' : 'secondary'}
            onClick={() => setActiveTab('audit')}
            style={{ width: '100%', justifyContent: 'flex-start', marginBottom: '0.5rem' }}
          >
            <LayoutDashboard size={18} />
            Audit Dashboard
          </button>
          <button 
            className={activeTab === 'docs' ? '' : 'secondary'}
            onClick={() => setActiveTab('docs')}
            style={{ width: '100%', justifyContent: 'flex-start', marginBottom: '0.5rem' }}
          >
            <FileText size={18} />
            Document Library
          </button>
          <div style={{ flex: 1 }}></div>
          <button className="secondary" style={{ width: '100%', justifyContent: 'flex-start' }}>
            <Settings size={18} />
            Settings
          </button>
        </aside>
        
        <main className="content-area">
          {activeTab === 'audit' && <AuditDashboard selectedDocId={selectedDocId} documents={documents} />}
          {activeTab === 'docs' && (
            <div className="animate-fade-in flex-col gap-4 flex">
              <div className="card">
                <h2 className="text-xl mb-4">Document Library</h2>
                <p className="text-secondary mb-4">Upload Public European Medical Device Regulation (MDR) and CER documents.</p>
                
                <div style={{ border: '2px dashed var(--border-color)', borderRadius: '0.5rem', padding: '3rem', textAlign: 'center', backgroundColor: uploading ? 'rgba(0,0,0,0.2)' : 'transparent' }}>
                  <input 
                    type="file" 
                    accept=".pdf" 
                    style={{display: 'none'}} 
                    ref={fileInputRef} 
                    onChange={handleFileUpload}
                  />
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2 text-secondary">
                       <UploadCloud size={48} style={{ animation: 'fadeIn 1s infinite alternate' }} />
                       <p>Processing PDF, chunking images, and generating ColPali embeddings...</p>
                    </div>
                  ) : (
                    <>
                      <FileText size={48} color="var(--text-secondary)" style={{ margin: '0 auto 1rem auto' }} />
                      <p>Select PDF file for ingestion</p>
                      <button className="secondary mt-4" onClick={() => fileInputRef.current.click()}>
                        Browse Files
                      </button>
                      {uploadError && <p style={{ color: 'var(--danger-color)', marginTop: '1rem' }}>{uploadError}</p>}
                    </>
                  )}
                </div>
              </div>

              {documents.length > 0 && (
                <div className="card">
                  <h3 className="text-lg mb-4">Ingested Documents</h3>
                  <div className="flex-col gap-2 flex">
                    {documents.map(doc => (
                       <div key={doc.id} className="flex justify-between items-center p-3 rounded" style={{ backgroundColor: '#1f2937', border: '1px solid', borderColor: selectedDocId === doc.id ? 'var(--accent-color)' : 'transparent' }}>
                          <div>
                            <div style={{ fontWeight: 'bold' }}>{doc.name}</div>
                            <div className="text-xs text-secondary">{doc.pages} pages • Ingested {doc.date}</div>
                          </div>
                          {selectedDocId === doc.id ? (
                            <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--success-color)' }}><CheckCircle size={14}/> Active Target</span>
                          ) : (
                            <button className="secondary text-sm" onClick={() => setSelectedDocId(doc.id)}>Set Active</button>
                          )}
                       </div>
                    ))}
                  </div>
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
