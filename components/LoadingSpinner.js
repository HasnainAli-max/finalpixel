// components/LoadingSpinner.js
import React from 'react';

const LoadingSpinner = () => {
  return (
    <div className="flex justify-center items-center mt-8">
      <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-blue-500 border-solid"></div>
      <span className="ml-3 text-blue-600 dark:text-blue-300 font-semibold">Comparing...</span>
    </div>
  );
};

export default LoadingSpinner;
