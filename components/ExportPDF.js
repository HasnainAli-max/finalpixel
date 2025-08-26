// components/ExportPDF.js
import React, { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import ReactMarkdown from 'react-markdown';

const ExportPDF = ({ result }) => {
  const componentRef = useRef();

  const handlePrint = useReactToPrint({
    content: () => componentRef.current,
    documentTitle: 'PixelProof Visual Bug Report',
  });

  return (
    <div className="mt-4">
      <button
        onClick={handlePrint}
        className="bg-blue-500 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded"
      >
        Export as PDF
      </button>
      <div ref={componentRef} className="hidden print:block text-black mt-4">
        <h2 className="text-xl font-bold mb-2">Visual Bug Report</h2>
        <div className="prose max-w-none">
          <ReactMarkdown>{result}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

export default ExportPDF;
