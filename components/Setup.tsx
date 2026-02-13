import React, { useState } from 'react';
import { Flame } from 'lucide-react';
import { initializeFirebase } from '../firebase-config';

interface SetupProps {
  onComplete: () => void;
}

const Setup: React.FC<SetupProps> = ({ onComplete }) => {
  const [configJson, setConfigJson] = useState('');
  const [error, setError] = useState('');

  const handleInit = () => {
    try {
      const config = JSON.parse(configJson);
      if (initializeFirebase(config)) {
        onComplete();
      } else {
        setError('Failed to initialize. Check console.');
      }
    } catch (e) {
      setError('Invalid JSON format.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4">
      <div className="max-w-md w-full bg-gray-800 p-8 rounded-lg shadow-xl border border-gray-700">
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-blue-600 rounded-full">
            <Flame size={32} />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-center mb-4">Setup FireGram</h2>
        <p className="text-gray-400 text-sm text-center mb-6">
          Paste your Firebase Configuration JSON object below to start.
          <br />
          (Authentication, Firestore, and Storage must be enabled in your Firebase Console)
        </p>
        
        <textarea
          className="w-full h-48 bg-gray-900 border border-gray-700 rounded p-3 text-xs font-mono text-green-400 focus:outline-none focus:border-blue-500"
          placeholder='{ "apiKey": "...", "authDomain": "..." }'
          value={configJson}
          onChange={(e) => setConfigJson(e.target.value)}
        />
        
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

        <button
          onClick={handleInit}
          className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition"
        >
          Initialize App
        </button>
      </div>
    </div>
  );
};

export default Setup;