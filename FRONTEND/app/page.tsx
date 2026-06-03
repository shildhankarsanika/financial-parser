'use client';

import React, { useState, useRef, useEffect } from 'react';
// Import browser formatting dependencies
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable'; 

interface RowData {
  column_a: string;
  column_b: string;
  column_c: string;
  column_d: string;
}

interface TableStructure {
  table_title: string;
  headers: string[];
  rows: RowData[];
}

interface ApiResponse {
  raw_text: string;
  structured_table: TableStructure;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [timer, setTimer] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'table' | 'text'>('table');
  const [copied, setCopied] = useState<boolean>(false);
  const [downloadFormat, setDownloadFormat] = useState<string>('xlsx');
  
  // App Extraction Results State Holder
  const [resultData, setResultData] = useState<ApiResponse | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // CRITICAL: Reference to store the active abort controller
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (loading) {
      setTimer(0);
      timerRef.current = setInterval(() => setTimer((prev) => prev + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Fixed Reset Logic Handler on New Image Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      // 1. If there is an ongoing network request, kill it instantly!
      if (abortControllerRef.current) {
        console.log("🛑 [FRONTEND LOG] Aborting ongoing extraction for new image hot-swap.");
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
      
      // 2. Reset the layout states back to baseline
      setResultData(null); 
      setLoading(false);
    }
  };

  const handleConvertPipeline = async () => {
    if (!file) return;

    // 1. Safety Check: If user clicks this while another one is running, abort the old one first
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 2. Instantiate a fresh AbortController for this specific request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setResultData(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Pass the signal token to the fetch operation
      const response = await fetch('http://localhost:8000/api/convert', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Conversion processing failure.");
      const data: ApiResponse = await response.json();
      setResultData(data);
    } catch (error: any) {
      // Ignore errors caused by our intentional abort commands
      if (error.name === 'AbortError') {
        console.log("ℹ️ [FRONTEND LOG] Request successfully aborted.");
        return; 
      }
      alert("Extraction encountered an issue. Please verify Ollama infrastructure.");
      console.error(error);
    } finally {
      // Only clean up loading states if this specific controller wasn't aborted/replaced
      if (abortControllerRef.current === controller) {
        setLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  const copyTextToClipboard = () => {
    if (!resultData) return;
    navigator.clipboard.writeText(resultData.raw_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- CLIENT-SIDE FORMAT COMPILER ENGINE DRIVERS ---
  const handleDownloadFile = () => {
    if (!resultData) return;
    
    const table = resultData.structured_table;
    const rawText = resultData.raw_text;
    const title = table.table_title || "extracted_document";
    const sanitizeFilename = title.toLowerCase().replace(/[^a-z0-9]/gi, '_');

    switch (downloadFormat) {
      case 'xlsx': {
        const worksheetData = [table.headers];
        table.rows.forEach(r => {
          worksheetData.push([r.column_a, r.column_b, r.column_c, r.column_d]);
        });
        
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        XLSX.utils.book_append_sheet(workbook, worksheet, "Extracted Data");
        XLSX.writeFile(workbook, `${sanitizeFilename}.xlsx`);
        break;
      }

      case 'csv': {
        const csvRows = [table.headers.join(',')];
        table.rows.forEach(r => {
          csvRows.push([`"${r.column_a}"`, `"${r.column_b}"`, `"${r.column_c}"`, `"${r.column_d}"`].join(','));
        });
        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${sanitizeFilename}.csv`;
        link.click();
        break;
      }

      case 'pdf': {
        const doc = new jsPDF();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        doc.setTextColor(30, 64, 175); 
        doc.text(table.table_title || "Extracted Financial Report", 14, 20);
        
        const tableBody = table.rows.map(r => [r.column_a, r.column_b, r.column_c, r.column_d]);
        
        autoTable(doc, {
          startY: 28,
          head: [table.headers],
          body: tableBody,
          theme: 'striped',
          headStyles: { fillColor: [30, 64, 175] },
          styles: { font: "helvetica", fontSize: 9, cellPadding: 4 },
        });
        
        doc.save(`${sanitizeFilename}.pdf`);
        break;
      }

      case 'txt': {
        const blob = new Blob([rawText], { type: 'text/plain;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${sanitizeFilename}.txt`;
        link.click();
        break;
      }

      case 'json': {
        const blob = new Blob([JSON.stringify(resultData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${sanitizeFilename}.json`;
        link.click();
        break;
      }

      default:
        alert("Unsupported format selected.");
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: 'system-ui, sans-serif', padding: '40px 20px', color: '#0f172a' }}>
      
      <header style={{ maxWidth: '1200px', margin: '0 auto 30px auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#1e3a8a', margin: '0 0 8px 0' }}>📈 FinParse Interactive Workspace</h1>
        <p style={{ fontSize: '15px', color: '#64748b', margin: 0 }}>Upload records, preview structural models, copy snippets, or export files on-demand.</p>
      </header>

      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr', gap: '30px' }}>
        
        {/* UPPER PANEL: Control Form Dropzone Card Grid */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button 
              onClick={() => fileInputRef.current?.click()}
              style={{ backgroundColor: '#1e40af', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}
            >
              📁 Choose File Image
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
            <span style={{ fontSize: '14px', color: '#475569', fontWeight: '500' }}>
              {file ? file.name : "No document staged into memory."}
            </span>
          </div>

          <button 
            onClick={handleConvertPipeline} disabled={!file}
            style={{
              backgroundColor: !file ? '#e2e8f0' : '#10b981',
              color: 'white', border: 'none', padding: '12px 24px', borderRadius: '6px', fontSize: '15px', fontWeight: '700', cursor: !file ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? '🔄 Restarting/Processing Stream...' : 'Extract & Analyze Document'}
          </button>
        </div>

        {/* LOADING TIMER PROGRESS TRACKER BAR BLOCK */}
        {loading && (
          <div style={{ padding: '20px', backgroundColor: '#fffbeb', borderRadius: '8px', borderLeft: '5px solid #f59e0b', textAlign: 'center' }}>
            <span style={{ fontSize: '24px', fontWeight: '800', fontFamily: 'monospace', color: '#b45309' }}>⏱️ Run Execution Clock: {formatTime(timer)}</span>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#78350f' }}>Ollama is running internal matrix calculations. Choosing a new file will immediately cancel this processing run.</p>
          </div>
        )}

        {/* MAIN RESULTS DISPLAY AND ACTION WORKSPACE GRID BOX */}
        {resultData && !loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'window.innerWidth > 900 ? "350px 1fr" : "1fr"', gap: '30px' }}>
            
            {/* LEFT: Image verification preview element */}
            <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', height: 'fit-content' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#475569', textTransform: 'uppercase' }}>Source Verification File Image</h4>
              {previewUrl && <img src={previewUrl} alt="source" style={{ width: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: '6px', border: '1px solid #e2e8f0' }} />}
            </div>

            {/* RIGHT: Tabbed Workspace Window Panel */}
            <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              
              {/* Tab Navigation header bar wrapper */}
              <div style={{ backgroundColor: '#f1f5f9', padding: '12px 20px 0 20px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <button 
                    onClick={() => setActiveTab('table')}
                    style={{ padding: '10px 16px', border: 'none', borderBottom: activeTab === 'table' ? '3px solid #1e40af' : '3px solid transparent', backgroundColor: 'transparent', fontWeight: activeTab === 'table' ? '700' : '500', color: activeTab === 'table' ? '#1e40af' : '#64748b', cursor: 'pointer' }}
                  >
                    📊 Tabular Grid View
                  </button>
                  <button 
                    onClick={() => setActiveTab('text')}
                    style={{ padding: '10px 16px', border: 'none', borderBottom: activeTab === 'text' ? '3px solid #1e40af' : '3px solid transparent', backgroundColor: 'transparent', fontWeight: activeTab === 'text' ? '700' : '500', color: activeTab === 'text' ? '#1e40af' : '#64748b', cursor: 'pointer' }}
                  >
                    📝 Raw Transcribed Text View
                  </button>
                </div>

                {/* Unified Dropdown Selection Actions Toolbar */}
                <div style={{ paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {activeTab === 'text' && (
                    <button onClick={copyTextToClipboard} style={{ backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', padding: '8px 14px', borderRadius: '4px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                      {copied ? '✅ Text Copied!' : '📋 Copy Text Content'}
                    </button>
                  )}

                  <select 
                    value={downloadFormat}
                    onChange={(e) => setDownloadFormat(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '13px', fontWeight: '600', color: '#334155', cursor: 'pointer', outline: 'none' }}
                  >
                    <option value="xlsx">📊 Excel Spreadsheet (.xlsx)</option>
                    <option value="csv">📄 Comma Separated Values (.csv)</option>
                    <option value="pdf">🗂️ Document Document PDF (.pdf)</option>
                    <option value="txt">📝 Plain Text Layout (.txt)</option>
                    <option value="json">💻 Structured Data Object (.json)</option>
                  </select>

                  <button 
                    onClick={handleDownloadFile} 
                    style={{ backgroundColor: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}
                  >
                    📥 Download File
                  </button>
                </div>
              </div>

              {/* Dynamic View Body Window Box Handling Rendering */}
              <div style={{ padding: '24px', flex: 1, minHeight: '350px', overflowY: 'auto' }}>
                {activeTab === 'table' ? (
                  <div>
                    <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', color: '#1e3a8a' }}>
                      {resultData.structured_table.table_title || "Processed Report Grid Data Matrix"}
                    </h3>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#1e40af', color: '#ffffff' }}>
                            {resultData.structured_table.headers.map((h, idx) => (
                              <th key={idx} style={{ padding: '10px 12px', border: '1px solid #1e3a8a' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {resultData.structured_table.rows.map((row, idx) => (
                            <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                              <td style={{ padding: '10px 12px', border: '1px solid #e2e8f0' }}>{row.column_a}</td>
                              <td style={{ padding: '10px 12px', border: '1px solid #e2e8f0' }}>{row.column_b}</td>
                              <td style={{ padding: '10px 12px', border: '1px solid #e2e8f0' }}>{row.column_c}</td>
                              <td style={{ padding: '10px 12px', border: '1px solid #e2e8f0' }}>{row.column_d}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '14px', lineHeight: '1.6', backgroundColor: '#f8fafc', padding: '20px', borderRadius: '6px', border: '1px solid #e2e8f0', color: '#334155' }}>
                    {resultData.raw_text}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}