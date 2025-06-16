'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

interface Props {
  onDataExtracted: (data: any) => void;
}

export default function InsuranceCardUpload({ onDataExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setLoading(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/ocr', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        onDataExtracted(data.extracted);
      }
    } catch (err) {
      setError('Failed to process image');
    } finally {
      setLoading(false);
    }
  }, [onDataExtracted]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png'],
    },
    maxFiles: 1,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
          transition-colors duration-200
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
        `}
      >
        <input {...getInputProps()} />
        
        {loading ? (
          <p>Processing your insurance card...</p>
        ) : isDragActive ? (
          <p>Drop your insurance card here...</p>
        ) : (
          <div>
            <p className="text-lg mb-2">
              Drag & drop your insurance card here
            </p>
            <p className="text-sm text-gray-500">
              or click to select from your device
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-4 text-red-600">{error}</p>
      )}
    </div>
  );
}