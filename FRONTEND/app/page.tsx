'use client';

import React, { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [format, setFormat] = useState<string>('xlsx');
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [statusType, setStatusType] = useState<'success' | 'error' | 'info' | 'none'>('none');
  const [timer, setTimer] = useState<number>(0);
  const [dragActive, setDragActive] = useState<boolean>(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const processFile = (selectedFile: File) => {
    if (!selectedFile.type.startsWith('image/')) {
      setMessage("❌ Please upload a valid image file (PNG, JPG).");
      setStatusType('error');
      return;
    }
    console.log("📁 [FRONTEND LOG] Staged:", selectedFile.name);
    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
    setMessage(`Staged: ${selectedFile.name} (${Math.round(selectedFile.size / 1024)} KB)`);
    setStatusType('info');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) processFile(e.target.files[0]);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  };

  const handleConvert = async () => {
    if (!file) {
      alert("Please upload an image first!");
      return;
    }

    setLoading(true);
    setStatusType('info');
    setMessage("AI Vision parser active... Crunching structural pixels.");

    const formData = new FormData();
    formData.append('file', file);
    formData.append('output_format', format);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/convert', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(`Server returned error code: ${response.status}`);

      if (format === 'json') {
        const jsonResult = await response.json();
        const blob = new Blob([JSON.stringify(jsonResult, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'extracted_data.json'; a.click();
      } else {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `extracted_data.${format}`; a.click();
      }

      setMessage("🎉 Success! Your converted file has been generated and downloaded.");
      setStatusType('success');
    } catch (error) {
      console.error("❌ [FRONTEND LOG] Failure:", error);
      setMessage("❌ Extraction failed. Please verify that Ollama is up and running in your terminal.");
      setStatusType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f4f6f8', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '40px 20px', color: '#1e293b' }}>
      
      {/* Header Container */}
      <header style={{ maxWidth: '1100px', margin: '0 auto 30px auto', textAlign: 'center' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', margin: '0 0 10px 0', letterSpacing: '-0.5px' }}>
          📈 FinParse <span style={{ color: '#0070f3', fontWeight: '400' }}>Studio</span>
        </h1>
        <p style={{ fontSize: '16px', color: '#64748b', margin: 0 }}>
          Convert financial statements, tables, and receipts into ready-to-use documents instantly using local AI.
        </p>
      </header>

      {/* Responsive Grid Layout */}
      <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'window.innerWidth > 768 ? "1fr 1fr" : "1fr"', gap: '30px' }}>
        
        {/* Left Card: Input Panel */}
        <section style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '30px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: '600', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px' }}>
            1. Document Upload
          </h3>
          
          {/* Drag & Drop Zone */}
          <div 
            onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragActive ? '#0070f3' : '#cbd5e1'}`,
              borderRadius: '8px', padding: '40px 20px', textAlign: 'center', cursor: 'pointer',
              backgroundColor: dragActive ? '#f0f7ff' : '#f8fafc',
              transition: 'all 0.2s ease', position: 'relative'
            }}
          >
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>📷</div>
            <p style={{ fontWeight: '600', margin: '0 0 5px 0', color: '#475569' }}>Drag & drop your document image here</p>
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>or click to browse local files (PNG, JPG)</p>
          </div>

          {/* Configuration Fields */}
          <div style={{ marginTop: '24px' }}>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#475569', fontSize: '14px' }}>
              2. Target Output Format
            </label>
            <select 
              value={format} onChange={(e) => setFormat(e.target.value)} 
              style={{ padding: '12px', width: '100%', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', fontSize: '15px', color: '#334155', cursor: 'pointer', outline: 'none' }}
            >
              <option value="xlsx">📊 Excel Spreadsheet (.xlsx)</option>
              <option value="csv">📄 Comma Separated Values (.csv)</option>
              <option value="pdf">🗂️ Document Document PDF (.pdf)</option>
              <option value="txt">📝 Plain Text Layout (.txt)</option>
              <option value="json">💻 Structured Data Object (.json)</option>
            </select>
          </div>

          <button 
            onClick={handleConvert} disabled={loading || !file}
            style={{
              width: '100%', padding: '14px', marginTop: '24px',
              backgroundColor: loading ? '#94a3b8' : !file ? '#e2e8f0' : '#0070f3',
              color: !file && !loading ? '#94a3b8' : 'white',
              border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: '600',
              cursor: loading || !file ? 'not-allowed' : 'pointer', transition: 'background-color 0.2s'
            }}
          >
            {loading ? 'AI Processing Data Stream...' : 'Convert & Download File'}
          </button>
        </section>

        {/* Right Card: Live Workspace Monitor & Status */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Preview Panel */}
          <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px', flex: 1, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', minHeight: '250px', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', fontWeight: '600', color: '#334155' }}>
              🎯 Live Preview Workspace
            </h3>
            <div style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '10px' }}>
              {previewUrl ? (
                <img src={previewUrl} alt="Staged Preview" style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '4px' }} />
              ) : (
                <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>No image loaded into memory yet.</p>
              )}
            </div>
          </div>

          {/* Loading Clock & Notification Widget */}
          {(loading || statusType !== 'none') && (
            <div style={{ 
              padding: '16px', borderRadius: '8px', borderLeft: '4px solid',
              borderColor: loading ? '#ffb300' : statusType === 'success' ? '#10b981' : statusType === 'error' ? '#ef4444' : '#0070f3',
              backgroundColor: loading ? '#fffbeb' : statusType === 'success' ? '#ecfdf5' : statusType === 'error' ? '#fef2f2' : '#f0f7ff'
            }}>
              {loading && (
                <div style={{ textAlign: 'center', marginBottom: '10px', borderBottom: '1px solid #fef3c7', paddingBottom: '10px' }}>
                  <span style={{ fontSize: '26px', fontWeight: '700', fontFamily: 'monospace', color: '#b78103' }}>
                    ⏱️ {formatTime(timer)}
                  </span>
                  <div style={{ fontSize: '12px', color: '#d97706', marginTop: '4px', fontWeight: '500' }}>Local LLM Processing Time Elapsing...</div>
                </div>
              )}
              <p style={{ margin: 0, fontSize: '14px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#1e293b', lineHeight: '1.5' }}>
                {message}
              </p>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}