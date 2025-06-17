'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

interface Props {
  onDataExtracted: (data: any, plan?: any) => void;
}

export default function InsuranceCardUpload({ onDataExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setLoading(true);
    setError('');
    setProgress('Uploading insurance card...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Update progress message after a delay to show async processing
      setTimeout(() => {
        if (loading) setProgress('Analyzing card details...');
      }, 2000);

      const response = await fetch('/api/ocr', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        // Pass both extracted data and matched plan
        onDataExtracted(data.extracted, data.matchedPlan);
        
        // Show success feedback
        setProgress('✓ Card processed successfully!');
        setTimeout(() => setProgress(''), 2000);
      }
    } catch (err) {
      setError('Failed to process image. Please try again.');
      console.error('Upload error:', err);
    } finally {
      setLoading(false);
    }
  }, [onDataExtracted, loading]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png'],
    },
    maxFiles: 1,
    disabled: loading, // Disable dropzone while processing
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
          transition-colors duration-200
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
          ${loading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        {loading ? (
          <div className="space-y-3">
            <div className="flex justify-center mb-4">
              {/* Simple loading spinner */}
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
            <p className="text-lg font-medium">{progress}</p>
            <p className="text-sm text-gray-500">
              This may take a few seconds...
            </p>
          </div>
        ) : isDragActive ? (
          <div>
            <p className="text-lg text-blue-600 font-medium">
              Drop your insurance card here...
            </p>
          </div>
        ) : (
          <div>
            <svg
              className="mx-auto h-16 w-16 text-gray-400 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
              />
            </svg>
            <p className="text-lg mb-2 font-medium">
              Drag & drop your insurance card here
            </p>
            <p className="text-sm text-gray-500 mb-1">
              or click to select from your device
            </p>
            <p className="text-xs text-gray-400">
              Supports JPG, JPEG, PNG (Max 5MB)
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {progress && !loading && progress.includes('✓') && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-600 text-sm font-medium">{progress}</p>
        </div>
      )}
    </div>
  );
}