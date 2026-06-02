'use client';

import React, { useState, useRef, useEffect } from 'react';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<string>('xlsx');
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [timer, setTimer] = useState<number>(0);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Trigger clock lifecycle hooks while processing state updates
  useEffect(() => {
    if (loading) {
      setTimer(0);
      timerRef.current = setInterval(() => {
        setTimer((prevTime) => prevTime + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading]);

  // Helper helper to convert total elapsed seconds to 00:00 visual strings
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      console.log("📁 [FRONTEND LOG] Staged:", selectedFile.name);
      setFile(selectedFile);
      setMessage(`Staged file: ${selectedFile.name}`);
    }
  };

  const handleConvert = async () => {
    if (!file) {
      alert("Please upload an image first!");
      return;
    }

    console.log("🚀 [FRONTEND LOG] Running conversion pipeline...");
    setLoading(true);
    setMessage("AI is processing your document details... Please watch the timer below.");

    const formData = new FormData();
    formData.append('file', file);
    formData.append('output_format', format);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/convert', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(`Server returned code error: ${response.status}`);

      if (format === 'json') {
        const jsonResult = await response.json();
        const blob = new Blob([JSON.stringify(jsonResult, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'extracted_data.json';
        a.click();
      } else {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `extracted_data.${format}`;
        a.click();
      }

      console.log(`🏁 [FRONTEND LOG] Finished exporting extracted_data.${format}`);
      setMessage("Success! System extraction finished. Check your system downloads folder.");
    } catch (error) {
      console.error("❌ [FRONTEND LOG] Execution failure:", error);
      setMessage("An error occurred during extraction. Check your backend console logs.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: '600px', margin: '50px auto', padding: '20px', fontFamily: 'sans-serif', border: '1px solid #ccc', borderRadius: '8px', backgroundColor: '#fff' }}>
      <h2>📈 AI Financial Data Converter</h2>
      <p style={{ color: '#666' }}>Convert images/invoices to modern structured layouts instantly.</p>
      
      <div style={{ margin: '20px 0' }}>
        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>1. Upload Document Image:</label>
        <input type="file" accept="image/*" onChange={handleFileChange} style={{ width: '100%' }} />
      </div>

      <div style={{ margin: '20px 0' }}>
        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>2. Select Output File Format:</label>
        <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ padding: '8px', width: '100%', borderRadius: '4px', border: '1px solid #ccc' }}>
          <option value="xlsx">Excel Spreadsheet (.xlsx)</option>
          <option value="csv">Comma Separated Values (.csv)</option>
          <option value="pdf">Document Document PDF (.pdf)</option>
          <option value="txt">Plain Text File (.txt)</option>
          <option value="json">Raw Structured Data (.json)</option>
        </select>
      </div>

      <button 
        onClick={handleConvert} 
        disabled={loading}
        style={{
          width: '100%', 
          padding: '12px', 
          backgroundColor: loading ? '#666' : '#0070f3', 
          color: 'white', 
          border: 'none', 
          borderRadius: '4px', 
          fontSize: '16px', 
          cursor: loading ? 'not-allowed' : 'pointer',
          fontWeight: 'bold'
        }}
      >
        {loading ? 'AI Processing Data Stream...' : 'Convert & Download File'}
      </button>

      {/* Dynamic Processing Status Widget Block */}
      {loading && (
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fff8e1', borderRadius: '4px', borderLeft: '4px solid #ffb300', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#b78103', fontFamily: 'monospace' }}>
            ⏱️ Elapsed Time: {formatTime(timer)}
          </div>
          <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: '#666' }}>
            The local vision model is processing the image pixels. Please do not close this window.
          </p>
        </div>
      )}

      {message && !loading && (
        <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#f0f0f0', borderRadius: '4px', fontSize: '13px', fontFamily: 'monospace', borderLeft: '4px solid #0070f3' }}>
          {message}
        </div>
      )}
    </main>
  );
}